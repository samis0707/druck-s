import { plaetzeFuerSchritt } from './arbeitsweg';
import type { Arbeitsschritt, Produktion } from './produktion-schema';
import type { StatusAngabe } from './stamm-liste';

/**
 * Abgeleiteter Status eines Arbeitsschritts: kein aktiver Platz → Fehler, Plätze ohne Leistung →
 * Hinweis, sonst ok.
 */
export function arbeitsschrittStatus(
  produktion: Produktion,
  schritt: Arbeitsschritt,
): StatusAngabe {
  const plaetze = plaetzeFuerSchritt(produktion, schritt.id);
  if (plaetze.length === 0) {
    return { stand: 'fehler', gruende: ['kein Arbeitsplatz kann ihn'] };
  }
  if (!plaetze.some((platz) => platz.rechnet)) {
    return {
      stand: 'hinweis',
      gruende: ['kein Arbeitsplatz mit Leistung – rechnet nicht'],
    };
  }
  return { stand: 'ok', gruende: [] };
}
