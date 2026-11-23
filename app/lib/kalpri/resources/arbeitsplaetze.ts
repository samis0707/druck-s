import { leistung, ms, type Leistung } from '@druck/units';
import type { Arbeitsplatz, Produktion } from './produktion-schema';
import { schrittLeistung } from './produktion-schema';
import { stundensatzDesPlatzes } from './stundensatz';

/** Arbeitsplätze, an denen der Arbeitsschritt möglich ist („erst was, dann wo“), in Listenreihenfolge. */
export function arbeitsplaetzeFuerSchritt(
  produktion: Produktion,
  schrittId: string,
): Arbeitsplatz[] {
  return (produktion.arbeitsplaetze ?? []).filter((platz) =>
    platz.schritte.some((s) => s.schrittId === schrittId),
  );
}

/**
 * Leistung des Schritts am Platz in der Einheit des Schritts (aus dem Katalog).
 * null, wenn Platz oder Schritt fehlen oder keine Leistung hinterlegt ist.
 */
export function leistungAmPlatz(
  produktion: Produktion,
  platzId: string,
  schrittId: string,
): Leistung | null {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  const amPlatz = platz?.schritte.find((s) => s.schrittId === schrittId);
  const schritt = produktion.arbeitsschritte.find((s) => s.id === schrittId);
  const l = platz && amPlatz ? schrittLeistung(platz, amPlatz) : undefined;
  if (!l || !schritt) {
    return null;
  }
  return leistung(l.menge, schritt.einheit, ms(l.dauerMs));
}

/**
 * Hinweise zum Arbeitsplatz (keine Fehler – gespeichert werden darf trotzdem):
 * fehlender Stundensatz, vorläufiger Stundensatz, fehlende Teilkosten, keine Schritte,
 * Schritt ohne Leistung (mit Namen aus dem Katalog). Fremdarbeit: nur „Lieferant nicht hinterlegt“.
 */
export function arbeitsplatzHinweise(produktion: Produktion, platz: Arbeitsplatz): string[] {
  const hinweise: string[] = [];
  if (platz.fremdarbeit) {
    // Zukauf: kein Stundensatz, keine Leistung – Preise kommen je Anfrage.
    if (platz.fremdarbeit.lieferant === undefined && platz.fremdarbeit.lieferantId === undefined) {
      hinweise.push('Lieferant nicht hinterlegt');
    }
    return hinweise;
  }
  const satz = stundensatzDesPlatzes(produktion, platz);
  if (satz.stundensatzVollZehntelcent === undefined) {
    hinweise.push('Stundensatz fehlt – rechnet nicht');
  } else if (satz.stundensatzTeilZehntelcent === undefined) {
    hinweise.push('Teilkosten nicht hinterlegt');
  }
  if (satz.vorlaeufig) {
    hinweise.push('Stundensatz vorläufig');
  }
  if (platz.schritte.length === 0) {
    hinweise.push('Keine Arbeitsschritte');
  }
  for (const s of platz.schritte) {
    // „läuft mit“ (T99): keine eigene Leistung nötig, die Laufzeit kommt vom anderen Schritt
    if (!schrittLeistung(platz, s) && s.laeuftMit === undefined) {
      const name =
        produktion.arbeitsschritte.find((k) => k.id === s.schrittId)?.name ?? s.schrittId;
      hinweise.push(`${name}: Leistung fehlt – rechnet nicht`);
    }
  }
  return hinweise;
}
