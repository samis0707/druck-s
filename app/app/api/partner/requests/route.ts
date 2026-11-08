import { analyzeRequest } from "@/lib/analyze/run";
import { generateNote } from "@/lib/assistantNote";
import { requirePartner } from "@/lib/partners/auth";
import { PartnerFileError } from "@/lib/partners/fetchFile";
import { partnerError, partnerOk } from "@/lib/partners/http";
import { createPartnerRequest, PartnerIntakeError } from "@/lib/partners/intake";
import { validatePartnerRequest } from "@/lib/partners/validate";
import { runPartnerWebhookWorker } from "@/lib/partners/webhook";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Partner legt einen Druckauftrag an (Server-zu-Server, `Authorization: Bearer dmp_…`).
 * 201 = neu angelegt, 200 = gleicher partnerRef schon vorhanden (idempotent, unverändert).
 */
export async function POST(req: Request) {
  const guard = await requirePartner(req);
  if ("error" in guard) return guard.error;
  const { partner } = guard;

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return partnerError(413, "body_too_large", "Request body exceeds 64 KB");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return partnerError(400, "invalid_json", "Invalid JSON body");
  }
  const parsed = validatePartnerRequest(json);
  if (!parsed.ok) {
    return partnerError(400, "invalid_body", parsed.errors.join("; "), parsed.errors);
  }

  try {
    const { request, created } = await createPartnerRequest(partner, parsed.value);
    if (created) {
      // Wie Door A/B: Analyse (Preflight + Virenscan) und KI-Notiz nach dem Eingang, blockiert nie.
      analyzeRequest(request.id)
        .catch((err) => console.error("analysis failed", err))
        .finally(() => generateNote(request.id).catch((err) => console.error("note failed", err)));
      void runPartnerWebhookWorker();
    }
    return partnerOk(request, created ? 201 : 200);
  } catch (err) {
    if (err instanceof PartnerIntakeError || err instanceof PartnerFileError) {
      const res = partnerError(err.status, err.code, err.message);
      if (err.status === 429) res.headers.set("retry-after", "3600");
      return res;
    }
    console.error(`Partner-Auftrag (${partner.slug}) fehlgeschlagen:`, err instanceof Error ? err.message : err);
    return partnerError(500, "internal_error", "Internal error");
  }
}
