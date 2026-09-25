/** Request lifecycle. Status is derived from the event log (design §1). */

export const STATUSES = [
  "DRAFT",
  "RECEIVED",
  "IN_REVIEW",
  "WAITING_APPROVAL",
  "IN_PROGRESS",
  "SHIPPED",
] as const;
export type RequestStatus = (typeof STATUSES)[number];

export const REQUEST_EVENTS = [
  "draft_created",
  "submitted",
  "otp_verified",
  "link_consumed",
  "previewed",
  "confirmation_attached",
  "resent",
  "change_requested",
  "approved",
  "invoice_attached",
  "shipped",
] as const;
export type RequestEvent = (typeof REQUEST_EVENTS)[number];

/** Guarded transition table: event -> from-status -> to-status. */
export const TRANSITIONS: Record<RequestEvent, { from: RequestStatus[]; to: RequestStatus }> = {
  draft_created: { from: [], to: "DRAFT" },
  submitted: { from: ["DRAFT"], to: "RECEIVED" },
  otp_verified: { from: ["DRAFT"], to: "RECEIVED" },
  link_consumed: { from: ["DRAFT"], to: "RECEIVED" },
  previewed: { from: ["RECEIVED"], to: "IN_REVIEW" },
  confirmation_attached: { from: ["IN_REVIEW"], to: "WAITING_APPROVAL" },
  resent: { from: ["WAITING_APPROVAL"], to: "WAITING_APPROVAL" },
  change_requested: { from: ["WAITING_APPROVAL"], to: "WAITING_APPROVAL" },
  approved: { from: ["WAITING_APPROVAL"], to: "IN_PROGRESS" },
  invoice_attached: { from: ["IN_PROGRESS"], to: "IN_PROGRESS" },
  shipped: { from: ["IN_PROGRESS"], to: "SHIPPED" },
};

export type Trust = "VERIFIED" | "VOUCHED";

export interface PrintRequest {
  id: string;
  /** Auftragsnummer DDMMJJ-NNN; erst ab Eingang gesetzt (Entwürfe: null). */
  number: string | null;
  customerId: string | null;
  prospectEmail: string | null;
  trust: Trust;
  origin: "door_a" | "door_b";
  linkId: string | null;
  productHint: string;
  referenceText: string | null;
  freeText: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RequestFile {
  id: string;
  requestId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}
