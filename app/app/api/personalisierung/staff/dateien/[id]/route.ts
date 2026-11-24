import { alsStaff, persError } from "@/lib/personalisierung/http";
import { dateiBytes, holeDatei } from "@/lib/personalisierung/repo";

const INLINE_TYPEN = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Datei ausliefern (z. B. Design-PDF für den Editor mit pdf.js). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Datei lesen", async () => {
    const { id } = await ctx.params;
    const d = await holeDatei(id);
    const bytes = d ? await dateiBytes(id) : null;
    if (!d || !bytes) return persError(404, "nicht_gefunden", "Datei nicht gefunden.");
    // Nur die geprüften Typen (PDF, PNG, JPEG) werden inline angezeigt; alles andere als Download. nosniff immer.
    const inline = INLINE_TYPEN.has(d.mime);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": inline ? d.mime : "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-disposition": inline ? "inline" : 'attachment; filename="datei"',
        "x-content-type-options": "nosniff",
      },
    });
  });
}
