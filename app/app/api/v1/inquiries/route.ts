import { clientIp } from "@/lib/guards";
import { inquiryError, inquiryFailure, inquiryJson, readJson } from "@/lib/inquiry/http";
import { createInquiry } from "@/lib/inquiry/intake";
import { validateInquiry } from "@/lib/inquiry/validate";

export const dynamic = "force-dynamic";

/**
 * Offene Anfrage, Schritt 1: Entwurf anlegen. Ohne Anmeldung; bei uns eingegangen ist die Anfrage erst
 * nach der Bestätigung mit dem Code aus dem E-Mail-Postfach (docs/anfrage-api.md, /api/docs).
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = validateInquiry(body.value);
  if (!parsed.ok) return inquiryError(400, "invalid_body", parsed.errors.join("; "), parsed.errors);
  try {
    const inquiry = await createInquiry(parsed.value, { ip: clientIp(req) });
    return inquiryJson({ inquiry }, 201);
  } catch (err) {
    return inquiryFailure(err, "Anlegen");
  }
}
