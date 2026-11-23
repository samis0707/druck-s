import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  guenstigsteMaschinen,
  kalkulationHinzufuegen,
  leereKalkulationen,
  type Arbeitsplatz,
  type Kalkulation,
  type Produktion,
} from './index';

const MIN = 60_000;
const STD = 3_600_000;
const HEUTE = '2026-11-05';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const RILL2: Arbeitsplatz = {
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
};

/** Beispiel-Produktion mit „Rillmaschine groß“, „Rillen von Hand“ und weiteren Plätzen. */
function produktion(...weitere: Arbeitsplatz[]): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  p.arbeitsplaetze = [
    ...(p.arbeitsplaetze ?? []),
    RILL2,
    {
      id: 'AP-RILL4',
      bereich: 'Verarbeitung',
      name: 'Rillen von Hand',
      stundensatzVollZehntelcent: 42_000,
      schritte: [{ schrittId: 'S0007' }],
    },
    ...weitere,
  ];
  return p;
}

/** Drei Zeilen Rillen (1.000 / 5.000): Karton am AeroCut, Großbogen am AeroCut, von Hand. */
function kalkulation(): Kalkulation {
  const rillen = (id: string, platzId: string, materialId: string) => ({
    id,
    art: 'arbeitsgang',
    platzId,
    schrittId: 'S0007',
    menge: { art: 'auflage' },
    materialId,
  });
  const k = wert(
    kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Test Maschinenwahl',
      auflagen: [1000, 5000],
      einheit: 'Stueck',
      zeilen: [
        rillen('Z1', 'AP-AEROCUT', 'L4'),
        rillen('Z2', 'AP-AEROCUT', 'L1'),
        rillen('Z3', 'AP-RILL4', 'L4'),
      ],
    }),
  ).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

function plaetze(k: Kalkulation): string[] {
  return k.zeilen.map((z) => (z.art === 'arbeitsgang' ? z.platzId : z.art));
}

describe('Günstigste geeignete Maschine setzen (T86)', () => {
  it('1 alle Zeilen: günstiger, ungeeignet, rechnet nicht → Rillmaschine groß', () => {
    const g = guenstigsteMaschinen(kalkulation(), produktion(), BEISPIEL_LAGER, HEUTE);
    expect(plaetze(g.kalkulation)).toEqual(['AP-RILL2', 'AP-RILL2', 'AP-RILL2']);
    expect(
      g.wechsel.map((w) => [
        w.zeileId,
        w.vonPlatzId,
        w.nachPlatzId,
        w.ersparnis?.zehntelcent ?? null,
      ]),
    ).toEqual([
      ['Z1', 'AP-AEROCUT', 'AP-RILL2', 208_833],
      ['Z2', 'AP-AEROCUT', 'AP-RILL2', null],
      ['Z3', 'AP-RILL4', 'AP-RILL2', null],
    ]);
    expect(g.wechsel.map((w) => w.text)).toEqual([
      'Rillen: Rillmaschine groß statt Schneide-/Rillsystem (1.000: 208,83 € günstiger)',
      'Rillen: Rillmaschine groß statt Schneide-/Rillsystem (Schneide-/Rillsystem ungeeignet)',
      'Rillen: Rillmaschine groß statt Rillen von Hand (Rillen von Hand rechnet nicht)',
    ]);
  });

  it('2 nur die genannte Zeile', () => {
    const g = guenstigsteMaschinen(kalkulation(), produktion(), BEISPIEL_LAGER, HEUTE, undefined, [
      'Z2',
    ]);
    expect(plaetze(g.kalkulation)).toEqual(['AP-AEROCUT', 'AP-RILL2', 'AP-RILL4']);
    expect(g.wechsel.map((w) => w.zeileId)).toEqual(['Z2']);
  });

  it('3 gewählte ist schon die günstigste: nichts ändert sich', () => {
    const k = guenstigsteMaschinen(kalkulation(), produktion(), BEISPIEL_LAGER, HEUTE).kalkulation;
    const g = guenstigsteMaschinen(k, produktion(), BEISPIEL_LAGER, HEUTE);
    expect(g.wechsel).toEqual([]);
    expect(g.kalkulation).toEqual(k);
  });

  it('4 gleich teuer: die gewählte bleibt', () => {
    const zwilling: Arbeitsplatz = { ...RILL2, id: 'AP-RILL2B', name: 'Rillmaschine groß 2' };
    const k = guenstigsteMaschinen(kalkulation(), produktion(), BEISPIEL_LAGER, HEUTE).kalkulation;
    const mitZwilling: Kalkulation = {
      ...k,
      zeilen: k.zeilen.map((z) => (z.art === 'arbeitsgang' ? { ...z, platzId: 'AP-RILL2B' } : z)),
    };
    const g = guenstigsteMaschinen(mitZwilling, produktion(zwilling), BEISPIEL_LAGER, HEUTE);
    expect(g.wechsel).toEqual([]);
    expect(plaetze(g.kalkulation)).toEqual(['AP-RILL2B', 'AP-RILL2B', 'AP-RILL2B']);
  });

  it('5 ohne geeignete Maschine bleibt die Zeile (Z2); Z3 wechselt zum AeroCut', () => {
    const p = produktion();
    p.arbeitsplaetze = (p.arbeitsplaetze ?? []).filter((x) => x.id !== 'AP-RILL2');
    const g = guenstigsteMaschinen(kalkulation(), p, BEISPIEL_LAGER, HEUTE, undefined, [
      'Z2',
      'Z3',
    ]);
    expect(g.wechsel.map((w) => w.text)).toEqual([
      'Rillen: Schneide-/Rillsystem statt Rillen von Hand (Rillen von Hand rechnet nicht)',
    ]);
    expect(plaetze(g.kalkulation)).toEqual(['AP-AEROCUT', 'AP-AEROCUT', 'AP-AEROCUT']);
  });
});
