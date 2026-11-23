import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  kalkulationMitMaschine,
  leereKalkulationen,
  maschinenWahl,
  type Kalkulation,
  type Produktion,
} from './index';

const MIN = 60_000;
const STD = 3_600_000;

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

/** Beispiel-Produktion mit einer Rillmaschine, die die Ausführung „Schnell“ kennt. */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  p.arbeitsplaetze = [
    ...(p.arbeitsplaetze ?? []),
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
          profile: [{ name: 'Schnell', menge: 3000, dauerMs: STD }],
        },
      ],
    },
  ];
  return p;
}

/** Rillen 1.000 Bogen L4 an der Rillmaschine groß, Ausführung „schnell“, dazu Verpacken. */
function kalkulation(): Kalkulation {
  const k = wert(
    kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Rillen',
      auflagen: [1000],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-RILL2',
          schrittId: 'S0007',
          menge: { art: 'auflage' },
          materialId: 'L4',
          profil: 'schnell',
        },
        {
          id: 'Z2',
          art: 'arbeitsgang',
          platzId: 'AP-PACK',
          schrittId: 'S0020',
          menge: { art: 'produkt', teiler: 250 },
        },
      ],
    }),
  ).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

describe('Maschine wechseln (T85)', () => {
  it('1 neue Maschine kennt die Ausführung nicht: sie entfällt, sonst bleibt die Zeile', () => {
    const k = kalkulationMitMaschine(kalkulation(), 'Z1', produktion(), 'AP-AEROCUT');
    expect(k.zeilen[0]).toEqual({
      id: 'Z1',
      art: 'arbeitsgang',
      platzId: 'AP-AEROCUT',
      schrittId: 'S0007',
      menge: { art: 'auflage' },
      materialId: 'L4',
    });
    expect(k.zeilen[1]).toEqual(kalkulation().zeilen[1]);
  });

  it('2 Ausführung vorhanden (Groß-/Kleinschreibung egal): sie bleibt', () => {
    const k = kalkulationMitMaschine(kalkulation(), 'Z1', produktion(), 'AP-RILL2');
    expect(k.zeilen[0]).toMatchObject({ platzId: 'AP-RILL2', profil: 'schnell' });
  });

  it('3 unbekannte Zeile oder kein Arbeitsgang: unverändert', () => {
    expect(kalkulationMitMaschine(kalkulation(), 'Z9', produktion(), 'AP-AEROCUT')).toEqual(
      kalkulation(),
    );
  });

  it('4 Maschinenwahl rechnet die andere Maschine ohne fremde Ausführung', () => {
    const o = maschinenWahl(kalkulation(), 'Z1', produktion(), BEISPIEL_LAGER, '2026-11-05');
    // Rillmaschine groß „Schnell“: 1.000 ÷ 3.000/h = 20 min + 15 min = 35 min × 70 €/h = 40,833 €
    // AeroCut ohne Ausführung: 5,25 h × 52 €/h = 273,00 € (statt „Ausführung nicht gefunden“)
    expect(
      o.map((x) => [x.platzId, x.stand, x.kostenZeile?.zehntelcent ?? null, x.gewaehlt]),
    ).toEqual([
      ['AP-RILL2', 'geeignet', 40_833, true],
      ['AP-AEROCUT', 'geeignet', 273_000, false],
    ]);
  });
});
