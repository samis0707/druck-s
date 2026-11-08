import { requirePartner } from "@/lib/partners/auth";
import { partnerError, partnerOk, validRef } from "@/lib/partners/http";
import { PartnerIntakeError, withdrawPartnerRequest } from "@/lib/partners/intake";
import { runPartnerWebhookWorker } from "@/lib/partners/webhook";

export const dynamic = "force-dynamic";

/**
 * Partner zieht einen Auftrag zurück: nur aus RECEIVED/IN_REVIEW (sonst 409).
 * Wiederholte Aufrufe auf einem zurückgezogenen Auftrag liefern 200 (idempotent).
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const guard = await requirePartner(req);
  if ("error" in guard) return guard.error;
  const { ref } = await ctx.params;
  if (!validRef(ref)) return partnerError(404, "not_found", "Request not found");
  try {
    const { request, changed } = await withdrawPartnerRequest(guard.partner, ref);
    if (changed) void runPartnerWebhookWorker();
    return partnerOk(request);
  } catch (err) {
    if (err instanceof PartnerIntakeError) return partnerError(err.status, err.code, err.message);
    throw err;
  }
}
