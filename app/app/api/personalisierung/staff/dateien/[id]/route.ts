import { alsStaff, persError } from "@/lib/personalisierung/http";
import { dateiBytes, holeDatei } from "@/lib/personalisierung/repo";

/** Datei ausliefern (z. B. Design-PDF für den Editor mit pdf.js). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Datei lesen", async () => {
    const { id } = await ctx.params;
    const d = await holeDatei(id);
    const bytes = d ? await dateiBytes(id) : null;
    if (!d || !bytes) return persError(404, "nicht_gefunden", "Datei nicht gefunden.");
    return new Response(Buffer.from(bytes), { headers: { "content-type": d.mime, "cache-control": "private, max-age=3600", "content-disposition": "inline" } });
  });
}
