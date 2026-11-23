import { zaehleAbruf } from "@/lib/kalkulation/begrenzung";
import { kalkJson } from "@/lib/kalkulation/http";
import { oeffentlicheArtikel } from "@/lib/kalkulation/richtpreisService";

/**
 * Öffentlich, ohne Login: für den Shop freigegebene Artikel mit ihren Fragen in
 * kundenverständlicher Form. Keine Kosten, keine internen Angaben, keine personenbezogenen Daten.
 */
export async function GET(req: Request) {
  if (!zaehleAbruf(req)) {
    return kalkJson({ error: "Zu viele Abrufe von dieser Adresse, bitte später erneut versuchen.", code: "zu_viele_anfragen" }, 429, { "retry-after": "3600" });
  }
  try {
    const r = await oeffentlicheArtikel();
    return kalkJson(r.body, r.status);
  } catch (err) {
    console.error("[richtpreis] Artikelliste fehlgeschlagen:", err instanceof Error ? err.message : err);
    return kalkJson({ error: "Interner Fehler.", code: "interner_fehler" }, 500);
  }
}
