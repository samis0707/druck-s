import { persFailure } from "@/lib/personalisierung/http";
import { beispielCsv, beispielXlsx } from "@/lib/personalisierung/tabelle";
import { loeseZugang } from "@/lib/personalisierung/zugang";

/** Beispieltabelle mit den richtigen Spaltenköpfen. `?format=csv` oder xlsx (Standard). */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    const csv = new URL(req.url).searchParams.get("format") === "csv";
    const bytes = csv ? beispielCsv(z.detail.vorlage) : beispielXlsx(z.detail.vorlage);
    const name = z.detail.vorlage.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vorlage";
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}-beispiel.${csv ? "csv" : "xlsx"}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return persFailure(e, "Beispieltabelle");
  }
}
