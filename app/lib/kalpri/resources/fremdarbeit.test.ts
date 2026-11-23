import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplatzAendern,
  arbeitsplatzHinzufuegen,
  arbeitsplatzHinweise,
  lieferantHinzufuegen,
  formatEuro3,
  fremdRechenweg,
  rechneFremdarbeit,
  type FremdEingabe,
  type FremdErgebnis,
  type Produktion,
} from './index';

/** Beispiel-Produktion plus Lieferant „Offsetdruck (Zukauf)“: Grundpreis 50 €, 15 % + 10 €. */
function mitOffset(): Produktion {
  const e = arbeitsplatzHinzufuegen(BEISPIEL_PRODUKTION, {
    id: 'AP-OFFSET',
    name: 'Offsetdruck (Zukauf)',
    bereich: 'Druck',
    schritte: [],
    fremdarbeit: {
      lieferant: 'Druckerei Muster',
      lieferzeitTage: 5,
      grundpreisZehntelcent: 50_000,
      aufschlagProzent: 15,
      aufschlagFestZehntelcent: 10_000,
    },
  });
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const STAFFELN = [
  { menge: 1000, preisZehntelcent: 180_000 },
  { menge: 2500, preisZehntelcent: 290_000 },
  { menge: 5000, preisZehntelcent: 420_000, aufschlagProzent: 10 },
];

function rechne(teil: Partial<FremdEingabe> = {}, produktion = mitOffset()): FremdErgebnis {
  const r = rechneFremdarbeit(produktion, {
    platzId: 'AP-OFFSET',
    staffeln: STAFFELN,
    menge: 2500,
    ...teil,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehlerVon(teil: Partial<FremdEingabe>) {
  const r = rechneFremdarbeit(mitOffset(), {
    platzId: 'AP-OFFSET',
    staffeln: STAFFELN,
    menge: 2500,
    ...teil,
  });
  return r.ok ? [] : r.fehler;
}

const e = (g: Geld) => formatEuro(g);

describe('Fremdarbeit', () => {
  it('2.500 Stück: (50 + 290) × 1,15 + 10 = 401,00 €, alle Teile getrennt', () => {
    const r = rechne();
    expect([
      e(r.grundpreis),
      e(r.staffelpreis),
      e(r.einkauf),
      e(r.aufschlagProzentBetrag),
      e(r.aufschlagFest),
      e(r.verkauf),
    ]).toEqual(['50,00 €', '290,00 €', '340,00 €', '51,00 €', '10,00 €', '401,00 €']);
    expect([formatEuro3(r.jeStueck), e(r.je100), e(r.je1000)]).toEqual([
      '0,160 €',
      '16,04 €',
      '160,40 €',
    ]);
    expect(fremdRechenweg(r)).toEqual([
      'Einkauf: Grundpreis 50,00 € + Staffel 2.500 Stück 290,00 € = 340,00 €',
      'Aufschlag: 15 % = 51,00 € + fest 10,00 €',
      'Verkauf: 401,00 €',
      'Je Stück 0,160 € · je 100 16,04 € · je 1.000 160,40 €',
      'Kosten (Voll- und Teilkosten): 340,00 € Einkauf',
      'Liefermenge: ± 10 %, Staffelpreis bleibt',
      'Geliefert 2.500 Stück, davon weiterverarbeitet 2.500',
      'Lieferant Druckerei Muster · Lieferzeit 5 Tage',
    ]);
  });

  it('Aufschlag je Staffel ersetzt den Standard; Grundpreis je Anfrage', () => {
    const r = rechne({ menge: 5000 });
    expect([r.aufschlagProzent, e(r.einkauf), e(r.verkauf)]).toEqual([10, '470,00 €', '527,00 €']);
    const ohneGrund = rechne({ menge: 1000, grundpreisZehntelcent: 0 });
    expect([e(ohneGrund.einkauf), e(ohneGrund.verkauf)]).toEqual(['180,00 €', '217,00 €']);
  });

  it('Toleranz ± 10 %, Staffelpreis bleibt: Minderlieferung ohne Abzug, Mehrmenge mit Zustimmung', () => {
    const minder = rechne({ geliefert: 2400, weiterverarbeitet: 1000 });
    expect([minder.geliefert, minder.weiterverarbeitet, minder.abweichungProzent]).toEqual([
      2400, 1000, -4,
    ]);
    expect([e(minder.abrechnungsbetrag), minder.mehrmengeBetrag]).toEqual(['401,00 €', null]);
    expect(minder.hinweise).toEqual([
      'Minderlieferung 2.400 statt 2.500 Stück (−4 %, innerhalb ± 10 %): Preis bleibt 401,00 €',
    ]);
    const mehr = rechne({ geliefert: 2600 });
    expect(mehr.hinweise).toEqual([
      'Mehrlieferung 2.600 statt 2.500 Stück (+4 %, innerhalb ± 10 %): Preis bleibt 401,00 €; ' +
        'Mehrmenge 100 = +13,34 €, abrechenbar wenn der Kunde zustimmt',
    ]);
    expect(mehr.mehrmengeBetrag === null ? '' : e(mehr.mehrmengeBetrag)).toBe('13,34 €');
    // mit Fortdruck 100 € je weitere 1.000: 10,00 € + 15 % = 11,50 €
    const fortdruck = rechne({
      geliefert: 2600,
      staffeln: [{ menge: 2500, preisZehntelcent: 290_000, fortdruckJe1000Zehntelcent: 100_000 }],
    });
    expect(fortdruck.mehrmengeBetrag === null ? '' : e(fortdruck.mehrmengeBetrag)).toBe('11,50 €');
  });

  it('nach gelieferter Menge, außerhalb der Toleranz, genaue Menge', () => {
    const geliefert = rechne({ geliefert: 2400, mengenregel: { abrechnung: 'geliefert' } });
    expect(e(geliefert.abrechnungsbetrag)).toBe('387,66 €');
    expect(fremdRechenweg(geliefert)).toContain('Abzurechnen: 387,66 €');
    expect(rechne({ geliefert: 2200 }).hinweise).toEqual([
      'Minderlieferung 2.200 statt 2.500 Stück (−12 %, außerhalb ± 10 %): nach Stückpreis 352,88 € – oder neuen Preis vereinbaren',
    ]);
    expect(rechne({ geliefert: 2800 }).hinweise).toEqual([
      'Mehrlieferung 2.800 statt 2.500 Stück (+12 %, außerhalb ± 10 %): Preis bleibt 401,00 €; ' +
        'Mehrmenge 300 = +40,02 € nur nach Absprache mit dem Kunden',
    ]);
    const genau = rechne({ geliefert: 2490, mengenregel: { toleranzProzent: 0 } });
    expect([genau.innerhalbToleranz, e(genau.abrechnungsbetrag)]).toEqual([false, '399,40 €']);
    expect(genau.hinweise[0]).toContain('(−0,4 %, genaue Menge vereinbart)');
    expect(fremdRechenweg(genau)).toContain('Liefermenge: genaue Menge');
  });

  it('Lieferant aus der Liste: Name, Lieferzeit, Aufschlag und Mengenregel als Standard', () => {
    const mitLieferant = lieferantHinzufuegen(mitOffset(), {
      name: 'Offset Nord',
      lieferzeitTage: 3,
      aufschlagProzent: 20,
      toleranzProzent: 5,
      abrechnung: 'geliefert',
    });
    if (!mitLieferant.ok) throw new Error(JSON.stringify(mitLieferant.fehler));
    const offset = mitLieferant.wert.arbeitsplaetze?.find((p) => p.id === 'AP-OFFSET');
    if (!offset) throw new Error('AP-OFFSET fehlt');
    const geaendert = arbeitsplatzAendern(mitLieferant.wert, {
      ...offset,
      fremdarbeit: { lieferantId: 'LF-0001', grundpreisZehntelcent: 50_000 },
    });
    if (!geaendert.ok) throw new Error(JSON.stringify(geaendert.fehler));
    const r = rechne({ geliefert: 2400 }, geaendert.wert);
    expect([r.lieferant, r.lieferzeitTage, r.aufschlagProzent, e(r.verkauf)]).toEqual([
      'Offset Nord',
      3,
      20,
      '408,00 €',
    ]);
    expect([r.toleranzProzent, r.abrechnung, r.innerhalbToleranz]).toEqual([5, 'geliefert', true]);
  });

  it('Fehler: nur angefragte Mengen, doppelte Menge, mehr weiter als geliefert, kein Lieferant', () => {
    expect(fehlerVon({ menge: 3000 })).toEqual([
      { pfad: 'menge', meldung: 'Nur angefragte Mengen: 1.000, 2.500, 5.000' },
    ]);
    expect(
      fehlerVon({
        staffeln: [
          { menge: 1000, preisZehntelcent: 1 },
          { menge: 1000, preisZehntelcent: 2 },
        ],
        menge: 1000,
      }),
    ).toEqual([{ pfad: 'staffeln.1.menge', meldung: 'Menge doppelt: 1.000' }]);
    expect(fehlerVon({ geliefert: 2500, weiterverarbeitet: 2600 })).toEqual([
      { pfad: 'weiterverarbeitet', meldung: 'mehr als geliefert' },
    ]);
    expect(fehlerVon({ staffeln: [] })).toEqual([
      { pfad: 'staffeln', meldung: 'mindestens eine Staffel' },
    ]);
    const tiegel = rechneFremdarbeit(BEISPIEL_PRODUKTION, {
      platzId: 'AP-TIEGEL',
      staffeln: STAFFELN,
      menge: 1000,
    });
    expect(tiegel.ok ? [] : tiegel.fehler).toEqual([
      { pfad: 'platzId', meldung: 'Heidelberger Tiegel ist keine Fremdarbeit' },
    ]);
  });

  it('Hinweise am Platz: ohne Stundensatz kein „rechnet nicht“, nur fehlender Lieferant', () => {
    const offset = mitOffset().arbeitsplaetze?.find((p) => p.id === 'AP-OFFSET');
    if (!offset) throw new Error('AP-OFFSET fehlt');
    expect(arbeitsplatzHinweise(mitOffset(), offset)).toEqual([]);
    expect(
      arbeitsplatzHinweise(mitOffset(), { ...offset, fremdarbeit: { aufschlagProzent: 15 } }),
    ).toEqual(['Lieferant nicht hinterlegt']);
    expect(
      arbeitsplatzHinweise(mitOffset(), { ...offset, fremdarbeit: { lieferantId: 'LF-0001' } }),
    ).toEqual([]);
  });
});
