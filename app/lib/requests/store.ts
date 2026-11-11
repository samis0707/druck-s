import { randomUUID } from "node:crypto";
import { query, withTx } from "../db";
import { getRequestFile, putRequestFile, sha256Hex } from "../storageFiles";
import { appendEventTx } from "./events";
import type { PrintRequest, RequestFile } from "./types";

export const REQUEST_COLS = `id, number, customer_id AS "customerId", prospect_email AS "prospectEmail",
  trust, origin, link_id AS "linkId", product_hint AS "productHint",
  reference_text AS "referenceText", free_text AS "freeText",
  status, partner_id AS "partnerId", partner_ref AS "partnerRef", inquiry_contact AS "inquiryContact",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export const FILE_COLS = `id, request_id AS "requestId", storage_key AS "storageKey",
  file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes",
  sha256, created_at AS "createdAt"`;

export interface DraftInput {
  productHint: string;
  referenceText?: string | null;
  freeText: string;
  origin: "door_a" | "door_b";
  trust: "VERIFIED" | "VOUCHED";
  customerId?: string | null;
  prospectEmail?: string | null;
  linkId?: string | null;
}

export interface UploadInput {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

export async function createDraft(input: DraftInput): Promise<PrintRequest> {
  const res = await query<PrintRequest>(
    `INSERT INTO requests
      (customer_id, prospect_email, trust, origin, link_id, product_hint, reference_text, free_text, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT') RETURNING ${REQUEST_COLS}`,
    [
      input.customerId ?? null,
      input.prospectEmail ?? null,
      input.trust,
      input.origin,
      input.linkId ?? null,
      input.productHint,
      input.referenceText ?? null,
      input.freeText,
    ],
  );
  const request = res.rows[0];
  await query(
    "INSERT INTO request_events (request_id, event, actor_type, detail) VALUES ($1, 'draft_created', 'system', '{}')",
    [request.id],
  );
  return request;
}

export async function addFile(requestId: string, input: UploadInput): Promise<RequestFile> {
  const sha256 = sha256Hex(input.bytes);
  const key = `requests/${requestId}/${randomUUID()}-${input.fileName}`;
  await putRequestFile(key, input.bytes, input.mimeType);
  const res = await query<RequestFile>(
    `INSERT INTO request_files (request_id, storage_key, file_name, mime_type, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FILE_COLS}`,
    [requestId, key, input.fileName, input.mimeType, input.bytes.length, sha256],
  );
  return res.rows[0];
}

export async function readFileBytes(file: RequestFile): Promise<Buffer> {
  return getRequestFile(file.storageKey);
}

export async function submitDraft(
  requestId: string,
  actor: { type: "customer" | "staff" | "system"; id?: string | null },
): Promise<PrintRequest> {
  return withTx(async (client) => {
    await appendEventTx(client, {
      requestId,
      event: "submitted",
      actorType: actor.type,
      actorId: actor.id ?? null,
    });
    const res = await client.query<PrintRequest>(
      `SELECT ${REQUEST_COLS} FROM requests WHERE id = $1`,
      [requestId],
    );
    return res.rows[0];
  });
}

export async function getRequest(requestId: string): Promise<PrintRequest | null> {
  const res = await query<PrintRequest>(
    `SELECT ${REQUEST_COLS} FROM requests WHERE id = $1`,
    [requestId],
  );
  return res.rows[0] ?? null;
}

export async function listFiles(requestId: string): Promise<RequestFile[]> {
  const res = await query<RequestFile>(
    `SELECT ${FILE_COLS} FROM request_files WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId],
  );
  return res.rows;
}
