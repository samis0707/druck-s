import { istObjekt, alsStaff, leseJson, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { listeKunden, setzeKunden } from "@/lib/personalisierung/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return alsStaff(req, "Kunden lesen", async () => persJson({ kunden: await listeKunden((await ctx.params).id) }));
}

/** Sichtbarkeit „bestimmte Kunden“: { kundenIds: string[] } ersetzt die Zuordnung. */
export async function PUT(req: Request, ctx: Ctx) {
  return alsStaff(req, "Kunden setzen", async () => {
    const { id } = await ctx.params;
    const body = await leseJson(req, 64 * 1024);
    if (!istObjekt(body) || !Array.isArray(body.kundenIds) || body.kundenIds.some((k) => typeof k !== "string")) throw new PersFehler("kundenIds muss eine Liste von Kunden-IDs sein.");
    await setzeKunden(id, body.kundenIds as string[]);
    return persJson({ kunden: await listeKunden(id) });
  });
}
