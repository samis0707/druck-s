/**
 * Offene Anfrage: eine vierte Tür in dieselbe Pipeline wie Door A/B und die Partner-Schnittstelle.
 *
 * Ablauf: Entwurf anlegen → Dateien anhängen (optional) → Code an die Kontakt-Adresse senden →
 * mit dem Code bestätigen. Erst die Bestätigung macht aus dem Entwurf einen Eingang (DRAFT → RECEIVED).
 *
 * - Bekannte, freigeschaltete Kundin: der Auftrag wird an ihr Konto gebunden (wie Door A, VERIFIED).
 * - Sonst: Interessent. Auftrag mit prospect_email und origin = 'inquiry' (VOUCHED-Behandlung: Quarantäne
 *   und Virenscan vor der Vorschau), dazu ein Datensatz mit Status „prospect“, den die Druckerei unter
 *   „Kunden & Links“ freischalten kann. Der Interessent bekommt weder Sitzung noch Portalzugang.
 */
import { appendAudit } from "../auditLog";
import { config } from "../config";
import { query, withTx } from "../db";
import { ensureProspect, findIdentityByEmail } from "../identities";
import { sendMail } from "../mail";
import { inquiryCodeMail, inquiryReceivedMail, staffInquiryNotice } from "../mailTemplates";
import { requestRef } from "../requestNumber";
import { appendEventTx } from "../requests/events";
import { createDraft, getRequest, listFiles, REQUEST_COLS } from "../requests/store";
import type { InquiryContact, PrintRequest, RequestStatus } from "../requests/types";
import { productLabel } from "../ui-text";
import { checkCodeTx, consumeCodeTx, generateCode, sentCount, storeCode } from "./codes";
import type { InquiryBody } from "./validate";
import { maskEmail } from "./validate";

export class InquiryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "InquiryError";
  }
}

export type InquiryStatus =
  | "draft"
  | "received"
  | "in_review"
  | "waiting_approval"
  | "in_progress"
  | "shipped"
  | "withdrawn";

const STATUS: Record<RequestStatus, InquiryStatus> = {
  DRAFT: "draft",
  RECEIVED: "received",
  IN_REVIEW: "in_review",
  WAITING_APPROVAL: "waiting_approval",
  IN_PROGRESS: "in_progress",
  SHIPPED: "shipped",
  WITHDRAWN: "withdrawn",
};

/** Was die Schnittstelle über eine Anfrage zeigt. Inhalte nur, solange sie ein Entwurf ist. */
export interface InquiryView {
  id: string;
  status: InquiryStatus;
  /** Auftragsnummer DDMMJJ-NNN, erst nach der Bestätigung. */
  number: string | null;
  product: string;
  productLabel: string;
  createdAt: string;
  /** Seite, auf der ein Mensch die Anfrage ansieht und den Code eingibt. */
  confirmUrl: string;
  /** Nur im Entwurf: Ablauf, Inhalte und Kontakt (E-Mail-Adresse verkürzt). */
  draft: {
    expiresAt: string;
    description: string;
    reference: string | null;
    files: { name: string; sizeBytes: number }[];
    contact: { name: string; email: string; organisation: string | null } | null;
    codeSent: boolean;
  } | null;
}

export function confirmUrl(id: string): string {
  return `${config.appBaseUrl.replace(/\/+$/, "")}/anfrage/${id}`;
}

/** Nur Entwürfe der allgemeinen Upload-Tür (kein Einmal-Link, kein Partner) sind offene Anfragen. */
function isOpenDraft(request: PrintRequest): boolean {
  return request.status === "DRAFT" && request.origin === "door_a" && !request.linkId && !request.partnerId;
}

/** Nach der Bestätigung bleibt eine Anfrage nur sichtbar, wenn sie über den offenen Weg kam. */
function isVisible(request: PrintRequest): boolean {
  if (request.partnerId || request.linkId) return false;
  return isOpenDraft(request) || request.inquiryContact !== null;
}

async function toView(request: PrintRequest): Promise<InquiryView> {
  let draft: InquiryView["draft"] = null;
  if (request.status === "DRAFT") {
    const files = await listFiles(request.id);
    const contact = request.inquiryContact;
    draft = {
      expiresAt: new Date(new Date(request.createdAt).getTime() + config.ttl.draftMinutes * 60_000).toISOString(),
      description: request.freeText,
      reference: request.referenceText,
      files: files.map((f) => ({ name: f.fileName, sizeBytes: Number(f.sizeBytes) })),
      contact: contact
        ? { name: contact.name, email: maskEmail(contact.email), organisation: contact.organisation }
        : null,
      codeSent: (await sentCount(request.id)) > 0,
    };
  }
  return {
    id: request.id,
    status: STATUS[request.status],
    number: request.number,
    product: request.productHint,
    productLabel: productLabel(request.productHint),
    createdAt: new Date(request.createdAt).toISOString(),
    confirmUrl: confirmUrl(request.id),
    draft,
  };
}

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function countAudit(action: string, where: "ip" | "email", value: string): Promise<number> {
  const column = where === "ip" ? "ip" : "detail->>'email'";
  const res = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_log
      WHERE action = $1 AND ${column} = $2 AND created_at > now() - interval '1 hour'`,
    [action, value],
  );
  return Number(res.rows[0]?.n ?? 0);
}

function knownIp(ip: string | null | undefined): ip is string {
  return !!ip && ip !== "unknown";
}

/** Entwurf anlegen. Kontakt kann gleich mitkommen oder beim Code-Versand folgen. */
export async function createInquiry(body: InquiryBody, ctx: { ip?: string | null }): Promise<InquiryView> {
  const limit = config.inquiry.draftsPerIpPerHour;
  if (limit > 0 && knownIp(ctx.ip) && (await countAudit("inquiry_created", "ip", ctx.ip)) >= limit) {
    throw new InquiryError("Too many new inquiries from this address, try again later", 429, "rate_limited");
  }
  const draft = await createDraft({
    productHint: body.product,
    referenceText: body.reference,
    freeText: body.description,
    origin: "door_a",
    trust: "VOUCHED",
  });
  if (body.contact) {
    await query("UPDATE requests SET inquiry_contact = $2 WHERE id = $1", [draft.id, JSON.stringify(body.contact)]);
  }
  await appendAudit({ action: "inquiry_created", requestId: draft.id, ip: ctx.ip ?? null });
  return toView({ ...draft, inquiryContact: body.contact });
}

export async function getInquiry(id: string): Promise<InquiryView> {
  const request = validId(id) ? await getRequest(id) : null;
  if (!request || !isVisible(request)) throw new InquiryError("Inquiry not found", 404, "not_found");
  return toView(request);
}

/** Entwurf laden oder mit dem passenden Fehler ablehnen (404 unbekannt, 409 schon bestätigt). */
export async function requireOpenDraft(id: string): Promise<PrintRequest> {
  const request = validId(id) ? await getRequest(id) : null;
  if (!request || !isVisible(request)) throw new InquiryError("Inquiry not found", 404, "not_found");
  if (!isOpenDraft(request)) {
    throw new InquiryError("This inquiry was already confirmed", 409, "already_confirmed");
  }
  return request;
}

/**
 * Code an die Kontakt-Adresse senden. `contact` setzt oder ersetzt den Kontakt des Entwurfs.
 * Die Antwort verrät nicht, ob die Adresse schon Kundin ist.
 */
export async function sendInquiryCode(
  id: string,
  contact: InquiryContact | null,
  ctx: { ip?: string | null },
): Promise<{ expiresInMinutes: number; sentTo: string }> {
  const draft = await requireOpenDraft(id);
  const effective = contact ?? draft.inquiryContact;
  if (!effective) {
    throw new InquiryError("Contact with name and email is required before a code can be sent", 400, "contact_required");
  }
  const identity = await findIdentityByEmail(effective.email);
  if (identity?.status === "disabled") {
    throw new InquiryError("This account is disabled. Please contact the print firm.", 403, "account_disabled");
  }
  if (identity && identity.role !== "customer") {
    throw new InquiryError("Staff addresses cannot file inquiries. Please use the back office.", 403, "staff_account");
  }

  const c = config.inquiry;
  if (c.codesPerDraft > 0 && (await sentCount(id)) >= c.codesPerDraft) {
    throw new InquiryError("Too many codes for this inquiry. Please start a new one.", 429, "rate_limited");
  }
  if (c.codesPerEmailPerHour > 0 && (await countAudit("inquiry_code_issued", "email", effective.email)) >= c.codesPerEmailPerHour) {
    throw new InquiryError("Too many codes for this email address, try again later", 429, "rate_limited");
  }
  if (c.codesPerIpPerHour > 0 && knownIp(ctx.ip) && (await countAudit("inquiry_code_issued", "ip", ctx.ip)) >= c.codesPerIpPerHour) {
    throw new InquiryError("Too many codes from this address, try again later", 429, "rate_limited");
  }

  if (contact) {
    await query("UPDATE requests SET inquiry_contact = $2, updated_at = now() WHERE id = $1 AND status = 'DRAFT'", [
      id,
      JSON.stringify(contact),
    ]);
  }
  const code = generateCode();
  await storeCode(id, effective.email, code);
  const mail = inquiryCodeMail({ code, confirmUrl: confirmUrl(id) });
  try {
    await sendMail({ to: effective.email, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (err) {
    console.error("[inquiry] Code-Mail fehlgeschlagen:", err instanceof Error ? err.message : err);
    throw new InquiryError("The code email could not be sent. Please try again later.", 502, "mail_failed");
  }
  await appendAudit({
    action: "inquiry_code_issued",
    requestId: id,
    ip: ctx.ip ?? null,
    detail: { email: effective.email },
  });
  return { expiresInMinutes: config.ttl.otpMinutes, sentTo: maskEmail(effective.email) };
}

function contactBlock(contact: InquiryContact): string {
  return [
    "",
    "",
    "— Anfrage ohne Kundenkonto (E-Mail-Adresse per Code bestätigt) —",
    `Kontakt: ${[contact.name, contact.organisation].filter(Boolean).join(", ")}`,
    `E-Mail: ${contact.email}`,
    `Telefon: ${contact.phone ?? "nicht angegeben"}`,
  ].join("\n");
}

export interface ConfirmResult {
  inquiry: InquiryView;
  /** true: an ein bestehendes Kundenkonto gebunden; false: Interessent. */
  customer: boolean;
}

/** Mit dem Code bestätigen: DRAFT → RECEIVED, Nummer vergeben, danach Analyse und Mails. */
export async function confirmInquiry(id: string, code: string, ctx: { ip?: string | null }): Promise<ConfirmResult> {
  await requireOpenDraft(id);

  const outcome = await withTx(async (client) => {
    const locked = await client.query<PrintRequest>(`SELECT ${REQUEST_COLS} FROM requests WHERE id = $1 FOR UPDATE`, [id]);
    const draft = locked.rows[0];
    if (!draft || !isOpenDraft(draft)) return { error: new InquiryError("This inquiry was already confirmed", 409, "already_confirmed") };
    const contact = draft.inquiryContact;
    if (!contact) return { error: new InquiryError("Request a code first", 400, "code_required") };

    const check = await checkCodeTx(client, id, code);
    if (!check.ok) {
      if (check.reason === "invalid") {
        return { failed: true, error: new InquiryError(`The code is not correct (${check.attemptsLeft} attempts left)`, 400, "invalid_code") };
      }
      if (check.reason === "missing") return { error: new InquiryError("Request a code first", 400, "code_required") };
      return {
        failed: check.reason === "locked",
        error: new InquiryError("The code is no longer valid. Please request a new one.", 410, "code_expired"),
      };
    }
    // Der Code gehört zur Adresse, an die er ging; ein später geänderter Kontakt braucht einen neuen Code.
    if (check.email.toLowerCase() !== contact.email.toLowerCase()) {
      await consumeCodeTx(client, id);
      return { error: new InquiryError("The code is no longer valid. Please request a new one.", 410, "code_expired") };
    }

    const res = await client.query<{ id: string; role: string; status: string }>(
      `SELECT id, role, status FROM "user" WHERE email = $1`,
      [contact.email],
    );
    const identity = res.rows[0];
    if (identity?.status === "disabled") {
      return { error: new InquiryError("This account is disabled. Please contact the print firm.", 403, "account_disabled") };
    }
    if (identity && identity.role !== "customer") {
      return { error: new InquiryError("Staff addresses cannot file inquiries. Please use the back office.", 403, "staff_account") };
    }

    let customer = false;
    if (identity?.status === "customer") {
      customer = true;
      await client.query("UPDATE requests SET customer_id = $2, prospect_email = NULL, trust = 'VERIFIED' WHERE id = $1", [
        id,
        identity.id,
      ]);
      await appendEventTx(client, { requestId: id, event: "otp_verified", actorType: "customer", actorId: identity.id });
    } else {
      const prospect = await ensureProspect(client, {
        email: contact.email,
        displayName: contact.name,
        firm: contact.organisation,
      });
      await client.query(
        `UPDATE requests SET prospect_email = $2, origin = 'inquiry', trust = 'VOUCHED', free_text = free_text || $3 WHERE id = $1`,
        [id, contact.email, contactBlock(contact)],
      );
      await appendEventTx(client, {
        requestId: id,
        event: "inquiry_confirmed",
        actorType: "customer",
        actorId: prospect.id,
        detail: { prospectCreated: prospect.created },
      });
    }
    await consumeCodeTx(client, id);
    const after = await client.query<PrintRequest>(`SELECT ${REQUEST_COLS} FROM requests WHERE id = $1`, [id]);
    return { request: after.rows[0], contact, customer };
  });

  if ("error" in outcome && outcome.error) {
    if (outcome.failed) {
      await appendAudit({ action: "inquiry_code_failed", requestId: id, ip: ctx.ip ?? null });
    }
    throw outcome.error;
  }
  const { request, contact, customer } = outcome as { request: PrintRequest; contact: InquiryContact; customer: boolean };

  await appendAudit({
    action: "inquiry_confirmed",
    actorType: "customer",
    requestId: id,
    ip: ctx.ip ?? null,
    detail: { email: contact.email, customer },
  });
  await notifyAfterConfirm(request, contact, customer);
  return { inquiry: await toView(request), customer };
}

/** Eingangsbestätigung und Team-Hinweis. Ein Mailfehler macht die bestätigte Anfrage nicht ungültig. */
async function notifyAfterConfirm(request: PrintRequest, contact: InquiryContact, customer: boolean): Promise<void> {
  const ref = requestRef(request);
  const product = productLabel(request.productHint);
  try {
    const files = await listFiles(request.id);
    const received = inquiryReceivedMail({ requestRef: ref, product, fileCount: files.length });
    await sendMail({ to: contact.email, subject: received.subject, text: received.text, html: received.html });
  } catch (err) {
    console.error(`[inquiry] Eingangsbestätigung ${ref} fehlgeschlagen:`, err instanceof Error ? err.message : err);
  }
  if (customer) return;
  try {
    const notice = staffInquiryNotice({
      requestRef: ref,
      product,
      name: contact.name,
      email: contact.email,
      organisation: contact.organisation,
      phone: contact.phone,
      staffUrl: `${config.appBaseUrl.replace(/\/+$/, "")}/staff/requests/${request.id}`,
    });
    await sendMail({ to: config.firmInbox, subject: notice.subject, text: notice.text, html: notice.html });
  } catch (err) {
    console.error(`[inquiry] Team-Hinweis ${ref} fehlgeschlagen:`, err instanceof Error ? err.message : err);
  }
}

