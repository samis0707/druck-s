/** Heutiges Datum (JJJJ-MM-TT) in Deutschland – Stichtag für Preise der Kalkulation. */
export function heuteIso(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}
