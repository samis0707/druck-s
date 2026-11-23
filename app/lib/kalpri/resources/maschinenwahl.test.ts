import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  maschinenWahl,
  preisHinzufuegen,
  rechneKalkulation,
  rechneProbe,
  type Arbeitsplatz,
  type Kalkulation,
  type Lager,
  type Material,
  type MaschinenOption,
  type Produktion,
} from './index';

const MIN = 60_000;
const STD = 3_600_000;
const HEUTE = '2026-11-05';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function kalkulation(eingabe: Record<string, unknown>): Kalkulation {
  const k = wert(kalkulationHinzufuegen(leereKalkulationen(), eingabe)).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

/** Kurzform je Option: [Platz, Stand, Gründe, Kosten Zeile, Summe Auflage, Mehrkosten]. */
function kurz(o: MaschinenOption[]) {
  return o.map((x) => [
    x.platzId,
    x.stand,
    x.gruende,
    x.kostenZeile?.zehntelcent ?? null,
    x.summeVoll.zehntelcent,
    x.mehrkosten?.zehntelcent ?? null,
  ]);
}

/** Beispiel-Produktion mit drei weiteren Rillplätzen und einer zweiten Digitaldruckmaschine. */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const dazu: Arbeitsplatz[] = [
    {
      id: 'AP-RILL2',
      bereich: 'Verarbeitung',
      name: 'Rillmaschine groß',
      stundensatzVollZehntelcent: 70_000,
      schritte: [
        {
          schrittId: 'S0007',
          leistung: { menge: 1500, dauerMs: STD },
          ruesten: [{ name: 'Rüsten', dauerMs: 15 * MIN, je: 'Auftrag' }],
        },
      ],
    },
    {
      id: 'AP-RILL3',
      bereich: 'Verarbeitung',
      name: 'Rillmaschine alt',
      inaktiv: true,
      stundensatzVollZehntelcent: 30_000,
      schritte: [{ schrittId: 'S0007', leistung: { menge: 500, dauerMs: STD } }],
    },
    {
      id: 'AP-RILL4',
      bereich: 'Verarbeitung',
      name: 'Rillen von Hand',
      stundensatzVollZehntelcent: 42_000,
      schritte: [{ schrittId: 'S0007' }],
    },
    {
      id: 'AP-TON-B',
      bereich: 'Druck',
      name: 'Digitaldruck B',
      stundensatzVollZehntelcent: 60_000,
      grenzen: { grammaturMin: 60, grammaturMax: 350 },
      schritte: [
        {
          schrittId: 'S0001',
          leistung: { menge: 3000, dauerMs: STD },
          ruesten: [{ name: 'Rüsten', dauerMs: 5 * MIN, je: 'Auftrag' }],
          zuschuss: { fest: 200 },
        },
      ],
    },
  ];
  p.arbeitsplaetze = [...(p.arbeitsplaetze ?? []), ...dazu];
  return p;
}

const JUWEL: Material = {
  id: 'JUWEL',
  sorte: 'Juwel Premium Card glatt',
  grammatur: 320,
  dickeUm: 380,
  form: 'Bogen',
  breiteUm: 650_000,
  hoeheUm: 920_000,
};

/** Beispiel-Lager mit Juwel (Ries 100 = 84,84 €). */
function lager(): Lager {
  return wert(
    preisHinzufuegen(
      { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, JUWEL] },
      {
        materialId: 'JUWEL',
        lieferant: 'Berberich',
        gueltigAb: '2026-01-01',
        basis: 'einheit',
        einheitName: 'Ries',
        inhalt: 100,
        staffel: [{ ab: 1, betragZehntelcent: 84_840 }],
      },
    ),
  );
}

/** Rillen von 1.000 bzw. 5.000 Bogen aus dem Lager an der gewählten Maschine. */
function rillen(materialId: string, platzId: string): Kalkulation {
  return kalkulation({
    titel: 'Rillen',
    auflagen: [1000, 5000],
    einheit: 'Stueck',
    zeilen: [
      {
        id: 'Z1',
        art: 'arbeitsgang',
        platzId,
        schrittId: 'S0007',
        menge: { art: 'auflage' },
        materialId,
      },
    ],
  });
}

/** Visitenkarten 500 Stück auf Juwel, Papier auf 50 Rohbogen gerundet, Druck an AP-TON5C. */
function visitenkarten(): Kalkulation {
  return kalkulation({
    titel: 'Visitenkarten',
    auflagen: [500],
    einheit: 'Stueck',
    teile: [
      {
        id: 'T1',
        name: 'Karte',
        materialId: 'JUWEL',
        endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
        jeProdukt: 1,
        druckbogen: { breiteUm: 325_000, hoeheUm: 460_000 },
      },
    ],
    zeilen: [
      {
        id: 'Z1',
        art: 'material',
        materialId: 'JUWEL',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
        rundung: { art: 'vielfaches', auf: 50 },
      },
      {
        id: 'Z2',
        art: 'arbeitsgang',
        platzId: 'AP-TON5C',
        schrittId: 'S0001',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
      },
    ],
  });
}

describe('Maschinenwahl je Arbeitsgang (T84)', () => {
  it('1 Rillen L4: geeignete nach Kosten, dann „rechnet nicht“; inaktive fehlen', () => {
    const o = maschinenWahl(rillen('L4', 'AP-AEROCUT'), 'Z1', produktion(), lager(), HEUTE);
    // AeroCut: 1.000 Bogen ÷ 200/h = 5 h + 15 min Rüsten = 5,25 h × 52 €/h = 273,00 €
    // Rillmaschine groß: 1.000 ÷ 1.500/h = 40 min + 15 min = 55 min × 70 €/h = 64,167 €
    expect(kurz(o)).toEqual([
      ['AP-RILL2', 'geeignet', [], 64_167, 64_167, -208_833],
      ['AP-AEROCUT', 'geeignet', [], 273_000, 273_000, 0],
      ['AP-RILL4', 'rechnetNicht', ['Leistung fehlt'], null, 0, null],
    ]);
    expect(o.map((x) => x.gewaehlt)).toEqual([false, true, false]);
    expect(o.map((x) => x.name)).toEqual([
      'Rillmaschine groß',
      'Schneide-/Rillsystem',
      'Rillen von Hand',
    ]);
    expect(o[1]?.zeitMs).toBe(315 * MIN);
  });

  it('2 Rillen L1 (700 × 1.000 mm): die gewählte ist ungeeignet, mit Grund, steht hinten', () => {
    const o = maschinenWahl(rillen('L1', 'AP-AEROCUT'), 'Z1', produktion(), lager(), HEUTE);
    expect(kurz(o)).toEqual([
      ['AP-RILL2', 'geeignet', [], 64_167, 64_167, null],
      ['AP-RILL4', 'rechnetNicht', ['Leistung fehlt'], null, 0, null],
      [
        'AP-AEROCUT',
        'ungeeignet',
        ['Bogen größer als Höchstformat 330 × 487 mm'],
        273_000,
        273_000,
        null,
      ],
    ]);
  });

  it('3 gewählte Maschine ist inaktiv: sie erscheint trotzdem, als ungeeignet „inaktiv“', () => {
    const o = maschinenWahl(rillen('L4', 'AP-RILL3'), 'Z1', produktion(), lager(), HEUTE);
    expect(o.map((x) => [x.platzId, x.stand, x.gruende, x.gewaehlt])).toEqual([
      ['AP-RILL2', 'geeignet', [], false],
      ['AP-AEROCUT', 'geeignet', [], false],
      ['AP-RILL4', 'rechnetNicht', ['Leistung fehlt'], false],
      ['AP-RILL3', 'ungeeignet', ['inaktiv'], true],
    ]);
  });

  it('4 zweite Auflage (5.000): Kosten dieser Auflage', () => {
    const o = maschinenWahl(
      rillen('L4', 'AP-AEROCUT'),
      'Z1',
      produktion(),
      lager(),
      HEUTE,
      undefined,
      1,
    );
    expect(kurz(o).slice(0, 2)).toEqual([
      ['AP-RILL2', 'geeignet', [], 250_833, 250_833, -1_062_167],
      ['AP-AEROCUT', 'geeignet', [], 1_313_000, 1_313_000, 0],
    ]);
  });

  it('5 Druck: billigere Zeile, aber mehr Papier – sortiert wird nach der ganzen Auflage', () => {
    const o = maschinenWahl(visitenkarten(), 'Z2', produktion(), lager(), HEUTE);
    // Digitaldruck B: 20 + 200 Zuschuss = 220 Bogen → 9,40 € statt 15,36 €,
    // aber 55 statt 8 Rohbogen → 100 statt 50 abgerechnet (84,84 € statt 42,42 €)
    expect(kurz(o)).toEqual([
      ['AP-TON5C', 'geeignet', [], 15_361, 57_781, 0],
      ['AP-TON-B', 'geeignet', [], 9_400, 94_240, 36_459],
    ]);
  });

  it('6 Sonderfall „nicht geeignet“ am Platz: Grund aus der Ausprägung', () => {
    const k = visitenkarten();
    const teil = k.teile?.[0];
    if (!teil) throw new Error('Teil fehlt');
    const quer: Kalkulation = {
      ...k,
      teile: [{ ...teil, materialId: 'L2', druckbogen: { breiteUm: 460_000, hoeheUm: 325_000 } }],
      zeilen: k.zeilen.filter((z) => z.id === 'Z2'),
    };
    const o = maschinenWahl(quer, 'Z2', produktion(), lager(), HEUTE);
    expect(o.map((x) => [x.platzId, x.stand, x.gruende])).toEqual([
      ['AP-TON-B', 'geeignet', []],
      ['AP-TON5C', 'ungeeignet', ['Über 330 mm Bogenbreite nur bis 220 g/m²']],
    ]);
    // Die Zeile rechnet trotzdem; der Grund steht zusätzlich im Ergebnis der Zeile
    const z = rechneKalkulation(quer, produktion(), lager(), HEUTE).auflagen[0]?.zeilen[0];
    expect(z?.ungeeignet).toEqual(['Über 330 mm Bogenbreite nur bis 220 g/m²']);
    expect(z?.kostenVoll?.zehntelcent).toBe(15_361);
  });

  it('7 unbekannte Zeile, Materialzeile, unbekannte Auflage → leere Liste', () => {
    expect(maschinenWahl(visitenkarten(), 'Z9', produktion(), lager(), HEUTE)).toEqual([]);
    expect(maschinenWahl(visitenkarten(), 'Z1', produktion(), lager(), HEUTE)).toEqual([]);
    expect(
      maschinenWahl(visitenkarten(), 'Z2', produktion(), lager(), HEUTE, undefined, 3),
    ).toEqual([]);
  });

  it('8 Probe: Grenzen sind Gründe „ungeeignet“, ohne Verstoß fehlt das Feld', () => {
    const p = produktion();
    const zuGross = wert(
      rechneProbe(p, {
        platzId: 'AP-AEROCUT',
        schrittId: 'S0007',
        menge: 100,
        merkmale: { bogenbreiteUm: 700_000, bogenhoeheUm: 1_000_000, grammatur: 600 },
      }),
    );
    expect(zuGross.ungeeignet).toEqual([
      'Bogen größer als Höchstformat 330 × 487 mm',
      'Grammatur über 500 g/m²',
    ]);
    expect(zuGross.nichtGeeignet).toBe(false);
    const passt = wert(
      rechneProbe(p, {
        platzId: 'AP-AEROCUT',
        schrittId: 'S0007',
        menge: 100,
        merkmale: { bogenbreiteUm: 320_000, bogenhoeheUm: 450_000, grammatur: 350 },
      }),
    );
    expect('ungeeignet' in passt).toBe(false);
  });
});
