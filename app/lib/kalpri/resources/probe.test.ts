import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplatzAendern,
  grenzenHinweise,
  rechenweg,
  rechneProbe,
  type Arbeitsplatz,
  type ProbeEingabe,
  type ProbeErgebnis,
  type Produktion,
} from './index';

function platz(id: string): Arbeitsplatz {
  const p = BEISPIEL_PRODUKTION.arbeitsplaetze?.find((a) => a.id === id);
  if (!p) throw new Error(`Platz ${id} fehlt`);
  return p;
}

function probe(e: ProbeEingabe, produktion: Produktion = BEISPIEL_PRODUKTION): ProbeErgebnis {
  const r = rechneProbe(produktion, e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function euro(g: Geld | null): string {
  return g === null ? '–' : formatEuro(g);
}

/** Tiegel mit einer Material-Ausprägung „Digitalkarton läuft schlecht“. */
function mitKartonRegel(): Produktion {
  const tiegel = {
    ...platz('AP-TIEGEL'),
    auspraegungen: [
      {
        name: 'Digitalkarton',
        bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: 'L4' }],
        wirkung: { leistungProzent: -20, zuschussFest: 30 },
      },
    ],
  };
  const e = arbeitsplatzAendern(BEISPIEL_PRODUKTION, tiegel);
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

describe('Probe-Rechnung', () => {
  it('Tiegel: Material-Ausprägung und Werkzeug, Auslage je 150 Bogen, Vollkosten, Rechenweg', () => {
    const r = probe(
      {
        platzId: 'AP-TIEGEL',
        schrittId: 'S0009',
        menge: 2500,
        merkmale: { materialId: 'L4', bogenbreiteUm: 225_000, bogenhoeheUm: 320_000 },
        werkzeug: { leistungProzent: -10 },
      },
      mitKartonRegel(),
    );
    expect([r.grundJeStunde, r.jeStunde, r.zuschuss, r.mengeGesamt]).toEqual([
      2000, 1440, 30, 2530,
    ]);
    expect(r.stufen).toEqual([
      { quelle: 'Digitalkarton', prozent: -20, jeStunde: 1600 },
      { quelle: 'Werkzeug', prozent: -10, jeStunde: 1440 },
    ]);
    expect(r.ruesten).toEqual([
      { name: 'Rüsten', anzahl: 1, jeMs: 1_800_000, ms: 1_800_000 },
      { name: 'Auslage leeren', anzahl: 17, jeMs: 120_000, ms: 2_040_000 },
    ]);
    expect([r.laufMs, r.ruestenMs, r.zeitMs]).toEqual([6_325_000, 3_840_000, 10_165_000]);
    expect([euro(r.kostenVoll), euro(r.kostenTeil)]).toEqual(['146,83 €', '–']);
    expect(r.hinweise).toEqual(['Teilkosten nicht hinterlegt']);
    expect(rechenweg(r)).toEqual([
      'Leistung: 2.000 Bogen/h → Digitalkarton −20 % → Werkzeug −10 % = 1.440 Bogen/h',
      'Zuschuss: 30 fest + 0 % = 30 → 2.530 Bogen',
      'Lauf: 2.530 Bogen ÷ 1.440/h = 105,42 min',
      'Rüsten: Rüsten 30 min + Auslage leeren 17 × 2 min = 64 min',
      'Zeit: 169,42 min = 2,82 h',
      'Vollkosten: 2,82 h × 52,00 €/h = 146,83 €',
      'Teilkosten: nicht hinterlegt',
    ]);
  });

  it('Bookletmaker: Zuschuss fest + 0,5 % aufgerundet; Handwerte ersetzen am Ende', () => {
    const r = probe({ platzId: 'AP-ZUS', schrittId: 'S0013', menge: 4000 });
    expect([r.zuschuss, r.mengeGesamt, r.laufMs, r.ruestenMs, r.zeitMs]).toEqual([
      30, 4030, 9_672_000, 600_000, 10_272_000,
    ]);
    expect(euro(r.kostenVoll)).toBe('256,80 €');
    expect(r.hinweise).toEqual(['Teilkosten nicht hinterlegt', 'Stundensatz vorläufig']);
    const hand = probe({
      platzId: 'AP-ZUS',
      schrittId: 'S0013',
      menge: 4000,
      handwerte: { leistungJeStunde: 1200, ruestenMs: 900_000, zuschuss: 50 },
    });
    expect([
      hand.berechnetJeStunde,
      hand.jeStunde,
      hand.mengeGesamt,
      hand.laufMs,
      hand.ruestenMs,
    ]).toEqual([1500, 1200, 4050, 12_150_000, 900_000]);
    expect([hand.leistungVonHand, hand.zuschussVonHand, hand.ruestenVonHand]).toEqual([
      true,
      true,
      true,
    ]);
    expect(rechenweg(hand).slice(0, 4)).toEqual([
      'Leistung: 1.500 Lagen/h → von Hand 1.200 Lagen/h',
      'Zuschuss: von Hand 50 → 4.050 Lagen',
      'Lauf: 4.050 Lagen ÷ 1.200/h = 202,5 min',
      'Rüsten: Rüsten 10 min = 10 min → von Hand 15 min',
    ]);
  });

  it('Schneider: Nebenzeit je Stapel aus den Mengen, ohne Stapel ein Hinweis', () => {
    const r = probe({ platzId: 'AP-SCHN', schrittId: 'S0006', menge: 9, mengen: { Stapel: 3 } });
    expect([r.laufMs, r.ruestenMs, r.zeitMs]).toEqual([270_000, 1_050_000, 1_320_000]);
    expect(euro(r.kostenVoll)).toBe('21,27 €');
    const ohne = probe({ platzId: 'AP-SCHN', schrittId: 'S0006', menge: 9 });
    expect(ohne.ruestenMs).toBe(600_000);
    expect(ohne.hinweise).toContain('Rüsten „Nebenzeit je Stapel“: Menge in Stapel fehlt');
  });

  it('Kleine Maschinen Bohren, LFP mit Profil, Arbeitsgang ± %', () => {
    const bohren = probe({ platzId: 'AP-KLEIN', schrittId: 'S0014', menge: 20 });
    expect([bohren.laufMs, bohren.zeitMs, euro(bohren.kostenVoll)]).toEqual([
      1_050_000,
      1_350_000,
      '18,00 €',
    ]);
    const lfp = probe({ platzId: 'AP-LFP', schrittId: 'S0003', menge: 46, profil: '6 Pass' });
    expect([lfp.grundJeStunde, lfp.laufMs, lfp.zeitMs, euro(lfp.kostenVoll)]).toEqual([
      23,
      7_200_000,
      8_100_000,
      '130,50 €',
    ]);
    expect(rechenweg(lfp)[0]).toBe('Leistung (6 Pass): 23 m²/h');
    const schwer = probe({
      platzId: 'AP-KLEIN',
      schrittId: 'S0014',
      menge: 20,
      arbeitsgang: { leistungProzent: 25, ruestenMs: 60_000 },
    });
    expect([Math.round(schwer.jeStunde * 100), schwer.laufMs, schwer.ruestenMs]).toEqual([
      8571, 840_000, 360_000,
    ]);
  });

  it('Toner: nicht geeignet und Grenzen als Hinweise, gerechnet wird trotzdem', () => {
    const r = probe({
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      menge: 1000,
      merkmale: { bogenbreiteUm: 488_000, bogenhoeheUm: 330_000, grammatur: 400 },
    });
    expect([r.zuschuss, r.laufMs, r.zeitMs, euro(r.kostenVoll)]).toEqual([
      30,
      1_236_000,
      1_536_000,
      '69,97 €',
    ]);
    expect(r.nichtGeeignet).toBe(true);
    expect(r.hinweise).toEqual([
      'Teilkosten nicht hinterlegt',
      'Stundensatz vorläufig',
      'Nicht geeignet: Über 330 mm Bogenbreite nur bis 220 g/m²',
      'Grammatur über 350 g/m²',
    ]);
    expect(
      grenzenHinweise(
        {
          formatMin: { breiteUm: 120_000, hoeheUm: 148_000 },
          formatMax: { breiteUm: 260_000, hoeheUm: 380_000 },
          dickeMaxUm: 6_000,
        },
        { bogenbreiteUm: 100_000, bogenhoeheUm: 400_000, dickeUm: 6_500 },
      ),
    ).toEqual([
      'Bogen größer als Höchstformat 260 × 380 mm',
      'Bogen kleiner als Mindestformat 120 × 148 mm',
      'Material dicker als 6 mm',
    ]);
  });

  it('Fehler: Platz, Schritt, Menge, Profil, fehlende Leistung, Handleistung', () => {
    const fehler = (e: ProbeEingabe) => {
      const r = rechneProbe(BEISPIEL_PRODUKTION, e);
      return r.ok ? [] : r.fehler;
    };
    expect(fehler({ platzId: 'AP-XX', schrittId: 'S0001', menge: 1 })).toEqual([
      { pfad: 'platzId', meldung: 'Arbeitsplatz AP-XX nicht gefunden' },
    ]);
    expect(fehler({ platzId: 'AP-TIEGEL', schrittId: 'S0014', menge: 1 })).toEqual([
      { pfad: 'schrittId', meldung: 'Schritt S0014 ist an diesem Platz nicht möglich' },
    ]);
    expect(fehler({ platzId: 'AP-TIEGEL', schrittId: 'S0009', menge: 2.5 })).toEqual([
      { pfad: 'menge', meldung: 'Menge muss eine ganze Zahl ab 0 sein' },
    ]);
    expect(fehler({ platzId: 'AP-LFP', schrittId: 'S0003', menge: -1 })).toEqual([
      { pfad: 'menge', meldung: 'Menge muss eine Zahl ab 0 sein' },
    ]);
    expect(fehler({ platzId: 'AP-LFP', schrittId: 'S0003', menge: 10, profil: '7 Pass' })).toEqual([
      { pfad: 'profil', meldung: 'Ausführung 7 Pass nicht gefunden' },
    ]);
    expect(fehler({ platzId: 'AP-KLEIN', schrittId: 'S0015', menge: 10 })).toEqual([
      { pfad: 'leistung', meldung: 'Leistung fehlt – rechnet nicht' },
    ]);
    expect(
      fehler({
        platzId: 'AP-KLEIN',
        schrittId: 'S0014',
        menge: 10,
        handwerte: { leistungJeStunde: 0 },
      }),
    ).toEqual([
      { pfad: 'handwerte.leistungJeStunde', meldung: 'Leistung von Hand muss größer als 0 sein' },
    ]);
  });
});
