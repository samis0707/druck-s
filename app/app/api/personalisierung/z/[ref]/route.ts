import { config } from "@/lib/config";
import { kundenAnsicht } from "@/lib/personalisierung/repo";
import { persFailure, persJson } from "@/lib/personalisierung/http";
import { detailFuerAufruf, loeseZugang } from "@/lib/personalisierung/zugang";

/** Kundenansicht einer Vorlage (nur, was Kunden brauchen). `ref` = Zugriffs-Token oder Vorlagen-ID. */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    const typ = z.akteur.type;
    return persJson({
      ...kundenAnsicht(await detailFuerAufruf(req, z)),
      /** Wer ruft auf: Gast (Token-Link), Kunde mit Konto oder Mitarbeiter (füllt im Namen eines Kunden aus) */
      akteur: typ === "system" ? "gast" : typ === "customer" ? "kunde" : "mitarbeiter",
      entwurfStunden: config.personalisierung.draftTtlHours,
    });
  } catch (e) {
    return persFailure(e, "Vorlage lesen");
  }
}
