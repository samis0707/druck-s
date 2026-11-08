import { requirePartner } from "@/lib/partners/auth";
import { partnerError, partnerOk, validRef } from "@/lib/partners/http";
import { findPartnerRequest } from "@/lib/partners/intake";

export const dynamic = "force-dynamic";

/** Status eines Partner-Auftrags über die Partner-Referenz (nur eigene Aufträge). */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const guard = await requirePartner(req);
  if ("error" in guard) return guard.error;
  const { ref } = await ctx.params;
  if (!validRef(ref)) return partnerError(404, "not_found", "Request not found");
  const request = await findPartnerRequest(guard.partner.id, ref);
  if (!request) return partnerError(404, "not_found", "Request not found");
  return partnerOk(request);
}
