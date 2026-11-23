import { istObjekt, alsStaff, leseJson, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { vorschau } from "@/lib/personalisierung/dienst";
import { listeFarben } from "@/lib/personalisierung/repo";
import { DatensatzSchema, farbenInVorlage, parseVorlage } from "@/lib/personalisierung/schema";

/**
 * Vorschau einer (noch ungespeicherten) Vorlage für den Editor: { vorlage, datensatz? }.
 * Antwort: PDF oder mit `?format=json` { pdf (base64), meldungen }. Fehler in den Daten brechen die Vorschau nicht ab.
 */
export async function POST(req: Request) {
  return alsStaff(req, "Staff-Vorschau", async () => {
    const body = await leseJson(req, 512 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const p = parseVorlage(body.vorlage);
    if (!p.ok) throw new PersFehler(p.fehler.map((f) => `${f.pfad ? f.pfad + ": " : ""}${f.text}`).join("; "), 400, "schema");
    let datensatz = null;
    if (body.datensatz !== undefined && body.datensatz !== null) {
      const d = DatensatzSchema.safeParse(body.datensatz);
      if (!d.success) throw new PersFehler("Der Datensatz ist ungültig.");
      datensatz = d.data;
    }
    const namen = new Set(farbenInVorlage(p.vorlage));
    const farben = (await listeFarben()).filter((f) => namen.has(f.name)).map(({ id: _id, ...f }) => (void _id, f));
    const r = await vorschau({ vorlage: p.vorlage, farben } as never, datensatz);
    if (new URL(req.url).searchParams.get("format") === "json") return persJson({ pdf: Buffer.from(r.pdf!).toString("base64"), meldungen: r.meldungen });
    return new Response(Buffer.from(r.pdf!), { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
  });
}
