import { kalkulationMitKey } from "@/lib/kalkulation/keyApi";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return kalkulationMitKey(req, `/v1/artikel/${encodeURIComponent(id)}/kalkulieren`);
}
