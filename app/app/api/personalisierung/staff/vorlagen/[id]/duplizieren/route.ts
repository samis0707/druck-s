import { alsStaff, persError, persJson } from "@/lib/personalisierung/http";
import { dupliziereVorlage } from "@/lib/personalisierung/repo";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Vorlage duplizieren", async (user) => {
    const d = await dupliziereVorlage((await ctx.params).id, user.id);
    if (!d) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    return persJson(d, 201);
  });
}
