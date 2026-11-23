import type { Produktion } from './produktion-schema';

/** Ein Arbeitsplatz, der ein Material nutzt, und wofür (Nutzer 30.10.: Lager nach Maschinen). */
export type MaterialNutzung = { platzId: string; platzName: string; wofuer: string[] };

/**
 * Welche Arbeitsplätze welches Material nutzen: Verbrauch an einem Schritt (z. B. Tinte an der
 * Latex, Ösen an „Kleine Maschinen“) und Ausprägungen mit „Material ist …“ (z. B. Digitalkarton
 * am Tiegel). Je Material jeder Platz einmal, in der Reihenfolge der Plätze; `wofuer` nennt die
 * Schritte bzw. Ausprägungen („Verbrauch Großformatdruck“, „Ausprägung Digitalkarton“).
 * Am Material wird nichts eingetragen – die Zuordnung folgt immer der Produktion.
 */
export function materialNutzung(produktion: Produktion): Map<string, MaterialNutzung[]> {
  const ergebnis = new Map<string, MaterialNutzung[]>();
  const merke = (materialId: string, platzId: string, platzName: string, wofuer: string) => {
    const liste = ergebnis.get(materialId) ?? [];
    let eintrag = liste.find((e) => e.platzId === platzId);
    if (!eintrag) {
      eintrag = { platzId, platzName, wofuer: [] };
      liste.push(eintrag);
      ergebnis.set(materialId, liste);
    }
    if (!eintrag.wofuer.includes(wofuer)) eintrag.wofuer.push(wofuer);
  };
  for (const platz of produktion.arbeitsplaetze ?? []) {
    for (const s of platz.schritte) {
      const name =
        produktion.arbeitsschritte.find((a) => a.id === s.schrittId)?.name ?? s.schrittId;
      for (const v of s.verbrauch ?? []) {
        merke(v.materialId, platz.id, platz.name, `Verbrauch ${name}`);
      }
    }
    // T115: Verbrauchsmaterial der Maschine
    for (const v of platz.verbrauchsmaterial ?? []) {
      merke(v.materialId, platz.id, platz.name, `Verbrauchsmaterial ${v.gruppe}`);
    }
    for (const a of platz.auspraegungen ?? []) {
      for (const b of a.bedingungen) {
        if (b.merkmal === 'material') {
          merke(String(b.wert).trim(), platz.id, platz.name, `Ausprägung ${a.name}`);
        }
      }
    }
  }
  return ergebnis;
}
