/** Staff-issued one-time upload links (upload capability, never identity). */
import type { PoolClient } from "pg";
import { query } from "./db";
import { config } from "./config";
import { randomToken, sha256Hex } from "./crypto";

export type UploadLinkState = "active" | "consumed" | "expired" | "revoked";

export interface UploadLink {
  id: string;
  identityId: string;
  tokenHash: string;
  state: UploadLinkState;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByRequestId: string | null;
}

const LINK_COLS = `id, identity_id AS "identityId", token_hash AS "tokenHash", state,
  created_by AS "createdBy", created_at AS "createdAt", expires_at AS "expiresAt",
  consumed_at AS "consumedAt", consumed_by_request_id AS "consumedByRequestId"`;

export interface IssuedLink {
  link: UploadLink;
  /** Plain token — shown once to staff, only the hash is stored. */
  token: string;
}

export async function createUploadLink(input: {
  identityId: string;
  createdBy: string;
}): Promise<IssuedLink> {
  const token = randomToken(32);
  const res = await query<UploadLink>(
    `INSERT INTO upload_links (identity_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))
     RETURNING ${LINK_COLS}`,
    [input.identityId, sha256Hex(token), input.createdBy, config.ttl.uploadLinkDays],
  );
  return { link: res.rows[0], token };
}

function withComputedState(link: UploadLink): UploadLink {
  if (link.state === "active" && new Date(link.expiresAt).getTime() <= Date.now()) {
    return { ...link, state: "expired" };
  }
  return link;
}

/** Resolve a link by plain token; expiry is computed, never stored. */
export async function resolveLink(token: string): Promise<UploadLink | null> {
  const res = await query<UploadLink>(
    `SELECT ${LINK_COLS} FROM upload_links WHERE token_hash = $1`,
    [sha256Hex(token)],
  );
  if (!res.rows[0]) return null;
  return withComputedState(res.rows[0]);
}

export async function revokeLink(id: string): Promise<void> {
  await query("UPDATE upload_links SET state = 'revoked' WHERE id = $1", [id]);
}

export async function consumeLink(id: string, requestId: string): Promise<void> {
  const res = await query(
    `UPDATE upload_links SET state = 'consumed', consumed_at = now(), consumed_by_request_id = $2
     WHERE id = $1 AND state = 'active'`,
    [id, requestId],
  );
  if (res.rowCount === 0) throw new Error("Link is not consumable");
}

/** Transactional variant for atomic submit-and-consume. */
export async function consumeLinkTx(
  client: PoolClient,
  id: string,
  requestId: string,
): Promise<void> {
  const res = await client.query(
    `UPDATE upload_links SET state = 'consumed', consumed_at = now(), consumed_by_request_id = $2
     WHERE id = $1 AND state = 'active'`,
    [id, requestId],
  );
  if (res.rowCount === 0) throw new Error("Link is not consumable");
}
