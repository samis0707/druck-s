import { config } from "@/lib/config";
import { begrenzeJeIp, normalisiereDatensaetze, pruefe, zaehle } from "@/lib/personalisierung/dienst";
import { istObjekt, leseJson, persFailure, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { detailFuerAufruf, loeseZugang } from "@/lib/personalisierung/zugang";

/** Datensätze prüfen: Pflichtfelder, Länge, Textpassung, Barcode-Inhalt. Antwort: { ok, meldungen[] }. */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    await begrenzeJeIp("pers_check", z.ip, config.personalisierung.checksPerIpPerHour);
    const body = await leseJson(req);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const datensaetze = normalisiereDatensaetze(body.datensaetze);
    await zaehle("pers_check", z.ip, z.akteur, { templateId: z.detail.id, records: datensaetze.length });
    const meldungen = await pruefe(await detailFuerAufruf(req, z), datensaetze);
    return persJson({ ok: !meldungen.some((m) => m.schwere === "fehler"), meldungen });
  } catch (e) {
    return persFailure(e, "Prüfen");
  }
}
