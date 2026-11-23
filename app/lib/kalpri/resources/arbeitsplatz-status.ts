import type { StatusAngabe } from './stamm-liste';
import { arbeitsplatzHinweise } from './arbeitsplaetze';
import type { Arbeitsplatz, Produktion } from './produktion-schema';

/**
 * Abgeleiteter Status eines Arbeitsplatzes: alle Hinweise aus `arbeitsplatzHinweise` in ihrer
 * Reihenfolge, dahinter „inaktiv“ für stillgelegte Plätze. Endet ein Grund auf „– rechnet nicht“,
 * ist der Stand Fehler, sonst Hinweis (mit Gründen) oder ok.
 */
export function arbeitsplatzStatus(produktion: Produktion, platz: Arbeitsplatz): StatusAngabe {
  const gruende = arbeitsplatzHinweise(produktion, platz);
  if (platz.inaktiv === true) {
    gruende.push('inaktiv (Ersatzgerät, gesperrt)');
  }
  const stand = gruende.some((grund) => grund.endsWith('– rechnet nicht'))
    ? 'fehler'
    : gruende.length > 0
      ? 'hinweis'
      : 'ok';
  return { stand, gruende };
}
