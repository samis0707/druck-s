import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  guenstigsteGruppen,
  rechneKalkulation,
  type Farbwerk,
  type Kalkulation,
  type Produktion,
} from './index';

/** Ricoh mit CMYK und einer Klickart in zwei Stufen nach Bogenlänge (Nutzer 28.10.). */
const WERK: Farbwerk = {
  farben: [
    { name: 'Cyan', art: 'cyan' },
    { name: 'Magenta', art: 'magenta' },
    { name: 'Gelb', art: 'gelb' },
    { name: 'Schwarz', art: 'schwarz' },
  ],
  stationen: [{ farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }],
  gruppen: [
    {
      name: '4c',
      farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'],
      klicks: [
        { bisLaengeUm: 487_000, zehntelcent: 37 },
        { bisLaengeUm: 700_000, zehntelcent: 74 },
      ],
    },
  ],
};

function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ricoh = p.arbeitsplaetze?.find((a) => a.id === 'AP-TON5C');
  if (!ricoh) throw new Error('AP-TON5C fehlt');
  ricoh.farbwerk = WERK;
  return p;
}

/** Visitenkarten wie K-0003 des Nutzers: Druckzeile ohne Material und ohne Teil, 4/4, −50 %. */
const ALT: Kalkulation = {
  id: 'K9002',
  titel: 'Visitenkarten (altes Muster)',
  kunde: '',
  auflagen: [100],
  einheit: 'Stueck',
  gewinnProzent: 0,
  zeilen: [
    {
      art: 'arbeitsgang',
      id: 'Z1',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      menge: { art: 'auflage', teiler: 21 },
      aenderung: { leistungProzent: -50 },
      druck: { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
    },
  ],
};

describe('Hinweise am Druck (Nutzer 30.10.)', () => {
  it('ohne Bogenformat: ehrliche Meldung statt „kein Klickpreis für Cyan“', () => {
    expect(guenstigsteGruppen(WERK, ['Cyan'], undefined)).toEqual({
      ok: false,
      meldung: 'Bogenformat unbekannt (Material oder Teil an der Zeile wählen)',
    });
    // mit Format, aber zu lang: wie bisher
    expect(guenstigsteGruppen(WERK, ['Cyan'], { breiteUm: 330_000, hoeheUm: 1_000_000 })).toEqual({
      ok: false,
      meldung: 'Kein Klickpreis für Cyan bei diesem Bogenformat',
    });
  });

  it('4/4 mit „Leistung −50 %“: Warnung, und Klicks brauchen ein Format', () => {
    const z = rechneKalkulation(ALT, produktion(), BEISPIEL_LAGER, '2026-10-30').auflagen[0]
      ?.zeilen[0];
    expect(z?.hinweise).toContain(
      'Leistung −50 % im Arbeitsgang und 4/4 rechnet schon 2 Durchgänge – Widerdruck doppelt? Änderung prüfen',
    );
    expect(z?.hinweise).toContain(
      'Bogenformat unbekannt (Material oder Teil an der Zeile wählen) – Klicks nicht gerechnet',
    );
    // ohne Änderung keine Warnung
    const ohne: Kalkulation = {
      ...ALT,
      zeilen: ALT.zeilen.map((x) => (x.art === 'arbeitsgang' ? { ...x, aenderung: undefined } : x)),
    };
    const h = rechneKalkulation(ohne, produktion(), BEISPIEL_LAGER, '2026-10-30').auflagen[0]
      ?.zeilen[0]?.hinweise;
    expect(h?.some((x) => x.startsWith('Leistung'))).toBe(false);
  });
});
