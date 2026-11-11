import { inquiryFailure, inquiryJson } from "@/lib/inquiry/http";
import { getInquiry } from "@/lib/inquiry/intake";

export const dynamic = "force-dynamic";

/** Stand einer Anfrage. Inhalte nur im Entwurf; danach nur Nummer und Status. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return inquiryJson({ inquiry: await getInquiry(id) });
  } catch (err) {
    return inquiryFailure(err, "Abruf");
  }
}
