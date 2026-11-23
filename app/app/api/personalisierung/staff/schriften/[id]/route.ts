import { alsStaff, persError, persJson } from "@/lib/personalisierung/http";
import { loescheSchrift } from "@/lib/personalisierung/repo";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Schrift löschen", async () => {
    if (!(await loescheSchrift((await ctx.params).id))) return persError(404, "nicht_gefunden", "Schrift nicht gefunden.");
    return persJson({ ok: true });
  });
}
