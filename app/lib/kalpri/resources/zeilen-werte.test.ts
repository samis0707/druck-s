import { describe, expect, it } from 'vitest';
import { zehntelcent } from '@druck/units';
import { BEISPIEL_LAGER, BEISPIEL_PRODUKTION, rechneKalkulation, type Kalkulation } from './index';

const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });

const k: Kalkulation = {
  id: 'K-0001',
  titel: 'Flyer',
  einheit: 'Stueck',
  auflagen: [1000],
  teile: [{ id: 'F', name: 'Flyer', endformat: mm(148, 210), jeProdukt: 1, materialId: 'L2' }],
  zeilen: [
    {
      id: 'Z1',
      art: 'material',
      materialId: 'L2',
      menge: { art: 'hand', mengen: [128] },
      preisVonHand: { zehntelcent: 250_000, je: 'tausend' },
    },
    { id: 'Z2', art: 'material', materialId: 'L2', menge: { art: 'hand', mengen: [128] } },
    {
      id: 'Z3',
      art: 'arbeitsgang',
      platzId: 'AP-FALZ-A',
      schrittId: 'S0011',
      menge: { art: 'hand', mengen: [1000] },
    },
    {
      id: 'Z4',
      art: 'arbeitsgang',
      platzId: 'AP-FALZ-A',
      schrittId: 'S0011',
      menge: { art: 'hand', mengen: [1000] },
      handwerte: { leistungJeStunde: 8000, ruestenMs: 1_200_000, stundensatzZehntelcent: 60_000 },
    },
    { id: 'Z5', art: 'sonstiges', bezeichnung: 'Versand', betraege: [12_000] },
    {
      id: 'Z6',
      art: 'arbeitsgang',
      platzId: 'AP-FEHLT',
      schrittId: 'S0011',
      menge: { art: 'hand', mengen: [1000] },
    },
  ],
};

const zeilen = () => {
  const a = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-11-07').auflagen[0];
  if (!a) throw new Error('keine Auflage');
  return a.zeilen;
};

describe('Werte je Zeile für die Rechenweg-Tabelle (T98)', () => {
  it('Arbeitsgang aus den Stammdaten: Leistung, Rüsten, Satz, nichts von Hand', () => {
    expect(zeilen()[2]?.werte).toEqual({
      art: 'arbeitsgang',
      jeStunde: 14_000,
      leistungVonHand: false,
      ruestenMs: 900_000,
      ruestenVonHand: false,
      satzVoll: zehntelcent(52_000),
      satzVonHand: false,
    });
  });

  it('Arbeitsgang mit Handwerten: alle drei „von Hand“', () => {
    expect(zeilen()[3]?.werte).toEqual({
      art: 'arbeitsgang',
      jeStunde: 8000,
      leistungVonHand: true,
      ruestenMs: 1_200_000,
      ruestenVonHand: true,
      satzVoll: zehntelcent(60_000),
      satzVonHand: true,
    });
  });

  it('Material mit Preis von Hand: Preis je 1.000', () => {
    expect(zeilen()[0]?.werte).toEqual({
      art: 'material',
      je1000: zehntelcent(250_000),
      vonHand: true,
    });
  });

  it('ohne Werte, wenn die Zeile nicht so weit rechnet oder keine hat', () => {
    const z = zeilen();
    expect(z[1]?.werte).toBeUndefined(); // kein Preis im Beispiel-Lager
    expect(z[4]?.werte).toBeUndefined(); // Sonstiges
    expect(z[5]?.werte).toBeUndefined(); // Platz fehlt
  });
});
