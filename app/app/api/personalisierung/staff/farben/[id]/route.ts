import { istObjekt, alsStaff, leseJson, persJson, persError } from "@/lib/personalisierung/http";
import { loescheFarbe, speichereFarbe } from "@/lib/personalisierung/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return alsStaff(req, "Farbe ändern", async () => {
    const body = await leseJson(req, 16 * 1024);
    return persJson(await speichereFarbe(istObjekt(body) ? body : {}, (await ctx.params).id));
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return alsStaff(req, "Farbe löschen", async () => {
    if (!(await loescheFarbe((await ctx.params).id))) return persError(404, "nicht_gefunden", "Farbe nicht gefunden.");
    return persJson({ ok: true });
  });
}
