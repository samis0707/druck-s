import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  geltendeEintraege,
  klickHistorieBehalten,
  klickpreiseAendernAb,
  klickpreiseVor,
  klickVerlauf,
  klickSchluessel,
  produktionZumStichtag,
  pruefeProduktion,
  rechneDruckProbe,
  type Arbeitsplatz,
  type Klickpreis,
  type Produktion,
} from './index';

// T164: Klickpreise mit „gültig ab“ – Historie, am Stichtag gilt der neueste

const SRA3 = { breiteUm: 325_000, hoeheUm: 460_000 };
const EINGABE = { platzId: 'AP-TON5C', schrittId: 'S0001', menge: 24 };
const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };

function mitKlicks(klickpreise: Klickpreis[]): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C')!;
  delete ton.farbwerk;
  ton.klickpreise = klickpreise;
  return p;
}

describe('geltendeEintraege (T164)', () => {
  const liste: Klickpreis[] = [
    { farbe: 'farbig', zehntelcent: 30 },
    { farbe: 'schwarz', zehntelcent: 8 },
    { farbe: 'farbig', zehntelcent: 37, gueltigAb: '2026-01-01' },
    { farbe: 'farbig', zehntelcent: 42, gueltigAb: '2027-01-01' },
  ];

  it('am Stichtag der neueste gültige je Farbe; ohne Datum gilt seit jeher', () => {
    const g = (tag: string) =>
      geltendeEintraege(liste, klickSchluessel, tag).map((k) => `${k.farbe} ${k.zehntelcent}`);
    expect(g('2025-06-01')).toEqual(['farbig 30', 'schwarz 8']);
    expect(g('2026-11-17')).toEqual(['farbig 37', 'schwarz 8']);
    expect(g('2027-01-01')).toEqual(['farbig 42', 'schwarz 8']);
  });

  it('nur künftige Einträge: Farbe fehlt bis dahin', () => {
    const r = geltendeEintraege(
      [{ farbe: 'farbig', zehntelcent: 50, gueltigAb: '2030-01-01' }] as Klickpreis[],
      klickSchluessel,
      '2026-11-17',
    );
    expect(r).toEqual([]);
  });

  it('ohne datierte Klickpreise bleibt die Produktion dasselbe Objekt', () => {
    expect(produktionZumStichtag(BEISPIEL_PRODUKTION, '2026-11-17')).toBe(BEISPIEL_PRODUKTION);
  });
});

describe('Klickpreis-Historie in der Rechnung (T164)', () => {
  const p = mitKlicks([
    { farbe: 'farbig', zehntelcent: 37 },
    { farbe: 'farbig', zehntelcent: 42, gueltigAb: '2027-01-01' },
  ]);

  it('Schema nimmt gueltigAb an und lehnt falsches Datum ab', () => {
    expect(pruefeProduktion(p).ok).toBe(true);
    const falsch = mitKlicks([{ farbe: 'farbig', zehntelcent: 37, gueltigAb: '2027-02-30' }]);
    expect(pruefeProduktion(falsch).ok).toBe(false);
  });

  it('70 Klicks: heute 37, ab 2027 42 Zehntelcent je Klick', () => {
    const klicks = (stichtag: string) => {
      const r = rechneDruckProbe(p, EINGABE, VIER_VIER, SRA3, {
        lager: BEISPIEL_LAGER,
        stichtag,
      });
      if (!r.ok) throw new Error(JSON.stringify(r.fehler));
      return [r.wert.klicks?.anzahl, r.wert.klicks?.kosten.zehntelcent];
    };
    expect(klicks('2026-11-17')).toEqual([70, 2590]);
    expect(klicks('2027-03-01')).toEqual([70, 2940]);
  });
});

describe('Klickpreise ändern ab Datum (T164)', () => {
  const platz = () =>
    (
      mitKlicks([
        { farbe: 'farbig', zehntelcent: 37 },
        { farbe: 'schwarz', zehntelcent: 8 },
      ]).arbeitsplaetze ?? []
    ).find((a) => a.id === 'AP-TON5C')!;

  it('+3,5 % ab 2027: neue Einträge angehängt, alte bleiben; gleicher Tag ersetzt', () => {
    const e = klickpreiseAendernAb(platz(), 3.5, '2027-01-01');
    expect(e['klickpreise']).toEqual([
      { farbe: 'farbig', zehntelcent: 37 },
      { farbe: 'schwarz', zehntelcent: 8 },
      { farbe: 'farbig', zehntelcent: 38, gueltigAb: '2027-01-01' },
      { farbe: 'schwarz', zehntelcent: 8, gueltigAb: '2027-01-01' },
    ]);
    const nochmal = klickpreiseAendernAb(
      { ...platz(), klickpreise: e['klickpreise'] as Klickpreis[] },
      10,
      '2027-01-01',
    );
    expect((nochmal['klickpreise'] as Klickpreis[]).map((k) => k.zehntelcent)).toEqual([
      37, 8, 41, 9,
    ]);
  });

  it('Verlauf zeigt nur Reihen mit mehreren Einträgen, mit Änderung in %', () => {
    const p = { ...platz(), ...klickpreiseAendernAb(platz(), 10, '2027-01-01') } as Arbeitsplatz;
    expect(klickVerlauf(p)).toEqual([
      {
        name: 'farbig',
        stufen: [
          { gueltigAb: null, zehntelcent: 37, aenderungProzent: null },
          { gueltigAb: '2027-01-01', zehntelcent: 41, aenderungProzent: 10.8 },
        ],
      },
      {
        name: 'schwarz',
        stufen: [
          { gueltigAb: null, zehntelcent: 8, aenderungProzent: null },
          { gueltigAb: '2027-01-01', zehntelcent: 9, aenderungProzent: 12.5 },
        ],
      },
    ]);
  });

  it('Bearbeiten der heutigen Preise behält Historie und künftige Einträge', () => {
    const alt = {
      ...platz(),
      klickpreise: [
        { farbe: 'farbig' as const, zehntelcent: 30, gueltigAb: '2025-01-01' },
        { farbe: 'farbig' as const, zehntelcent: 37, gueltigAb: '2026-01-01' },
        { farbe: 'farbig' as const, zehntelcent: 42, gueltigAb: '2027-01-01' },
      ],
    };
    const bearbeitet = {
      klickpreise: [{ farbe: 'farbig', zehntelcent: 36, gueltigAb: '2026-01-01' }],
    };
    expect(klickHistorieBehalten(bearbeitet, alt, '2026-11-17')['klickpreise']).toEqual([
      { farbe: 'farbig', zehntelcent: 30, gueltigAb: '2025-01-01' },
      { farbe: 'farbig', zehntelcent: 42, gueltigAb: '2027-01-01' },
      { farbe: 'farbig', zehntelcent: 36, gueltigAb: '2026-01-01' },
    ]);
  });
});

describe('Klickpreise einzeln ab Datum (T164)', () => {
  it('klickpreiseVor listet die Grundlage; neue Preise je Schlüssel', () => {
    const platz = (
      mitKlicks([
        { farbe: 'farbig', zehntelcent: 37 },
        { farbe: 'schwarz', zehntelcent: 8 },
      ]).arbeitsplaetze ?? []
    ).find((a) => a.id === 'AP-TON5C')!;
    const vor = klickpreiseVor(platz, '2027-01-01');
    expect(vor.map((v) => [v.schluessel, v.name, v.zehntelcent])).toEqual([
      ['m|farbig|', 'farbig', 37],
      ['m|schwarz|', 'schwarz', 8],
    ]);
    const e = klickpreiseAendernAb(platz, new Map([['m|farbig|', 39]]), '2027-01-01');
    expect((e['klickpreise'] as Klickpreis[]).slice(2)).toEqual([
      { farbe: 'farbig', zehntelcent: 39, gueltigAb: '2027-01-01' },
      { farbe: 'schwarz', zehntelcent: 8, gueltigAb: '2027-01-01' },
    ]);
  });
});
