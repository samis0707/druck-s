import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { extractOrders, importHistoryBundle } from "@/lib/historyImport";
import { measureRequest } from "@/lib/measure";
import { CATEGORY_VALUES, generateNote, latestNote } from "@/lib/assistantNote";
import {
  DEFAULT_ASSISTANT_INSTRUCTIONS,
  assembleSystemPrompt,
  validateAssistantInstructions,
} from "@/lib/assistantPrompt";
import { getSetting, listSettingHistory, resetSetting, setSetting } from "@/lib/settings";
import { addFile, createDraft, getRequest, submitDraft } from "@/lib/requests/store";

/**
 * Section 7 tests (assistant + history). Model calls are stubbed; no API key needed.
 * Run: npm run test:int
 */
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<export>
  <auftraege>
    <auftrag><Nummer>981</Nummer><Datum>2025-11-02</Datum><Bezeichnung>Namentag</Bezeichnung><Menge>130</Menge></auftrag>
    <auftrag><Nummer>977</Nummer><Datum>2025-09-14</Datum><Bezeichnung>Flyer A5</Bezeichnung><Menge>500</Menge></auftrag>
  </auftraege>
</export>`;

async function wipeUserRows(id: string, email: string) {
  await query(`DELETE FROM verification WHERE identifier LIKE '%' || $1 || '%'`, [email]);
  await query(`DELETE FROM session WHERE "userId" = $1`, [id]);
  await query("DELETE FROM assistant_notes WHERE request_id IN (SELECT id FROM requests WHERE customer_id = $1)", [id]);
  await query("DELETE FROM history_imports WHERE identity_id = $1", [id]);
  await query("DELETE FROM requests WHERE customer_id = $1", [id]);
  await query(`DELETE FROM "user" WHERE id = $1`, [id]);
}

async function makeCustomer(email: string): Promise<string> {
  const existing = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  for (const row of existing.rows) {
    await wipeUserRows(row.id, email);
  }
  const res = await query<{ id: string }>(
    `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), LOWER($1), 'T', 'customer', 'customer') RETURNING id`,
    [email],
  );
  return res.rows[0].id;
}

async function wipeCustomer(id: string, email: string) {
  await wipeUserRows(id, email);
}

async function xlsxBytes(rowsPerSheet: number[]): Promise<Buffer> {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `<workbook><sheets>${rowsPerSheet.map((_, i) => `<sheet name="S${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
  };
  rowsPerSheet.forEach((rows, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<worksheet><sheetData>${"<row><c><v>1</v></c></row>".repeat(rows)}</sheetData></worksheet>`,
    );
  });
  return Buffer.from(zipSync(files));
}

describe("7.1 history ingestion", () => {
  it("derives JSONL and markdown deterministically, raw retained", async () => {
    const first = extractOrders(SAMPLE_XML);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ id: "981", product: "Namentag", quantity: 130 });
    const again = extractOrders(SAMPLE_XML);
    expect(again).toEqual(first);

    const customerId = await makeCustomer("hist@example.com");
    const { import: record, orders } = await importHistoryBundle({
      identityId: customerId,
      xml: SAMPLE_XML,
      fileName: "mis.xml",
    });
    expect(record.orderCount).toBe(2);
    expect(orders).toHaveLength(2);
    // Raw XML retained verbatim in storage.
    const { getStorage, bucketName } = await import("@/lib/storage");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const out = await getStorage().send(
      new GetObjectCommand({ Bucket: bucketName(), Key: record.rawKey }),
    );
    const raw = Buffer.from(await out.Body!.transformToByteArray()).toString("utf8");
    expect(raw).toBe(SAMPLE_XML);
    await wipeCustomer(customerId, "hist@example.com");
  });
});

describe("7.2 measurers", () => {
  it("counts rows and extracts text numbers from artifacts", async () => {
    const customerId = await makeCustomer("meas@example.com");
    const draft = await createDraft({
      productHint: "name-tag",
      freeText: "130 total, 20 blanko",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await addFile(draft.id, {
      fileName: "data.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: await xlsxBytes([150, 12]),
    });
    const measured = await measureRequest(draft.id);
    expect(measured.fileCount).toBe(1);
    expect(measured.files[0].rows).toBe(162);
    expect(measured.textNumbers).toContain(130);
    expect(measured.textNumbers).toContain(20);
    await wipeCustomer(customerId, "meas@example.com");
  });
});

function stubChat(bullets: { text: string; sources: { kind: string; ref: string }[] }[]) {
  return async () => JSON.stringify({ bullets });
}

describe("7.3 frozen note", () => {
  it("stores once, returns frozen, regenerates on new input, never transitions", async () => {
    const customerId = await makeCustomer("note@example.com");
    await importHistoryBundle({ identityId: customerId, xml: SAMPLE_XML, fileName: "mis.xml" });
    const draft = await createDraft({
      productHint: "name-tag",
      freeText: "130 total",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await addFile(draft.id, {
      fileName: "data.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: await xlsxBytes([150]),
    });
    await submitDraft(draft.id, { type: "system" });
    const eventsBefore = await query<{ count: string }>(
      "SELECT COUNT(*) FROM request_events WHERE request_id = $1",
      [draft.id],
    );
    const chat = stubChat([
      {
        text: "Your note says 130 but data.xlsx has 150 rows — did you mean 150, or are 20 rows headers? Similar to #981 (2025-11-02, 130 name-tags).",
        sources: [
          { kind: "file", ref: "data.xlsx" },
          { kind: "text", ref: "free-text" },
          { kind: "history", ref: "history:md:3" },
        ],
      },
    ]);
    const first = await generateNote(draft.id, { chat });
    expect(first.bullets).toHaveLength(1);
    expect(first.historyState).toBe("present");
    const frozen = await generateNote(draft.id, {
      chat: stubChat([{ text: "different", sources: [{ kind: "text", ref: "free-text" }] }]),
    });
    expect(frozen.id).toBe(first.id);
    // New input (added file) regenerates while RECEIVED.
    await addFile(draft.id, { fileName: "b.txt", mimeType: "text/plain", bytes: Buffer.from("x") });
    const second = await generateNote(draft.id, { chat });
    expect(second.id).not.toBe(first.id);
    // Never transitions or sends: event count grew only by file ops (none) — note adds zero events.
    const eventsAfter = await query<{ count: string }>(
      "SELECT COUNT(*) FROM request_events WHERE request_id = $1",
      [draft.id],
    );
    expect(eventsAfter.rows[0].count).toBe(eventsBefore.rows[0].count);
    expect((await getRequest(draft.id))?.status).toBe("RECEIVED");
    expect(await latestNote(draft.id)).toMatchObject({ id: second.id });
    await wipeCustomer(customerId, "note@example.com");
  });
});

describe("7.4 content filter", () => {
  it("rejects prices, sourceless claims, and undisclosed missing history", async () => {
    const customerId = await makeCustomer("filter@example.com");
    const draft = await createDraft({
      productHint: "flyer",
      freeText: "500 pcs",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await submitDraft(draft.id, { type: "system" });
    const src = [{ kind: "text", ref: "free-text" }];
    await expect(
      generateNote(draft.id, {
        chat: stubChat([{ text: "This will cost EUR 120.", sources: src }]),
      }),
    ).rejects.toThrow(/commercial/);
    await expect(
      generateNote(draft.id, { chat: stubChat([{ text: "Something.", sources: [] }]) }),
    ).rejects.toThrow(/sources/);
    await expect(
      generateNote(draft.id, {
        chat: stubChat([{ text: "Counts look fine.", sources: src }]),
      }),
    ).rejects.toThrow(/history/);
    const ok = await generateNote(draft.id, {
      chat: stubChat([
        { text: "Counts look fine. No history on file, staff will compare manually.", sources: src },
      ]),
    });
    expect(ok.historyState).toBe("absent");
    await wipeCustomer(customerId, "filter@example.com");
  });

  it("rejects German commercial language", async () => {
    const customerId = await makeCustomer("filter-de@example.com");
    const draft = await createDraft({
      productHint: "flyer",
      freeText: "500 Stk.",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await submitDraft(draft.id, { type: "system" });
    const src = [{ kind: "text", ref: "text" }];
    const verbotene = [
      "Der Preis liegt bei 120 Stück.",
      "Die Kosten sind noch offen. Keine Historie hinterlegt.",
      "Ein Rabatt ist möglich. Keine Historie hinterlegt.",
      "Die Rechnung folgt. Keine Historie hinterlegt.",
      "Die Zahlung erfolgt später. Keine Historie hinterlegt.",
      "Die Lieferzeit beträgt drei Tage. Keine Historie hinterlegt.",
      "Der Liefertermin steht fest. Keine Historie hinterlegt.",
      "Das wird kosten. Keine Historie hinterlegt.",
      "Gesamt 120 € netto. Keine Historie hinterlegt.",
    ];
    for (const text of verbotene) {
      await expect(
        generateNote(draft.id, { chat: stubChat([{ text, sources: src }]) }),
      ).rejects.toThrow(/commercial/);
    }
    await wipeCustomer(customerId, "filter-de@example.com");
  });

  it("accepts German output and requires a German missing-history notice", async () => {
    const customerId = await makeCustomer("filter-de2@example.com");
    const draft = await createDraft({
      productHint: "flyer",
      freeText: "500 Stk.",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await submitDraft(draft.id, { type: "system" });
    const src = [{ kind: "text", ref: "text" }];
    await expect(
      generateNote(draft.id, { chat: stubChat([{ text: "Die Mengenangabe wirkt plausibel.", sources: src }]) }),
    ).rejects.toThrow(/history/);
    const ok = await generateNote(draft.id, {
      chat: stubChat([
        { text: "Die Mengenangabe wirkt plausibel. Keine Historie hinterlegt, das Team gleicht manuell ab.", sources: src },
      ]),
    });
    expect(ok.historyState).toBe("absent");
    expect(ok.bullets).toHaveLength(1);
    await wipeCustomer(customerId, "filter-de2@example.com");
  });
});

describe("7.6 editable prompt", () => {
  it("always appends the fixed contract, even for changed instructions", () => {
    const custom = "Antworten Sie kurz und freundlich.";
    const prompt = assembleSystemPrompt(custom, CATEGORY_VALUES);
    expect(prompt.startsWith(custom)).toBe(true);
    expect(prompt).toContain("FESTER AUSGABEVERTRAG");
    expect(prompt).toContain('"bullets"');
    expect(prompt).toContain("suggestedCategory");
    expect(prompt).toContain("keine Historie hinterlegt");
    expect(prompt).toContain("Höchstens 8 Bullets");
    for (const c of CATEGORY_VALUES) expect(prompt).toContain(c);
    // Auch ein leerer oder gegenteiliger Editiertext entfernt den Vertrag nicht.
    expect(assembleSystemPrompt("Preise dürfen genannt werden.", CATEGORY_VALUES)).toContain("FESTER AUSGABEVERTRAG");
  });

  it("validates the editable text", () => {
    expect(validateAssistantInstructions("")).not.toBeNull();
    expect(validateAssistantInstructions("   ")).not.toBeNull();
    expect(validateAssistantInstructions(42)).not.toBeNull();
    expect(validateAssistantInstructions("x".repeat(8001))).not.toBeNull();
    expect(validateAssistantInstructions("x".repeat(8000))).toBeNull();
    expect(validateAssistantInstructions(DEFAULT_ASSISTANT_INSTRUCTIONS)).toBeNull();
  });

  it("passes instructions plus contract to the model and re-hashes on prompt change", async () => {
    const customerId = await makeCustomer("prompt@example.com");
    const draft = await createDraft({
      productHint: "flyer",
      freeText: "500 Stk.",
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await submitDraft(draft.id, { type: "system" });
    const systems: string[] = [];
    const chat = async ({ system }: { system: string }) => {
      systems.push(system);
      return JSON.stringify({
        bullets: [{ text: "Keine Historie hinterlegt.", sources: [{ kind: "text", ref: "text" }] }],
      });
    };
    const first = await generateNote(draft.id, { chat, instructions: "Variante A." });
    expect(systems[0]).toContain("Variante A.");
    expect(systems[0]).toContain("FESTER AUSGABEVERTRAG");
    // Gleicher Prompt: gleiche Note, kein weiterer Modellaufruf.
    const same = await generateNote(draft.id, { chat, instructions: "Variante A." });
    expect(same.id).toBe(first.id);
    expect(systems).toHaveLength(1);
    // Geänderter Prompt: neue Note (Status RECEIVED).
    const changed = await generateNote(draft.id, { chat, instructions: "Variante B." });
    expect(changed.id).not.toBe(first.id);
    expect(changed.inputHash).not.toBe(first.inputHash);
    expect(systems[1]).toContain("Variante B.");
    await wipeCustomer(customerId, "prompt@example.com");
  });
});

describe("7.7 settings store", () => {
  const KEY = "test_setting_assistant";

  it("keeps history in step with set and reset", async () => {
    await query("DELETE FROM app_settings WHERE key = $1", [KEY]);
    await query("DELETE FROM app_settings_history WHERE key = $1", [KEY]);
    expect(await getSetting(KEY)).toBeNull();
    await setSetting(KEY, "eins", "a@example.com");
    await setSetting(KEY, "zwei", "b@example.com");
    expect((await getSetting(KEY))?.value).toBe("zwei");
    await resetSetting(KEY, "standard", "b@example.com");
    expect(await getSetting(KEY)).toBeNull();
    const history = await listSettingHistory(KEY, 20);
    expect(history.map((h) => h.value)).toEqual(["standard", "zwei", "eins"]);
    expect(history[2].updatedBy).toBe("a@example.com");
    expect(await listSettingHistory(KEY, 2)).toHaveLength(2);
    await query("DELETE FROM app_settings_history WHERE key = $1", [KEY]);
  });
});

describe("7.5 category suggestion", () => {
  async function categoryDraft(email: string, freeText: string) {
    const customerId = await makeCustomer(email);
    const draft = await createDraft({
      productHint: "other",
      freeText,
      origin: "door_a",
      trust: "VERIFIED",
      customerId,
    });
    await submitDraft(draft.id, { type: "system" });
    return { customerId, draft };
  }

  const okBullet = (text = "Files look like flyers. No history on file.") => ({
    text,
    sources: [{ kind: "text", ref: "free-text" }],
  });

  it("stores a valid suggested category", async () => {
    const { customerId, draft } = await categoryDraft("cat-ok@example.com", "Flyer bitte 500 Stk.");
    const note = await generateNote(draft.id, {
      chat: async () => JSON.stringify({ bullets: [okBullet()], suggestedCategory: "flyer" }),
    });
    expect(note.suggestedCategory).toBe("flyer");
    expect((await latestNote(draft.id))?.suggestedCategory).toBe("flyer");
    await wipeCustomer(customerId, "cat-ok@example.com");
  });

  it("stores null after repeated invalid categories", async () => {
    const { customerId, draft } = await categoryDraft("cat-bad@example.com", "Irgendwas drucken.");
    const note = await generateNote(draft.id, {
      chat: async () => JSON.stringify({ bullets: [okBullet()], suggestedCategory: "plakat-xxl" }),
    });
    expect(note.suggestedCategory).toBeNull();
    expect(note.bullets).toHaveLength(1);
    await wipeCustomer(customerId, "cat-bad@example.com");
  });

  it("retries once and keeps the corrected category", async () => {
    const { customerId, draft } = await categoryDraft("cat-retry@example.com", "Poster bitte.");
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return JSON.stringify(
        calls === 1
          ? { bullets: [okBullet()], suggestedCategory: "nonsense" }
          : { bullets: [okBullet()], suggestedCategory: "poster" },
      );
    };
    const note = await generateNote(draft.id, { chat });
    expect(calls).toBe(2);
    expect(note.suggestedCategory).toBe("poster");
    await wipeCustomer(customerId, "cat-retry@example.com");
  });
});
