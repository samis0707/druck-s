import { arbeitsplaetzeDerKostenstelle } from './stundensatz';
import type { Kostenstelle } from './kostenstelle-schema';
import type { Produktion } from './produktion-schema';
import type { StatusAngabe } from './stamm-liste';

/**
 * Abgeleiteter Status einer Kostenstelle: fehlende Teilkosten, vorläufiger Satz und fehlende
 * Plätze sind Hinweise; einen Fehler gibt es nicht, weil die Vollkosten Pflicht sind.
 */
export function kostenstelleStatus(
  produktion: Produktion,
  kostenstelle: Kostenstelle,
): StatusAngabe {
  const gruende: string[] = [];
  if (kostenstelle.stundensatzTeilZehntelcent === undefined) {
    gruende.push('Teilkosten nicht hinterlegt');
  }
  if (kostenstelle.stundensatzVorlaeufig === true) {
    gruende.push('Stundensatz vorläufig');
  }
  if (arbeitsplaetzeDerKostenstelle(produktion, kostenstelle.id).length === 0) {
    gruende.push('noch kein Platz');
  }
  return gruende.length === 0 ? { stand: 'ok', gruende } : { stand: 'hinweis', gruende };
}
