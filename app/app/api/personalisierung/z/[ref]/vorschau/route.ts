import { config } from "@/lib/config";
import { begrenzeJeIp, vorschau, zaehle } from "@/lib/personalisierung/dienst";
import { DatensatzSchema } from "@/lib/personalisierung/schema";
import { istObjekt, leseJson, persFailure, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { detailFuerAufruf, loeseZugang } from "@/lib/personalisierung/zugang";

/**
 * Vorschau für einen Datensatz (ohne Datensatz: Beispielwerte). Antwort: PDF (Vorder- und Rückseite, Endformat
 * mit Beschnitt) oder mit `?format=json` { pdf (base64), meldungen }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    await begrenzeJeIp("pers_preview", z.ip, config.personalisierung.previewsPerIpPerHour);
    const body = await leseJson(req, 64 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    let datensatz = null;
    if (body.datensatz !== undefined && body.datensatz !== null) {
      const p = DatensatzSchema.safeParse(body.datensatz);
      if (!p.success) throw new PersFehler("Der Datensatz ist ungültig.");
      datensatz = p.data;
    }
    await zaehle("pers_preview", z.ip, z.akteur, { templateId: z.detail.id });
    const r = await vorschau(await detailFuerAufruf(req, z), datensatz);
    if (new URL(req.url).searchParams.get("format") === "json") {
      return persJson({ pdf: Buffer.from(r.pdf!).toString("base64"), meldungen: r.meldungen });
    }
    return new Response(Buffer.from(r.pdf!), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "content-disposition": 'inline; filename="vorschau.pdf"' } });
  } catch (e) {
    return persFailure(e, "Vorschau");
  }
}
