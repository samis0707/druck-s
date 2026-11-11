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
  "partner_request_created",
  "partner_request_withdrawn",
  "partner_webhook_failed",
  // Offene Anfrage (lib/inquiry): Entwurf, Code-Versand, Fehlversuch, Bestätigung.
  "inquiry_created",
  "inquiry_code_issued",
  "inquiry_code_failed",
  "inquiry_confirmed",
  // Batch-Virenscan (scripts/scan-pending.mjs, docs/virenscan.md); schreibt das Skript direkt.
  "malware_detected",
  "malware_scan_unavailable",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorType: "customer" | "staff" | "system" | "partner";
  actorId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}
