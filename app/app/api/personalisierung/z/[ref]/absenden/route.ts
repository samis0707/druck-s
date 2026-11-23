import { istObjekt, leseJson, persFailure, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { sendeDirekt, startGastAbsenden } from "@/lib/personalisierung/absenden";
import { loeseZugang } from "@/lib/personalisierung/zugang";

export const dynamic = "force-dynamic";

/**
 * Absenden. Header `x-entwurf-token`, Körper { entwurfId, anmerkung?, kontakt? , fuerKundeId? }.
 *  - Gast (Token-Link): { kontakt: { name, email, organisation?, phone? } } → Code per E-Mail, Antwort { modus: "code", anfrageId, sentTo }.
 *  - Kunde mit Konto / Mitarbeiter für einen Kunden (`fuerKundeId`): sofort eingegangen, Antwort { modus: "direkt", anfrageId, nummer }.
 * Die Druckdaten werden serverseitig aus dem gespeicherten Entwurf erzeugt, nie aus Eingaben dieses Aufrufs.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    const body = await leseJson(req, 32 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const token = req.headers.get("x-entwurf-token") ?? "";
    if (z.akteur.type === "system") {
      const r = await startGastAbsenden(z, { entwurfId: body.entwurfId, token, kontakt: body.kontakt, anmerkung: body.anmerkung });
      return persJson({ modus: "code", ...r }, 202);
    }
    const r = await sendeDirekt(z, { entwurfId: body.entwurfId, token, anmerkung: body.anmerkung, fuerKundeId: body.fuerKundeId });
    return persJson({ modus: "direkt", ...r }, 201);
  } catch (e) {
    return persFailure(e, "Absenden");
  }
}
