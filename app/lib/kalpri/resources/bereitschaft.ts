import type { Lager } from './lager-schema';
import type { Produktion } from './produktion-schema';
import { arbeitsplatzStatus } from './arbeitsplatz-status';
import { arbeitsschrittStatus } from './arbeitsschritt-status';
import { kostenstelleStatus } from './kostenstelle-status';
import { materialStatus } from './material-status';

export type BereitschaftBefund = {
  stand: 'fehler' | 'hinweis';
  bereich: 'Arbeitsplatz' | 'Arbeitsschritt' | 'Kostenstelle' | 'Material';
  id: string;
  name: string;
  gruende: string[];
};

export type Bereitschaft = {
  befunde: BereitschaftBefund[];
  fehler: number;
  hinweise: number;
  /** Aktive Plätze ohne Fremdarbeit mit mindestens zwei Schritten (Kandidaten zum Aufteilen). */
  sammelplaetze: { id: string; name: string; schritte: string[] }[];
};

/**
 * Führt die vorhandenen Status-Funktionen zu einer Prüfübersicht zusammen: zuerst alle Fehler,
 * dann alle Hinweise, innerhalb davon nach Bereich und Listenreihenfolge. Nichts wird gepflegt.
 */
export function bereitschaftPruefen(
  produktion: Produktion,
  lager: Lager,
  stichtag: string,
): Bereitschaft {
  const fehler: BereitschaftBefund[] = [];
  const hinweise: BereitschaftBefund[] = [];

  const merken = (
    stand: 'fehler' | 'hinweis',
    bereich: BereitschaftBefund['bereich'],
    id: string,
    name: string,
    gruende: string[],
  ): void => {
    const befund: BereitschaftBefund = { stand, bereich, id, name, gruende };
    (stand === 'fehler' ? fehler : hinweise).push(befund);
  };

  for (const platz of produktion.arbeitsplaetze ?? []) {
    if (platz.inaktiv === true) continue;
    const status = arbeitsplatzStatus(produktion, platz);
    if (status.stand !== 'ok')
      merken(status.stand, 'Arbeitsplatz', platz.id, platz.name, status.gruende);
  }
  for (const schritt of produktion.arbeitsschritte) {
    const status = arbeitsschrittStatus(produktion, schritt);
    if (status.stand !== 'ok') {
      merken(status.stand, 'Arbeitsschritt', schritt.id, schritt.name, status.gruende);
    }
  }
  for (const kostenstelle of produktion.kostenstellen ?? []) {
    const status = kostenstelleStatus(produktion, kostenstelle);
    if (status.stand !== 'ok') {
      merken(status.stand, 'Kostenstelle', kostenstelle.id, kostenstelle.name, status.gruende);
    }
  }
  for (const material of lager.materialien) {
    const status = materialStatus(lager, material, stichtag);
    if (status.stand !== 'ok')
      merken(status.stand, 'Material', material.id, material.sorte, status.gruende);
  }

  const sammelplaetze = (produktion.arbeitsplaetze ?? [])
    .filter(
      (platz) =>
        platz.inaktiv !== true && platz.fremdarbeit === undefined && platz.schritte.length >= 2,
    )
    .map((platz) => ({
      id: platz.id,
      name: platz.name,
      schritte: platz.schritte.map(
        (s) => produktion.arbeitsschritte.find((k) => k.id === s.schrittId)?.name ?? s.schrittId,
      ),
    }));

  return {
    befunde: [...fehler, ...hinweise],
    fehler: fehler.length,
    hinweise: hinweise.length,
    sammelplaetze,
  };
}
