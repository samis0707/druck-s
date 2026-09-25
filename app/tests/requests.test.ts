import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { bucketName, getStorage } from "@/lib/storage";
import { appendEvent, recomputeStatus, TransitionError } from "@/lib/requests/events";
import { addFile, createDraft, getRequest, listFiles, submitDraft } from "@/lib/requests/store";
import { createBundle, listBundles, recordPreview } from "@/lib/requests/workflow";

/**
 * Integration tests for section 2 (event log + request core).
 * Run with the compose stack up:
 *   DATABASE_URL=postgres://dam:dam@localhost:5433/dam S3_ENDPOINT=http://localhost:9100 npm test
 */
const createdRequests: string[] = [];
const createdKeys: string[] = [];
let staffId = "";

beforeAll(async () => {
  await query(`DELETE FROM "user" WHERE email = 'test-staff@example.com'`);
  const res = await query<{ id: string }>(
    `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), 'test-staff@example.com', 'Test Staff', 'staff', 'customer') RETURNING id`,
  );
  staffId = res.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM "user" WHERE email = 'test-staff@example.com'`);
});

async function cleanup() {
  for (const key of createdKeys.splice(0)) {
    await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  }
  for (const id of createdRequests.splice(0)) {
    await query("DELETE FROM requests WHERE id = $1", [id]);
  }
}

async function makeSubmittedRequest() {
  const draft = await createDraft({
    productHint: "name-tag",
    freeText: "130 total, 20 blanko",
    origin: "door_a",
    trust: "VERIFIED",
  });
  createdRequests.push(draft.id);
  return submitDraft(draft.id, { type: "system" });
}

describe("2.1 guarded event log", () => {
  it("rejects illegal transitions without side effects", async () => {
    const req = await makeSubmittedRequest();
    expect(req.status).toBe("RECEIVED");
    await expect(
      appendEvent({ requestId: req.id, event: "approved", actorType: "customer" }),
    ).rejects.toBeInstanceOf(TransitionError);
    const after = await getRequest(req.id);
    expect(after?.status).toBe("RECEIVED");
    expect(await recomputeStatus(req.id)).toBe("RECEIVED");
    await cleanup();
  });

  it("accepts legal transitions and recompute matches cache", async () => {
    const req = await makeSubmittedRequest();
    await recordPreview({ requestId: req.id, actorType: "staff", actorId: staffId });
    const after = await getRequest(req.id);
    expect(after?.status).toBe("IN_REVIEW");
    expect(await recomputeStatus(req.id)).toBe("IN_REVIEW");
    await cleanup();
  });
});

describe("2.2 request container", () => {
  it("stores a 5-file campaign as one byte-identical request", async () => {
    const freeText = "As last time, 130 total: xlsx rows + 20 blanko + 10x Acme Corp.";
    const draft = await createDraft({
      productHint: "campaign",
      referenceText: "as order #981",
      freeText,
      origin: "door_a",
      trust: "VERIFIED",
    });
    createdRequests.push(draft.id);
    const payloads = [
      { fileName: "flyer.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 flyer") },
      { fileName: "poster.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 poster") },
      { fileName: "tags.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 tags") },
      { fileName: "letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: Buffer.from("PK docx") },
      { fileName: "data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: Buffer.from("PK xlsx") },
    ];
    for (const p of payloads) {
      const f = await addFile(draft.id, p);
      createdKeys.push(f.storageKey);
    }
    const submitted = await submitDraft(draft.id, { type: "system" });
    expect(submitted.status).toBe("RECEIVED");
    expect(submitted.freeText).toBe(freeText);
    expect(submitted.productHint).toBe("campaign");
    const files = await listFiles(draft.id);
    expect(files).toHaveLength(5);
    const all = await query<{ count: string }>(
      "SELECT COUNT(*) FROM requests WHERE free_text = $1",
      [freeText],
    );
    expect(Number(all.rows[0].count)).toBeGreaterThanOrEqual(1);
    await cleanup();
  });
});

describe("2.3 preview trigger", () => {
  it("ignores customer views, moves on first staff preview only", async () => {
    const req = await makeSubmittedRequest();
    await recordPreview({ requestId: req.id, actorType: "customer", actorId: null });
    expect((await getRequest(req.id))?.status).toBe("RECEIVED");
    await recordPreview({ requestId: req.id, actorType: "staff", actorId: staffId });
    expect((await getRequest(req.id))?.status).toBe("IN_REVIEW");
    await recordPreview({ requestId: req.id, actorType: "staff", actorId: staffId });
    const events = await query<{ event: string }>(
      "SELECT event FROM request_events WHERE request_id = $1 AND event = 'previewed'",
      [req.id],
    );
    expect(events.rowCount).toBe(1);
    await cleanup();
  });
});

describe("2.4 confirmation versioning", () => {
  it("bumps versions and retains history", async () => {
    const req = await makeSubmittedRequest();
    await recordPreview({ requestId: req.id, actorType: "staff", actorId: staffId });
    const v1 = await createBundle({
      requestId: req.id,
      confirmationKey: "bundles/v1.pdf",
      printFileKeys: ["bundles/print-v1.pdf"],
      createdBy: staffId,
    });
    expect(v1.version).toBe(1);
    expect((await getRequest(req.id))?.status).toBe("WAITING_APPROVAL");
    const v2 = await createBundle({
      requestId: req.id,
      confirmationKey: "bundles/v2.pdf",
      printFileKeys: ["bundles/print-v2.pdf"],
      reason: "paper changed to 170g",
      createdBy: staffId,
    });
    expect(v2.version).toBe(2);
    expect((await getRequest(req.id))?.status).toBe("WAITING_APPROVAL");
    const bundles = await listBundles(req.id);
    expect(bundles.map((b) => b.version)).toEqual([1, 2]);
    await cleanup();
  });
});
