import { zaehleBerechnung } from "@/lib/kalkulation/begrenzung";
import { kalkJson, leseJson } from "@/lib/kalkulation/http";
import { kundenRichtpreisAktiv } from "@/lib/kalkulation/kundenRichtpreis";
import { berechneOeffentlich } from "@/lib/kalkulation/richtpreisService";

/**
 * Öffentlich, ohne Login: unverbindlicher Richtpreis (Spanne) für einen freigegebenen Artikel mit
 * 1–6 Auflagen. Begrenzt je IP-Adresse und Stunde; Eingaben streng geprüft; die Antwort enthält
 * keine Kosten und keine personenbezogenen Daten.
 */
export async function POST(req: Request) {
  try {
    if (!(await kundenRichtpreisAktiv())) {
      return kalkJson({ error: "Der Richtpreis ist derzeit nicht aktiv.", code: "nicht_aktiv" }, 403);
    }
    const j = await leseJson(req);
    if (!j.ok) return kalkJson({ error: j.status === 413 ? "Die Anfrage ist zu groß." : "Der Rumpf ist kein gültiges JSON.", code: j.status === 413 ? "zu_gross" : "ungueltiges_json" }, j.status);
    if (!(await zaehleBerechnung(req))) {
      return kalkJson({ error: "Zu viele Berechnungen von dieser Adresse, bitte später erneut versuchen.", code: "zu_viele_anfragen" }, 429, { "retry-after": "3600" });
    }
    const r = await berechneOeffentlich(j.wert);
    return kalkJson(r.body, r.status);
  } catch (err) {
    console.error("[richtpreis] Berechnung fehlgeschlagen:", err instanceof Error ? err.message : err);
    return kalkJson({ error: "Interner Fehler.", code: "interner_fehler" }, 500);
  }
}
