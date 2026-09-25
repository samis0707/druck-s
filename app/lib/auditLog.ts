import { query } from "./db";
import type { AuditAction } from "./audit";

export async function appendAudit(entry: {
  action: AuditAction;
  actorType?: "customer" | "staff" | "system" | null;
  actorId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_log (action, actor_type, actor_id, request_id, ip, user_agent, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.action,
      entry.actorType ?? "system",
      entry.actorId ?? null,
      entry.requestId ?? null,
      entry.ip ?? null,
      entry.userAgent ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  );
}
