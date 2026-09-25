import { randomUUID } from "node:crypto";
import { withTx } from "./db";
import { config } from "./config";
import { appendAudit } from "./auditLog";
import { sendMail } from "./mail";
import { getRequestFile, putRequestFile } from "./storageFiles";
import {
  approvalReceiptMail,
  approvalRequestMail,
  shippedMail,
  staffApprovalNotice,
} from "./mailTemplates";
import { bundleFileName, mimeFromName } from "./bundleFiles";
import { appendEvent } from "./requests/events";
import { getRequest } from "./requests/store";
import { createBundle, type BundleInput } from "./requests/bundles";
import { getIdentity } from "./identities";
import { query } from "./db";
import { requestRef } from "./requestNumber";
import { productLabel } from "./ui-text";

export interface StaffFileInput {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

/** Staff attaches confirmation + print files. Attaching IS the send (mails customer). */
export async function attachConfirmation(input: {
  requestId: string;
  staffId: string;
  staffEmail: string;
  customerEmail: string;
  confirmation: StaffFileInput;
  printFiles: StaffFileInput[];
  reason?: string | null;
  ip?: string | null;
}) {
  const request = await getRequest(input.requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "IN_REVIEW" && request.status !== "WAITING_APPROVAL") {
    throw new Error(`Cannot attach confirmation in status ${request.status}`);
  }
  const existing = await query<{ version: number }>(
    "SELECT version::int AS version FROM confirmation_bundles WHERE request_id = $1 ORDER BY version DESC LIMIT 1",
    [input.requestId],
  );
  const version = (existing.rows[0]?.version ?? 0) + 1;
  const confirmationKey = `bundles/${input.requestId}/v${version}-confirmation-${randomUUID()}-${input.confirmation.fileName}`;
  await putRequestFile(confirmationKey, input.confirmation.bytes, input.confirmation.mimeType);
  const printFileKeys: string[] = [];
  for (const [i, f] of input.printFiles.entries()) {
    const key = `bundles/${input.requestId}/v${version}-print-${i}-${randomUUID()}-${f.fileName}`;
    await putRequestFile(key, f.bytes, f.mimeType);
    printFileKeys.push(key);
  }
  const bundleInput: BundleInput = {
    requestId: input.requestId,
    confirmationKey,
    printFileKeys,
    reason: input.reason ?? null,
    createdBy: input.staffId,
  };
  const bundle = await createBundle(bundleInput);
  await appendAudit({
    action: version === 1 ? "confirmation_attached" : "resent",
    actorType: "staff",
    actorId: input.staffId,
    requestId: input.requestId,
    ip: input.ip ?? null,
    detail: { version, reason: input.reason ?? null },
  });
  const approveUrl = `${config.appBaseUrl}/requests/${input.requestId}`;
  const mail = approvalRequestMail({
    requestRef: requestRef(request),
    version,
    reason: input.reason ?? null,
    resent: version > 1,
    approveUrl,
  });
  await sendMail({
    to: input.customerEmail,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [
      {
        filename: input.confirmation.fileName,
        content: input.confirmation.bytes,
        contentType: input.confirmation.mimeType,
      },
      ...input.printFiles.map((f) => ({
        filename: f.fileName,
        content: f.bytes,
        contentType: f.mimeType,
      })),
    ],
  });
  return bundle;
}

/** Customer change-request: log intent, stay WAITING, return a mailto payload. */
export async function logChangeRequest(input: { requestId: string; customerId: string }) {
  const request = await getRequest(input.requestId);
  if (!request) throw new Error("Request not found");
  if (request.customerId !== input.customerId) throw new Error("Not your request");
  if (request.status !== "WAITING_APPROVAL") {
    throw new Error(`Cannot request changes in status ${request.status}`);
  }
  await appendEvent({
    requestId: input.requestId,
    event: "change_requested",
    actorType: "customer",
    actorId: input.customerId,
  });
  await appendAudit({
    action: "change_requested",
    actorType: "customer",
    actorId: input.customerId,
    requestId: input.requestId,
  });
  const ref = requestRef(request);
  return {
    to: config.firmInbox,
    subject: `Änderungswunsch zu Auftrag ${ref}`,
    body: `Guten Tag,\n\nzu Auftrag ${ref} (${productLabel(request.productHint)}) wünsche ich folgende Änderungen:\n\n\n\nLink zum Auftrag: ${config.appBaseUrl}/requests/${input.requestId}\n`,
  };
}

/** Customer approval: the route already consumed a fresh step-up code on a
 *  live session. This commits the transition and mails both receipts. */
export async function approveRequest(input: {
  requestId: string;
  customerId: string;
  ip?: string | null;
}) {
  const request = await getRequest(input.requestId);
  if (!request) throw new Error("Request not found");
  if (request.customerId !== input.customerId) throw new Error("Not your request");
  if (request.status !== "WAITING_APPROVAL") {
    throw new Error(`Cannot approve in status ${request.status}`);
  }
  await appendEvent({
    requestId: input.requestId,
    event: "approved",
    actorType: "customer",
    actorId: input.customerId,
    detail: { via: "step-up-code" },
  });
  await appendAudit({
    action: "approved",
    actorType: "customer",
    actorId: input.customerId,
    requestId: input.requestId,
    ip: input.ip ?? null,
  });
  const identity = await getIdentity(input.customerId);
  const bundles = await query<{ version: number }>(
    "SELECT version::int AS version FROM confirmation_bundles WHERE request_id = $1 ORDER BY version DESC LIMIT 1",
    [input.requestId],
  );
  const version = bundles.rows[0]?.version ?? 1;
  const approvedAt = new Date().toISOString();
  const receipt = approvalReceiptMail({
    requestRef: requestRef(request),
    version,
    approvedAt,
    approver: identity?.email ?? "Kunde",
  });
  await sendMail({
    to: identity?.email ?? "",
    subject: receipt.subject,
    text: receipt.text,
    html: receipt.html,
  });
  const notice = staffApprovalNotice({
    requestRef: requestRef(request),
    version,
    approver: identity?.email ?? "Kunde",
    ip: input.ip ?? "unbekannt",
  });
  await sendMail({
    to: config.firmInbox,
    subject: notice.subject,
    text: notice.text,
    html: notice.html,
  });
  return { version, approvedAt };
}

/** Key of an invoice attached earlier without tracking/date (kept in the invoice_attached event). */
export async function pendingInvoiceKey(requestId: string): Promise<string | null> {
  const res = await query<{ key: string | null }>(
    `SELECT detail->>'invoiceKey' AS key FROM request_events
     WHERE request_id = $1 AND event = 'invoice_attached' ORDER BY id DESC LIMIT 1`,
    [requestId],
  );
  return res.rows[0]?.key ?? null;
}

/**
 * Staff shipment: an invoice-only call stores the invoice (kept in the event log) and leaves
 * the request IN_PROGRESS; a tracking number or special-delivery date completes it. A later
 * call may omit the invoice once one was attached.
 */
export async function recordShipment(input: {
  requestId: string;
  staffId: string;
  invoice?: StaffFileInput | null;
  trackingNumber?: string | null;
  specialDeliveryDate?: string | null;
  ip?: string | null;
}) {
  const request = await getRequest(input.requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "IN_PROGRESS") {
    throw new Error(`Cannot ship in status ${request.status}`);
  }
  const tracking = input.trackingNumber?.trim() || null;
  const date = input.specialDeliveryDate?.trim() || null;
  let invoiceKey = input.invoice ? null : await pendingInvoiceKey(input.requestId);
  if (!input.invoice && !invoiceKey) throw new Error("Cannot ship without an invoice");
  if (input.invoice) {
    invoiceKey = `shipments/${input.requestId}/invoice-${randomUUID()}-${input.invoice.fileName}`;
    await putRequestFile(invoiceKey, input.invoice.bytes, input.invoice.mimeType);
  }
  const result = await withTx(async (client) => {
    const { appendEventTx } = await import("./requests/events");
    if (input.invoice) {
      await appendEventTx(client, {
        requestId: input.requestId,
        event: "invoice_attached",
        actorType: "staff",
        actorId: input.staffId,
        detail: { invoiceKey },
      });
    }
    let shipped = false;
    if (tracking || date) {
      await client.query(
        `INSERT INTO shipments (request_id, invoice_key, tracking_number, special_delivery_date, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (request_id) DO UPDATE SET
           invoice_key = EXCLUDED.invoice_key, tracking_number = EXCLUDED.tracking_number,
           special_delivery_date = EXCLUDED.special_delivery_date`,
        [input.requestId, invoiceKey, tracking, date, input.staffId],
      );
      await appendEventTx(client, {
        requestId: input.requestId,
        event: "shipped",
        actorType: "staff",
        actorId: input.staffId,
        detail: tracking ? { trackingNumber: tracking } : { specialDeliveryDate: date },
      });
      shipped = true;
    }
    return { shipped, invoiceKey: invoiceKey as string };
  });
  if (!result.shipped) return { ...result, mailed: false };
  await appendAudit({
    action: "shipped",
    actorType: "staff",
    actorId: input.staffId,
    requestId: input.requestId,
    ip: input.ip ?? null,
    detail: tracking ? { trackingNumber: tracking } : { specialDeliveryDate: date },
  });
  const mailed = await sendShippedMail(request, result.invoiceKey, tracking, date);
  return { ...result, mailed };
}

/** Versandbestätigung mit Rechnung; ein Fehler hier macht den gespeicherten Versand nicht ungültig. */
async function sendShippedMail(
  request: NonNullable<Awaited<ReturnType<typeof getRequest>>>,
  invoiceKey: string,
  tracking: string | null,
  date: string | null,
): Promise<boolean> {
  try {
    const to = request.customerId
      ? ((await getIdentity(request.customerId))?.email ?? null)
      : request.prospectEmail;
    if (!to) {
      console.error(`Versandbestätigung für Auftrag ${requestRef(request)}: keine Kunden-E-Mail-Adresse`);
      return false;
    }
    const invoiceName = bundleFileName(invoiceKey);
    const mail = shippedMail({
      requestRef: requestRef(request),
      trackingNumber: tracking,
      specialDeliveryDate: date,
      requestUrl: `${config.appBaseUrl}/requests/${request.id}`,
    });
    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [
        {
          filename: invoiceName,
          content: await getRequestFile(invoiceKey),
          contentType: mimeFromName(invoiceName),
        },
      ],
    });
    return true;
  } catch (err) {
    console.error(`Versandbestätigung für Auftrag ${requestRef(request)} fehlgeschlagen:`, err);
    return false;
  }
}

/** Read invoice bytes back (staff views, future customer views). */
export async function readShipmentInvoice(requestId: string): Promise<Buffer | null> {
  const res = await query<{ invoice_key: string }>(
    "SELECT invoice_key FROM shipments WHERE request_id = $1",
    [requestId],
  );
  if (!res.rows[0]) return null;
  return getRequestFile(res.rows[0].invoice_key);
}
