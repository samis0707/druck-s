import { analyzeRequest } from "@/lib/analyze/run";
import { generateNote } from "@/lib/assistantNote";
import { clientIp } from "@/lib/guards";
import { inquiryError, inquiryFailure, inquiryJson, readJson } from "@/lib/inquiry/http";
import { confirmInquiry } from "@/lib/inquiry/intake";
import { normalizeCode } from "@/lib/inquiry/validate";

export const dynamic = "force-dynamic";

/**
 * Offene Anfrage, Schritt 4: mit dem Code aus der E-Mail bestätigen. Erst jetzt ist die Anfrage
 * eingegangen (Auftragsnummer, automatische Prüfung, Hinweis an die Druckerei).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const code = normalizeCode((body.value as { code?: unknown } | null)?.code);
  if (!code) return inquiryError(400, "invalid_body", "code must be the six digits from the email", ["code must be six digits"]);
  try {
    const result = await confirmInquiry(id, code, { ip: clientIp(req) });
    // Wie Door A/B: Analyse (Preflight + Virenscan) und KI-Notiz nach dem Eingang, blockiert nie.
    analyzeRequest(id)
      .catch((err) => console.error("analysis failed", err))
      .finally(() => generateNote(id).catch((err) => console.error("note failed", err)));
    return inquiryJson({
      inquiry: result.inquiry,
      message: result.customer
        ? "Eingegangen und Ihrem Kundenkonto zugeordnet. Sie finden den Auftrag nach der Anmeldung unter „Meine Aufträge“."
        : "Eingegangen. Die Druckerei meldet sich persönlich bei Ihnen.",
    });
  } catch (err) {
    return inquiryFailure(err, "Bestätigung");
  }
}
