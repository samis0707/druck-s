import { istObjekt, alsStaff, leseJson, persError, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { aktualisiereVorlage, archiviereVorlage, holeVorlage, listeKunden, listeLinks } from "@/lib/personalisierung/repo";
import { appendAudit } from "@/lib/auditLog";

type Ctx = { params: Promise<{ id: string }> };

/** Vorlage mit Kundenzuordnung und Links. `?version=n` liest eine ältere Version. */
export async function GET(req: Request, ctx: Ctx) {
  return alsStaff(req, "Vorlage lesen", async () => {
    const { id } = await ctx.params;
    const v = Number(new URL(req.url).searchParams.get("version") ?? "") || undefined;
    const d = await holeVorlage(id, v);
    if (!d) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    return persJson({ ...d, kunden: await listeKunden(id), links: await listeLinks(id) });
  });
}

/** Ändern: { vorlage?, status?, sichtbarkeit? }. Aktive Vorlagen erhalten dabei eine neue Version. */
export async function PUT(req: Request, ctx: Ctx) {
  return alsStaff(req, "Vorlage ändern", async (user) => {
    const { id } = await ctx.params;
    const body = await leseJson(req, 512 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const d = await aktualisiereVorlage(id, { vorlage: body.vorlage, status: body.status as never, sichtbarkeit: body.sichtbarkeit as never }, user.id);
    if (!d) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    await appendAudit({ action: "pers_template_saved", actorType: "staff", actorId: user.id, detail: { templateId: d.id, version: d.aktuelleVersion } });
    return persJson(d);
  });
}

/** Archiviert die Vorlage (kein hartes Löschen, Anfragen verweisen darauf). `?wiederherstellen=1` hebt es auf. */
export async function DELETE(req: Request, ctx: Ctx) {
  return alsStaff(req, "Vorlage archivieren", async () => {
    const { id } = await ctx.params;
    const ok = await archiviereVorlage(id, new URL(req.url).searchParams.get("wiederherstellen") !== "1");
    if (!ok) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    return persJson({ ok: true });
  });
}
