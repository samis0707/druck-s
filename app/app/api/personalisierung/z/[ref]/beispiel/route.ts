import { persFailure } from "@/lib/personalisierung/http";
import { beispielCsv, beispielXlsx } from "@/lib/personalisierung/tabelle";
import { detailFuerAufruf, loeseZugang } from "@/lib/personalisierung/zugang";

/** Beispieltabelle mit den richtigen Spaltenköpfen. `?format=csv` oder xlsx (Standard). */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    const vorlage = (await detailFuerAufruf(req, z)).vorlage;
    const csv = new URL(req.url).searchParams.get("format") === "csv";
    const bytes = csv ? beispielCsv(vorlage) : beispielXlsx(vorlage);
    const name = vorlage.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vorlage";
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}-beispiel.${csv ? "csv" : "xlsx"}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return persFailure(e, "Beispieltabelle");
  }
}
