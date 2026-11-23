import { istObjekt, leseJson, persError, persFailure, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { holeEntwurf, loescheEntwurf, speichereEntwurf } from "@/lib/personalisierung/repo";
import { loeseZugang } from "@/lib/personalisierung/zugang";

type Ctx = { params: Promise<{ ref: string; id: string }> };

async function zugriff(req: Request, ctx: Ctx) {
  const { ref, id } = await ctx.params;
  const z = await loeseZugang(req, ref);
  if (z instanceof Response) return { fehler: z } as const;
  const token = req.headers.get("x-entwurf-token") ?? "";
  const entwurf = await holeEntwurf(id, token);
  if (!entwurf || entwurf.templateId !== z.detail.id) return { fehler: persError(404, "nicht_gefunden", "Dieser Entwurf existiert nicht mehr.") } as const;
  return { z, id, token, entwurf } as const;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const a = await zugriff(req, ctx);
    if ("fehler" in a) return a.fehler;
    return persJson(a.entwurf);
  } catch (e) {
    return persFailure(e, "Entwurf lesen");
  }
}

/** Datensätze und Einstellungen speichern; verlängert die Lebensdauer. */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const a = await zugriff(req, ctx);
    if ("fehler" in a) return a.fehler;
    const body = await leseJson(req);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const einstellungen = istObjekt(body.einstellungen) ? body.einstellungen : undefined;
    const neu = await speichereEntwurf(a.id, a.token, { datensaetze: body.datensaetze, einstellungen });
    if (!neu) return persError(404, "nicht_gefunden", "Dieser Entwurf existiert nicht mehr.");
    return persJson(neu);
  } catch (e) {
    return persFailure(e, "Entwurf speichern");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const a = await zugriff(req, ctx);
    if ("fehler" in a) return a.fehler;
    await loescheEntwurf(a.id, a.token);
    return persJson({ geloescht: true });
  } catch (e) {
    return persFailure(e, "Entwurf löschen");
  }
}
