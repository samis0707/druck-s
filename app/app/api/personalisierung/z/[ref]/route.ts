import { kundenAnsicht } from "@/lib/personalisierung/repo";
import { persFailure, persJson } from "@/lib/personalisierung/http";
import { loeseZugang } from "@/lib/personalisierung/zugang";

/** Kundenansicht einer Vorlage (nur, was Kunden brauchen). `ref` = Zugriffs-Token oder Vorlagen-ID. */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    return persJson(kundenAnsicht(z.detail));
  } catch (e) {
    return persFailure(e, "Vorlage lesen");
  }
}
