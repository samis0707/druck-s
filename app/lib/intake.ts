import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { query, withTx } from "./db";
import { config } from "./config";
import { appendAudit } from "./auditLog";
import { bucketName, getStorage } from "./storage";
import { findIdentityByEmail } from "./identities";
import type { Identity } from "./identities";
import { appendEventTx } from "./requests/events";
import { REQUEST_COLS } from "./requests/store";
import type { PrintRequest } from "./requests/types";

/** Shared eligibility for Door A: onboarded, active customers only. */
export async function checkCustomerEligible(email: string): Promise<Identity> {
  const identity = await findIdentityByEmail(email);
  if (!identity) {
    throw new BindError(
      "This email is not registered. Please contact the print firm to get access.",
    );
  }
  if (identity.status === "disabled") {
    throw new BindError("This account is disabled. Please contact the print firm.");
  }
  if (identity.status !== "customer") {
    throw new BindError(
      "This account is not activated yet. Please ask the print firm to activate it.",
    );
  }
  return identity;
}

/**
 * Door A: bind a draft to an onboarded customer after OTP verification.
 * Emits otp_verified (DRAFT -> RECEIVED). Unknown, disabled, or not-yet
 * activated (prospect) emails are refused with guidance.
 */
export async function bindDraftToCustomer(input: {
  draftId: string;
  email: string;
  actorIp?: string | null;
}): Promise<PrintRequest> {
  const identity = await checkCustomerEligible(input.email);
  return withTx(async (client) => {
    await client.query(
      "UPDATE requests SET customer_id = $1, prospect_email = NULL, trust = 'VERIFIED' WHERE id = $2",
      [identity.id, input.draftId],
    );
    await appendEventTx(client, {
      requestId: input.draftId,
      event: "otp_verified",
      actorType: "customer",
      actorId: identity.id,
    });
    // Read back on the same connection: pool reads would miss uncommitted state.
    const res = await client.query<PrintRequest>(
      `SELECT ${REQUEST_COLS} FROM requests WHERE id = $1`,
      [input.draftId],
    );
    return res.rows[0];
  });
}

export class BindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindError";
  }
}

/** Delete Door A drafts past their TTL plus their staged objects. Never touches RECEIVED+. */
export async function sweepExpiredDrafts(): Promise<number> {
  const stale = await query<{ id: string }>(
    "SELECT id FROM requests WHERE status = 'DRAFT' AND created_at < now() - make_interval(mins => $1)",
    [config.ttl.draftMinutes],
  );
  let removed = 0;
  for (const row of stale.rows) {
    const files = await query<{ storage_key: string }>(
      "SELECT storage_key FROM request_files WHERE request_id = $1",
      [row.id],
    );
    for (const f of files.rows) {
      try {
        await getStorage().send(
          new DeleteObjectCommand({ Bucket: bucketName(), Key: f.storage_key }),
        );
      } catch {
        // Object already gone — row cleanup still proceeds.
      }
    }
    await query("DELETE FROM requests WHERE id = $1 AND status = 'DRAFT'", [row.id]);
    removed += 1;
  }
  if (removed > 0) {
    await appendAudit({ action: "drafts_swept", detail: { sweptDrafts: removed } });
  }
  return removed;
}
