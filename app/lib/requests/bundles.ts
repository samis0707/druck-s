import { query } from "../db";
import type { ConfirmationBundle } from "../approval";
import { appendEvent } from "./events";

const BUNDLE_COLS = `id, request_id AS "requestId", version::int AS "version",
  confirmation_key AS "confirmationKey", print_file_keys AS "printFileKeys",
  reason, created_by AS "createdBy", created_at AS "createdAt"`;

export interface BundleInput {
  requestId: string;
  confirmationKey: string;
  printFileKeys: string[];
  reason?: string | null;
  createdBy: string;
}

/**
 * Versioned bundle insert (v1, v2, ...) plus the lifecycle event:
 * v1 -> confirmation_attached, later versions -> resent.
 */
export async function createBundle(input: BundleInput): Promise<ConfirmationBundle> {
  const existing = await query<{ version: number }>(
    "SELECT version::int AS version FROM confirmation_bundles WHERE request_id = $1 ORDER BY version DESC LIMIT 1",
    [input.requestId],
  );
  const version = (existing.rows[0]?.version ?? 0) + 1;
  const res = await query<ConfirmationBundle>(
    `INSERT INTO confirmation_bundles
      (request_id, version, confirmation_key, print_file_keys, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${BUNDLE_COLS}`,
    [
      input.requestId,
      version,
      input.confirmationKey,
      input.printFileKeys,
      input.reason ?? null,
      input.createdBy,
    ],
  );
  const bundle = res.rows[0];
  const event = version === 1 ? "confirmation_attached" : "resent";
  await appendEvent({
    requestId: input.requestId,
    event,
    actorType: "staff",
    actorId: input.createdBy,
    detail: { version, reason: input.reason ?? null },
  });
  return bundle;
}

export async function listBundles(requestId: string): Promise<ConfirmationBundle[]> {
  const res = await query<ConfirmationBundle>(
    `SELECT ${BUNDLE_COLS} FROM confirmation_bundles WHERE request_id = $1 ORDER BY version ASC`,
    [requestId],
  );
  return res.rows;
}
