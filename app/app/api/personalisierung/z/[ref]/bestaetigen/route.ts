import { analyzeRequest } from "@/lib/analyze/run";
import { generateNote } from "@/lib/assistantNote";
import { normalizeCode } from "@/lib/inquiry/validate";
import { istObjekt, leseJson, persFailure, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { bestaetigeGastAbsenden } from "@/lib/personalisierung/absenden";
import { loeseZugang } from "@/lib/personalisierung/zugang";

export const dynamic = "force-dynamic";

/** Gast: Code aus der E-Mail eingeben. Erst jetzt geht die Anfrage ein; danach entstehen die Druckdaten. */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    if (z.akteur.type !== "system") throw new PersFehler("Hier ist kein Code nötig.", 400, "direkt");
    const body = await leseJson(req, 8 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const code = normalizeCode(body.code);
    if (!code) throw new PersFehler("Bitte die sechs Ziffern aus der E-Mail eingeben.", 400, "invalid_code");
    const r = await bestaetigeGastAbsenden(z, { entwurfId: body.entwurfId, token: req.headers.get("x-entwurf-token") ?? "", anfrageId: body.anfrageId, code });
    const id = r.inquiry.id;
    analyzeRequest(id)
      .catch((err) => console.error("analysis failed", err instanceof Error ? err.name : err))
      .finally(() => generateNote(id).catch((err) => console.error("note failed", err instanceof Error ? err.name : err)));
    return persJson({ anfrageId: id, nummer: r.inquiry.number, kunde: r.customer, seiten: r.seiten });
  } catch (e) {
    return persFailure(e, "Bestätigen");
  }
}
