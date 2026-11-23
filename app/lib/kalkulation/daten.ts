/**
 * Stammdaten für die Kalkulation: aus der Datenbank geladen und geprüft, im Speicher gehalten,
 * solange sich der Stand (Summe der Bereichsversionen) nicht ändert.
 */
import { stand, sicherung } from "./store";
import { datenAusSicherung, type Daten } from "./schnittstelle";
import { heuteIso } from "./zeit";

export type GeladeneDaten =
  | { ok: true; daten: Daten }
  | { ok: false; leer: boolean; fehler: string[] };

let zwischen: { stand: number; ergebnis: GeladeneDaten } | null = null;

export async function ladeDaten(): Promise<GeladeneDaten> {
  const s = await stand();
  if (zwischen !== null && zwischen.stand === s) return zwischen.ergebnis;
  let ergebnis: GeladeneDaten;
  if (s === 0) {
    ergebnis = { ok: false, leer: true, fehler: ["Noch keine Stammdaten vorhanden"] };
  } else {
    const r = datenAusSicherung(await sicherung(heuteIso()));
    ergebnis = r.ok ? { ok: true, daten: r.daten } : { ok: false, leer: false, fehler: r.fehler };
  }
  zwischen = { stand: s, ergebnis };
  return ergebnis;
}

/** Für Tests: Zwischenspeicher leeren. */
export function datenZwischenspeicherLeeren(): void {
  zwischen = null;
}
