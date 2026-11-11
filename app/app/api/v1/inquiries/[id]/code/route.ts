import { clientIp } from "@/lib/guards";
import { inquiryError, inquiryFailure, inquiryJson, readJson } from "@/lib/inquiry/http";
import { sendInquiryCode } from "@/lib/inquiry/intake";
import { validateContact } from "@/lib/inquiry/validate";
import type { InquiryContact } from "@/lib/requests/types";

export const dynamic = "force-dynamic";

/**
 * Offene Anfrage, Schritt 3: sechsstelligen Code an die Kontakt-Adresse senden.
 * Optionaler Körper `{ contact }` setzt oder ersetzt den Kontakt des Entwurfs.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  let contact: InquiryContact | null = null;
  const raw = (body.value as { contact?: unknown } | null)?.contact;
  if (raw !== undefined && raw !== null) {
    const parsed = validateContact(raw);
    if (!parsed.ok) return inquiryError(400, "invalid_body", parsed.errors.join("; "), parsed.errors);
    contact = parsed.value;
  }
  try {
    const sent = await sendInquiryCode(id, contact, { ip: clientIp(req) });
    return inquiryJson({ sent: true, ...sent }, 202);
  } catch (err) {
    return inquiryFailure(err, "Code-Versand");
  }
}
