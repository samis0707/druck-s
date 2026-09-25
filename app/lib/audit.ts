/** Audit trail for identity-relevant and lifecycle events. */
export { REQUEST_EVENTS, type RequestEvent } from "./requests/types";

export const AUDIT_ACTIONS = [
  "draft_created",
  "drafts_swept",
  "submitted",
  "otp_issued",
  "otp_verified",
  "otp_verified",
  "otp_failed",
  "link_created",
  "link_consumed",
  "link_revoked",
  "session_revoked",
  "identity_disabled",
  "identity_matured",
  "previewed",
  "confirmation_attached",
  "resent",
  "change_requested",
  "approved",
  "shipped",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorType: "customer" | "staff" | "system";
  actorId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}
