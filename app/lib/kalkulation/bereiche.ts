/**
 * Aus kalpri/apps/schnittstelle/src/bereiche.ts übernommen (Logik unverändert).
 * T168: Die Datenbereiche der Werkbank – dieselben Blöcke wie im Browser-Speicher und in der
 * Sicherung. Der Server prüft jeden Bereich beim Schreiben mit dem Schema aus @druck/resources
 * (AGENTS: Prüfungen nicht nur im Frontend).
 */
import {
  artikelbestandAusJson,
  kalkulationenAusJson,
  lagerAusJson,
  lagerbestandAusJson,
  produktionAusJson,
  werkzeugeAusJson,
} from '@druck/resources';

type Ergebnis = { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] };

const meldung = (r: Ergebnis): string | null =>
  r.ok ? null : `${r.fehler[0]?.pfad ?? ''} ${r.fehler[0]?.meldung ?? 'ungültig'}`.trim();

/** Nur gültiges JSON (Eingaben der Werkbank, Ausschießschemas – die prüft layout-core im Browser). */
function nurJson(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch {
    return 'kein gültiges JSON';
  }
}

export type Bereich = { schluessel: string; name: string; pruefe: (text: string) => string | null };

export const BEREICHE: readonly Bereich[] = [
  { schluessel: 'werkbank.material.v1', name: 'Material', pruefe: (t) => meldung(lagerAusJson(t)) },
  {
    schluessel: 'werkbank.werkzeuge.v1',
    name: 'Werkzeuge',
    pruefe: (t) => meldung(werkzeugeAusJson(t)),
  },
  {
    schluessel: 'werkbank.bestand.v1',
    name: 'Bestand',
    pruefe: (t) => meldung(lagerbestandAusJson(t)),
  },
  {
    schluessel: 'werkbank.produktion.v1',
    name: 'Produktion',
    pruefe: (t) => meldung(produktionAusJson(t)),
  },
  {
    schluessel: 'werkbank.kalkulation.v1',
    name: 'Kalkulationen',
    pruefe: (t) => meldung(kalkulationenAusJson(t)),
  },
  {
    schluessel: 'werkbank.artikel.v1',
    name: 'Artikel',
    pruefe: (t) => meldung(artikelbestandAusJson(t)),
  },
  { schluessel: 'werkbank.vorlagen.v1', name: 'Formate und Ausschießschemas', pruefe: nurJson },
  { schluessel: 'werkbank.ausschiessen.v1', name: 'Ausschießen (Eingaben)', pruefe: nurJson },
  { schluessel: 'werkbank.stanze.v1', name: 'Stanze (Eingaben)', pruefe: nurJson },
];

export function bereich(schluessel: string): Bereich | undefined {
  return BEREICHE.find((b) => b.schluessel === schluessel);
}

/** Dateiendungen: der kalpri-Name der Sicherung. */
export const SICHERUNG_ART = "werkbank-sicherung";
