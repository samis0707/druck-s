import { grenzenHinweise } from './probe';
import type { Material } from './material';
import type { Arbeitsplatz } from './produktion-schema';
import { merkmaleAusMaterial } from './auspraegungen';

/**
 * Passt das Material auf den Arbeitsplatz (reine Funktion, T69)?
 * Dieselbe Grenzen-Prüfung wie in der Probe-Rechnung: grenzenHinweise gegen die Grenzen am
 * Platz (Format je Lagen, Grammatur, Dicke; merkmaleAusMaterial liefert den Bezug zur
 * Probe). Keine neue Matching-Regel. Ohne Grenzen am Platz passt alles (offen).
 */
export function materialPasstAufPlatz(material: Material, platz: Arbeitsplatz): boolean {
  return grenzenHinweise(platz.grenzen, merkmaleAusMaterial(material)).length === 0;
}
