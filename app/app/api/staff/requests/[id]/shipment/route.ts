import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { clientIp, requireStaff } from "@/lib/guards";
import { recordShipment } from "@/lib/approvalFlow";
import { getRequest } from "@/lib/requests/store";
import { MAX_FILE_BYTES } from "@/app/api/drafts/[id]/files/route";

/**
 * Staff shipment: the invoice is stored immediately; tracking number OR special-delivery
 * date completes the bundle and moves IN_PROGRESS to SHIPPED (invoice optional once stored).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const request = await getRequest(id);
  if (!request) return notFound("Request not found");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const invoiceField = form.get("invoice");
  const invoice = invoiceField instanceof File && invoiceField.size > 0 ? invoiceField : null;
  if (invoice && invoice.size > MAX_FILE_BYTES) return badRequest("Invoice exceeds 100 MB");
  const tracking = form.get("trackingNumber");
  const date = form.get("specialDeliveryDate");
  try {
    const result = await recordShipment({
      requestId: id,
      staffId: guard.user.id,
      invoice: invoice
        ? {
            fileName: invoice.name,
            mimeType: invoice.type || "application/pdf",
            bytes: Buffer.from(await invoice.arrayBuffer()),
          }
        : null,
      trackingNumber: typeof tracking === "string" ? tracking : null,
      specialDeliveryDate: typeof date === "string" ? date : null,
      ip: clientIp(req),
    });
    return NextResponse.json({ shipped: result.shipped, mailed: result.mailed }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /Cannot ship/.test(err.message)) {
      return badRequest(err.message);
    }
    throw err;
  }
}
