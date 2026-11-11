import { NextResponse } from "next/server";
import { bundleFileName, mimeFromName } from "@/lib/bundleFiles";
import { findIdentityByEmail, getIdentity } from "@/lib/identities";
import { requestRef } from "@/lib/requestNumber";
import { getRequestForViewer } from "@/lib/requestAccess";
import { listFiles } from "@/lib/requests/store";
import { getReport } from "@/lib/analyze/run";
import { listBundles } from "@/lib/requests/workflow";
import { query } from "@/lib/db";
import { pendingInvoiceKey } from "@/lib/approvalFlow";
import { partnerMetaRows } from "@/lib/partners/freeText";

/**
 * Request detail for owner or staff: request, customer, files with reports,
 * bundles (with download URLs), shipment. Same data both sides; wording differs in the UI.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getRequestForViewer(req, id);
  if ("error" in access) return access.error;
  const { request } = access;
  const files = await listFiles(id);
  const filesWithReports = await Promise.all(
    files.map(async (f) => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: Number(f.sizeBytes),
      report: await getReport(f.id),
    })),
  );
  const base = `/api/requests/${id}`;
  const bundles = (await listBundles(id)).map((b) => {
    const confirmationName = bundleFileName(b.confirmationKey);
    return {
      id: b.id,
      version: b.version,
      reason: b.reason,
      createdAt: b.createdAt,
      confirmation: {
        name: confirmationName,
        mimeType: mimeFromName(confirmationName),
        url: `${base}/bundles/${b.version}/confirmation`,
      },
      printFiles: b.printFileKeys.map((key, i) => {
        const name = bundleFileName(key);
        return { name, mimeType: mimeFromName(name), url: `${base}/bundles/${b.version}/print-${i}` };
      }),
    };
  });
  const notes = await query(
    "SELECT id, bundle_version AS \"bundleVersion\", bullets, history_state AS \"historyState\", suggested_category AS \"suggestedCategory\", created_at AS \"createdAt\" FROM assistant_notes WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1",
    [id],
  );
  // Gebundene Aufträge zeigen das Kundenkonto; Interessenten (prospect_email) ihren Datensatz, falls vorhanden.
  const identity = request.customerId
    ? await getIdentity(request.customerId)
    : request.prospectEmail
      ? await findIdentityByEmail(request.prospectEmail)
      : null;
  const customer = {
    email: identity?.email ?? request.prospectEmail,
    displayName: identity?.displayName ?? null,
    firm: identity?.firm ?? null,
  };
  const shipmentRow = await query<{ tracking: string | null; delivery: string | null }>(
    "SELECT tracking_number AS tracking, special_delivery_date::text AS delivery FROM shipments WHERE request_id = $1",
    [id],
  );
  const shipment = shipmentRow.rows[0]
    ? {
        trackingNumber: shipmentRow.rows[0].tracking,
        specialDeliveryDate: shipmentRow.rows[0].delivery,
        invoiceUrl: `${base}/invoice`,
      }
    : null;
  // Partner-Aufträge: Herkunft und lesbare Partner-Angaben nur für Staff.
  let partner: { name: string; ref: string; rows: { label: string; value: string }[] } | null = null;
  if (access.isStaff && request.partnerId) {
    const p = await query<{ name: string; meta: unknown }>(
      "SELECT p.name, r.partner_meta AS meta FROM requests r JOIN partners p ON p.id = r.partner_id WHERE r.id = $1",
      [id],
    );
    if (p.rows[0]) partner = { name: p.rows[0].name, ref: request.partnerRef ?? "", rows: partnerMetaRows(p.rows[0].meta) };
  }
  return NextResponse.json({
    request: { ...request, ref: requestRef(request) },
    partner,
    customer,
    files: filesWithReports,
    bundles,
    shipment,
    invoicePending: access.isStaff && request.status === "IN_PROGRESS" && (await pendingInvoiceKey(id)) !== null,
    note: notes.rows[0] ?? null,
  });
}
