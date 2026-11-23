import { query } from "@/lib/db";
import { getRequestFile } from "@/lib/storageFiles";
import { alsStaff, persError } from "@/lib/personalisierung/http";
import { istUuid } from "@/lib/personalisierung/repo";

/** Schriftdatei für den Editor im Browser (Live-Vorschau mit der Render-Engine). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Schriftdatei", async () => {
    const { id } = await ctx.params;
    const r = istUuid(id) ? await query<{ storage_key: string }>("SELECT storage_key FROM pers_fonts WHERE id = $1 AND scan_status <> 'INFECTED'", [id]) : null;
    if (!r?.rows[0]) return persError(404, "nicht_gefunden", "Schrift nicht gefunden.");
    return new Response(new Uint8Array(await getRequestFile(r.rows[0].storage_key)), { headers: { "content-type": "font/ttf", "cache-control": "private, max-age=3600" } });
  });
}
