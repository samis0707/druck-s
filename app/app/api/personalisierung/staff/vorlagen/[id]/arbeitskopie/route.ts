import { alsStaff, leseJson, persError, persJson, istObjekt } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { speichereArbeitskopie, verwerfeArbeitskopie } from "@/lib/personalisierung/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Autospeichern des Editors: { vorlage } wird als Arbeitskopie abgelegt (keine neue Version, nur grobe Prüfung). */
export async function PUT(req: Request, ctx: Ctx) {
  return alsStaff(req, "Arbeitskopie speichern", async () => {
    const body = await leseJson(req, 600 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const ok = await speichereArbeitskopie((await ctx.params).id, body.vorlage);
    if (!ok) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    return persJson({ ok: true, gespeichertAm: new Date().toISOString() });
  });
}

/** Änderungen verwerfen. */
export async function DELETE(req: Request, ctx: Ctx) {
  return alsStaff(req, "Arbeitskopie verwerfen", async () => {
    const ok = await verwerfeArbeitskopie((await ctx.params).id);
    if (!ok) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    return persJson({ ok: true });
  });
}
