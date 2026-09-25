import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { pingScanner } from "@/lib/clamav";
import { analyzeFile, getReport } from "@/lib/analyze/run";
import { addFile, createDraft } from "@/lib/requests/store";

/**
 * Section 4 tests (analysis pipeline). Needs compose infra + clamav DB ready.
 * Run: npm run test:int
 */
const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const STAFF_EMAIL = "staff-analysis@example.com";

function crc32(bytes: Uint8Array): number {
  let table = (crc32 as { table?: Int32Array }).table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as { table?: Int32Array }).table = table;
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)])), 8 + data.length);
  return out;
}

/** Valid 800x600 RGB PNG at 96dpi (pHYs) for fixtures, with real pixel data. */
function makePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(800, 0);
  ihdr.writeUInt32BE(600, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(3780, 0);
  phys.writeUInt32BE(3780, 4);
  phys[8] = 1;
  // 600 scanlines of filter-0 + 800 RGB pixels.
  const raw = Buffer.alloc(600 * (1 + 800 * 3));
  const idat = Buffer.from(deflateSync(new Uint8Array(raw)));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("pHYs", phys),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(makePng());
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText("Name tag", { x: 50, y: 750, size: 24, font, color: rgb(0.8, 0, 0) });
  p1.drawImage(png, { x: 50, y: 500, width: 200, height: 150 });
  doc.addPage([300, 400]);
  // Plain xref table: the analyzer reads raw entries, not object streams.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function storeFile(name: string, mime: string, bytes: Buffer) {
  const draft = await createDraft({
    productHint: "test",
    freeText: "t",
    origin: "door_a",
    trust: "VERIFIED",
  });
  const file = await addFile(draft.id, { fileName: name, mimeType: mime, bytes });
  return { draft, file };
}

async function cleanupDraft(draftId: string) {
  await query("DELETE FROM requests WHERE id = $1", [draftId]);
}

describe("4.2 PDF analyzer", () => {
  it("reports pages, sizes, bleed, colors, fonts, resolution", async () => {
    const { draft, file } = await storeFile("tags.pdf", "application/pdf", await makePdf());
    const report = await analyzeFile(file.id);
    expect(report.printability).toBe("yellow");
    const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
    expect(byCheck.page_count.summary).toContain("2 pages");
    expect(byCheck.page_size.severity).toBe("yellow");
    expect(byCheck.bleed.summary).toContain("0 mm");
    expect(byCheck.color_mode.summary).toMatch(/RGB/);
    expect(byCheck.fonts.summary).toMatch(/0 of 1 fonts embedded/);
    const res = byCheck.resolution;
    expect(res.summary).toMatch(/288 dpi|usable/);
    // Uniformity names the deviating page.
    const sizeU = report.uniformity?.find((u) => u.aspect === "trim_size");
    expect(sizeU?.consistent).toBe(false);
    expect(sizeU?.deviatingPages.map((p) => p.page)).toEqual([2]);
    await cleanupDraft(draft.id);
  });

  it("marks corrupt PDFs red without blocking", async () => {
    const { draft, file } = await storeFile("broken.pdf", "application/pdf", Buffer.from("not a pdf at all"));
    const report = await analyzeFile(file.id);
    expect(report.printability).toBe("red");
    await cleanupDraft(draft.id);
  });
});

describe("4.3 raster and office", () => {
  it("reads PNG dimensions and density", async () => {
    const { draft, file } = await storeFile("logo.png", "image/png", makePng());
    const report = await analyzeFile(file.id);
    const dims = report.findings.find((f) => f.check === "dimensions");
    expect(dims?.summary).toContain("800 x 600");
    const res = report.findings.find((f) => f.check === "resolution");
    expect(res?.summary).toMatch(/96 dpi/);
    await cleanupDraft(draft.id);
  });

  it("counts xlsx rows and flags manual check", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const sheet = (rows: number) =>
      `<worksheet><sheetData>${"<row><c><v>1</v></c></row>".repeat(rows)}</sheetData></worksheet>`;
    const zipped = zipSync({
      "xl/workbook.xml": strToU8(
        `<workbook><sheets><sheet name="Names"/><sheet name="Firms"/></sheets></workbook>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheet(150)),
      "xl/worksheets/sheet2.xml": strToU8(sheet(12)),
    });
    const { draft, file } = await storeFile(
      "data.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      Buffer.from(zipped),
    );
    const report = await analyzeFile(file.id);
    expect(report.findings[0].summary).toMatch(/162 rows/);
    expect(report.security.verdict).toBe("SUSPICIOUS");
    await cleanupDraft(draft.id);
  });

  it("flags macros but keeps the file visible", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zipped = zipSync({
      "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="A"/></sheets></workbook>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData></sheetData></worksheet>`),
      "xl/vbaProject.bin": strToU8("macro-bytes"),
    });
    const { draft, file } = await storeFile(
      "macro.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      Buffer.from(zipped),
    );
    const report = await analyzeFile(file.id);
    expect(report.security.verdict).toBe("SUSPICIOUS");
    expect(report.security.reasons.join(" ")).toMatch(/macros/);
    await cleanupDraft(draft.id);
  });
});

describe("4.1 quarantine", () => {
  it("withholds signature hits (EICAR)", async () => {
    for (let i = 0; i < 40 && !(await pingScanner()); i++) {
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(await pingScanner()).toBe(true);
    const { draft, file } = await storeFile("eicar.txt", "text/plain", Buffer.from(EICAR));
    const report = await analyzeFile(file.id);
    expect(report.security.verdict).toBe("INFECTED");
    expect(report.security.reasons.join(" ")).toMatch(/Eicar/i);
    await cleanupDraft(draft.id);
  }, 300000);

  it("stores one report both sides read", async () => {
    const { draft, file } = await storeFile("note.txt", "text/plain", Buffer.from("hi"));
    await analyzeFile(file.id);
    const again = await getReport(file.id);
    expect(again?.fileId).toBe(file.id);
    await cleanupDraft(draft.id);
  });

  it("withholds INFECTED bytes from staff and owner over HTTP", async () => {
    for (let i = 0; i < 60 && !(await pingScanner()); i++) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    const BASE = process.env.APP_TEST_URL ?? "http://localhost:3100";
    const email = `quarantine-${Date.now()}@example.com`;
    const { query } = await import("@/lib/db");
    await query(
      "INSERT INTO \"user\" (id, email, name, role, status) VALUES (gen_random_uuid(), LOWER($1), 'Q', 'customer', 'customer')",
      [email],
    );
    // Build a RECEIVED request with a clean and an infected file via lib.
    const { createDraft, addFile, submitDraft } = await import("@/lib/requests/store");
    const { analyzeRequest } = await import("@/lib/analyze/run");
    const draft = await createDraft({
      productHint: "q",
      freeText: "q",
      origin: "door_a",
      trust: "VERIFIED",
      customerId: (await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])).rows[0].id,
    });
    const clean = await addFile(draft.id, { fileName: "ok.txt", mimeType: "text/plain", bytes: Buffer.from("fine") });
    const bad = await addFile(draft.id, { fileName: "evil.txt", mimeType: "text/plain", bytes: Buffer.from(EICAR) });
    await submitDraft(draft.id, { type: "system" });
    await analyzeRequest(draft.id);

    // Staff login.
    let res = await fetch(`${BASE}/api/staff/login/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL }),
    });
    expect(res.status).toBe(201);
    const messages = (await (
      await fetch("http://localhost:8026/api/v1/messages")
    ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const mine = messages.messages.find((m) => m.To.some((t) => t.Address === STAFF_EMAIL));
    const full = (await (
      await fetch(`http://localhost:8026/api/v1/message/${mine!.ID}`)
    ).json()) as { Text: string; Subject: string };
    const code = `${full.Subject} ${full.Text}`.match(/(\d{6})/)![1];
    res = await fetch(`${BASE}/api/staff/login/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL, code }),
    });
    expect(res.status).toBe(200);
    const staffCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];

    res = await fetch(`${BASE}/api/staff/requests/${draft.id}/files/${bad.id}`, {
      headers: { cookie: staffCookie },
    });
    expect(res.status).toBe(403);
    res = await fetch(`${BASE}/api/staff/requests/${draft.id}/files/${clean.id}`, {
      headers: { cookie: staffCookie },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fine");

    // Owner login: clean downloads, infected explains re-export.
    res = await fetch(`${BASE}/api/login/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(201);
    const messages2 = (await (
      await fetch("http://localhost:8026/api/v1/messages")
    ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const mine2 = messages2.messages.find((m) => m.To.some((t) => t.Address === email));
    const full2 = (await (
      await fetch(`http://localhost:8026/api/v1/message/${mine2!.ID}`)
    ).json()) as { Text: string };
    const code2 = full2.Text.match(/(\d{6})/)![1];
    res = await fetch(`${BASE}/api/login/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: code2 }),
    });
    expect(res.status).toBe(200);
    const custCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    res = await fetch(`${BASE}/api/requests/${draft.id}/files/${bad.id}`, {
      headers: { cookie: custCookie },
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/fresh copy/);
    await cleanupDraft(draft.id);
  }, 300000);
});
