import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  auflagenZusammenfassung,
  kalkulationAendern,
  kalkulationEntfernen,
  kalkulationenAlsJson,
  kalkulationenAusJson,
  kalkulationHinzufuegen,
  leereKalkulationen,
  lieferantHinzufuegen,
  mengeAusQuelle,
  naechsteKalkulationId,
  naechsteZeilenId,
  preisHinzufuegen,
  rechneKalkulation,
  type Kalkulation,
  type Kalkulationen,
  type Lager,
  type Produktion,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : e.fehler;
}

const euro = (g: Geld | null) => (g === null ? '–' : formatEuro(g));

/** Lager mit Preis für L4: Paket 125 Bogen, 18,50 € (ab 8 Paketen 16,90 €). */
function lager(): Lager {
  return wert(
    preisHinzufuegen(BEISPIEL_LAGER, {
      materialId: 'L4',
      lieferant: 'Papier Union',
      gueltigAb: '2026-01-01',
      basis: 'einheit',
      einheitName: 'Paket',
      inhalt: 125,
      staffel: [
        { ab: 1, betragZehntelcent: 18_500 },
        { ab: 8, betragZehntelcent: 16_900 },
      ],
    }),
  );
}

/** Produktion mit Lieferant Veredler Süd (Aufschlag 15 % + 10 €). */
function produktion(): Produktion {
  return wert(
    lieferantHinzufuegen(BEISPIEL_PRODUKTION, {
      name: 'Veredler Süd',
      aufschlagProzent: 15,
      aufschlagFestZehntelcent: 10_000,
    }),
  );
}

/** Abnahmefall: Visitenkarten 1.000 / 5.000 Stück, Gewinn 20 %. */
const VISITENKARTEN = {
  titel: 'Visitenkarten 85 × 55, 4/4, 350 g',
  kunde: 'Müller GmbH',
  stichtag: '2026-10-25',
  auflagen: [1000, 5000],
  einheit: 'Stueck',
  gewinnProzent: 20,
  zeilen: [
    {
      id: 'Z1',
      art: 'material',
      materialId: 'L4',
      menge: { art: 'auflage', teiler: 20, fest: 15 },
    },
    {
      id: 'Z2',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      materialId: 'L4',
      menge: { art: 'auflage', teiler: 20 },
    },
    {
      id: 'Z3',
      art: 'arbeitsgang',
      platzId: 'AP-SCHN',
      schrittId: 'S0006',
      menge: { art: 'hand', mengen: [9] },
      stapel: { art: 'hand', mengen: [1, 2] },
    },
    {
      id: 'Z4',
      art: 'zukauf',
      lieferantId: 'LF-0001',
      beschreibung: 'Softtouch-Folie einseitig',
      preise: [4_500, 9_500],
      // Abnahmefall T40: Aufschlag des Lieferanten ersetzt den Gewinnaufschlag
      gewinnZusaetzlich: false,
    },
    { id: 'Z5', art: 'sonstiges', bezeichnung: 'Versand', betraege: [8_900] },
  ],
};

function mitVisitenkarten(): { daten: Kalkulationen; k: Kalkulation } {
  const daten = wert(kalkulationHinzufuegen(leereKalkulationen(), VISITENKARTEN));
  const k = daten.kalkulationen[0];
  if (!k) throw new Error('Kalkulation fehlt');
  return { daten, k };
}

describe('Kalkulation – Daten', () => {
  it('anlegen mit K-0001, ändern, entfernen; JSON verlustfrei; nächste Zeilen-ID', () => {
    expect(naechsteKalkulationId(leereKalkulationen())).toBe('K-0001');
    const { daten, k } = mitVisitenkarten();
    expect(k.id).toBe('K-0001');
    expect(naechsteZeilenId(k)).toBe('Z6');
    expect(naechsteZeilenId({ zeilen: [] })).toBe('Z1');
    const geaendert = wert(kalkulationAendern(daten, { ...k, gewinnProzent: 25 }));
    expect(geaendert.kalkulationen[0]?.gewinnProzent).toBe(25);
    expect(wert(kalkulationenAusJson(kalkulationenAlsJson(daten)))).toEqual(daten);
    expect(wert(kalkulationEntfernen(daten, 'K-0001')).kalkulationen).toEqual([]);
    expect(fehler(kalkulationAendern(daten, { ...k, id: 'K-0099' }))).toEqual([
      { pfad: 'id', meldung: 'Kalkulation K-0099 nicht gefunden' },
    ]);
  });

  it('Fehler am Feld: Auflagen, Listen je Auflage, Sonstiges ohne Bezeichnung, Zeilenart', () => {
    const leer = leereKalkulationen();
    expect(fehler(kalkulationHinzufuegen(leer, { ...VISITENKARTEN, auflagen: [] }))).toEqual([
      { pfad: 'auflagen', meldung: 'mindestens eine Auflage' },
    ]);
    expect(
      fehler(kalkulationHinzufuegen(leer, { ...VISITENKARTEN, auflagen: [1000, 1000] })),
    ).toEqual([{ pfad: 'auflagen.1', meldung: 'Auflage doppelt' }]);
    const zeilen = (z: unknown) => ({ ...VISITENKARTEN, zeilen: [z] });
    expect(
      fehler(kalkulationHinzufuegen(leer, zeilen({ id: 'Z1', art: 'zukauf', preise: [1, 2, 3] }))),
    ).toEqual([
      { pfad: 'zeilen.0.preise', meldung: 'ein Wert für alle oder 2 Werte (je Auflage)' },
    ]);
    expect(
      fehler(kalkulationHinzufuegen(leer, zeilen({ id: 'Z1', art: 'sonstiges', betraege: [1] }))),
    ).toEqual([{ pfad: 'zeilen.0.bezeichnung', meldung: 'Pflichtfeld' }]);
    expect(
      fehler(kalkulationHinzufuegen(leer, zeilen({ id: 'Z1', art: 'druck', betraege: [1] }))),
    ).toEqual([{ pfad: 'zeilen.0.art', meldung: 'Zeilenart unbekannt' }]);
    expect(
      fehler(
        kalkulationHinzufuegen(
          leer,
          zeilen({ id: 'Z1', art: 'material', materialId: 'L4', menge: { art: 'formel' } }),
        ),
      ),
    ).toEqual([{ pfad: 'zeilen.0.menge.art', meldung: 'Mengenquelle unbekannt' }]);
  });

  it('Mengenquelle: von Hand je Auflage; aus der Auflage mit Teiler, Aufrunden und fest', () => {
    expect(mengeAusQuelle({ art: 'hand', mengen: [9] }, [1000, 5000], 1, 'Schnitt')).toBe(9);
    expect(mengeAusQuelle({ art: 'hand', mengen: [1, 2] }, [1000, 5000], 1, 'Stapel')).toBe(2);
    expect(mengeAusQuelle({ art: 'auflage', teiler: 24, fest: 10 }, [1000], 0, 'Bogen')).toBe(52);
    expect(mengeAusQuelle({ art: 'auflage', teiler: 3 }, [1000], 0, 'm2')).toBe(333.34);
    expect(mengeAusQuelle({ art: 'auflage', faktor: 0.1, teiler: 1 }, [300], 0, 'Bogen')).toBe(30);
  });
});

describe('Kalkulation – Rechnen', () => {
  it('Abnahmefall Visitenkarten 1.000 Stück: Zeilen, Summen, Verkauf, je Stück', () => {
    const { k } = mitVisitenkarten();
    const r = rechneKalkulation(k, produktion(), lager(), '2026-10-25');
    const a = r.auflagen[0];
    if (!a) throw new Error('Auflage fehlt');
    expect(a.zeilen.map((z) => [z.zeileId, z.menge, euro(z.kostenVoll), euro(z.verkauf)])).toEqual([
      ['Z1', 65, '9,62 €', '11,54 €'],
      ['Z2', 50, '17,00 €', '20,40 €'],
      ['Z3', 9, '16,43 €', '19,72 €'],
      ['Z4', null, '4,50 €', '15,18 €'],
      ['Z5', null, '8,90 €', '10,68 €'],
    ]);
    expect(a.zeilen[0]?.rechenweg).toEqual([
      'Material: 65 Bogen × 148,00 € je 1.000 (Papier Union) = 9,62 €',
    ]);
    expect(a.zeilen[1]?.mengeGesamt).toBe(61);
    expect(a.zeilen[3]?.rechenweg).toEqual([
      'Zukauf: Einkauf 4,50 € + 15 % + 10,00 € = 15,18 €',
      'Aufschlag ersetzt den Gewinnaufschlag',
    ]);
    expect(auflagenZusammenfassung(a, r.einheit)).toEqual([
      'Auflage 1.000 Stück',
      'Zeit: 23,22 min',
      'Vollkosten: 56,45 €',
      'Teilkosten: 23,02 € (unvollständig)',
      'Verkauf: 77,52 €',
      'Je Stück 0,078 € · je 100 7,75 € · je 1.000 77,52 €',
      'Deckungsbeitrag: 54,50 € (unvollständig)',
    ]);
  });

  it('Abnahmefall 5.000 Stück: Staffel des Materials, Stapel je Auflage, Zukauf je Auflage', () => {
    const { k } = mitVisitenkarten();
    const a = rechneKalkulation(k, produktion(), lager(), '2026-10-25').auflagen[1];
    if (!a) throw new Error('Auflage fehlt');
    expect(a.zeilen.map((z) => euro(z.kostenVoll))).toEqual([
      '39,22 €',
      '28,15 €',
      '18,85 €',
      '9,50 €',
      '8,90 €',
    ]);
    expect([euro(a.summeVoll), euro(a.verkauf), euro(a.je1000)]).toEqual([
      '104,62 €',
      '135,07 €',
      '27,02 €',
    ]);
  });

  it('Teilkosten vollständig, wenn alle Plätze einen Teilsatz haben; Deckungsbeitrag', () => {
    const { k } = mitVisitenkarten();
    const p = produktion();
    const mitTeil: Produktion = {
      ...p,
      arbeitsplaetze: (p.arbeitsplaetze ?? []).map((pl) => ({
        ...pl,
        stundensatzTeilZehntelcent: 30_000,
      })),
    };
    const a = rechneKalkulation(k, mitTeil, lager(), '2026-10-25').auflagen[0];
    if (!a) throw new Error('Auflage fehlt');
    expect([a.teilVollstaendig, euro(a.summeTeil), euro(a.deckungsbeitrag)]).toEqual([
      true,
      '34,63 €',
      '42,89 €',
    ]);
  });

  it('Sonstiges mit eigenem Aufschlag (fest und %): Gewinnaufschlag zusätzlich oder ersetzt', () => {
    const { k } = mitVisitenkarten();
    const versand = {
      id: 'Z5',
      art: 'sonstiges' as const,
      bezeichnung: 'Versand',
      betraege: [8_900],
      aufschlagProzent: 10,
      aufschlagFestZehntelcent: 2_500,
    };
    const mitVersand: Kalkulation = {
      ...k,
      zeilen: k.zeilen.map((z) => (z.id === 'Z5' ? versand : z)),
    };
    const z = rechneKalkulation(mitVersand, produktion(), lager(), '2026-10-25').auflagen[0]
      ?.zeilen[4];
    // Standard: Gewinnaufschlag 20 % zusätzlich
    expect([euro(z?.kostenVoll ?? null), euro(z?.verkauf ?? null)]).toEqual(['8,90 €', '14,75 €']);
    expect(euro(z?.kostenMitZeilenaufschlag ?? null)).toBe('12,29 €');
    expect(z?.rechenweg).toEqual([
      'Versand: 8,90 € + 10 % + 2,50 € = 12,29 €',
      '+ Gewinnaufschlag 20 %: 12,29 € → 14,75 €',
    ]);
    // ausgeschaltet: der Aufschlag ersetzt den Gewinnaufschlag
    const ersetzt: Kalkulation = {
      ...k,
      zeilen: k.zeilen.map((x) => (x.id === 'Z5' ? { ...versand, gewinnZusaetzlich: false } : x)),
    };
    const y = rechneKalkulation(ersetzt, produktion(), lager(), '2026-10-25').auflagen[0]
      ?.zeilen[4];
    expect(euro(y?.verkauf ?? null)).toBe('12,29 €');
  });

  it('Hinweise statt Absturz: Material ohne Preis, fremder Lieferant, unbekannter Platz', () => {
    const k: Kalkulation = {
      id: 'K-0001',
      titel: 'Test',
      auflagen: [100],
      einheit: 'Stueck',
      zeilen: [
        { id: 'Z1', art: 'material', materialId: 'L1', menge: { art: 'hand', mengen: [10] } },
        {
          id: 'Z2',
          art: 'material',
          materialId: 'L4',
          lieferant: 'Andere GmbH',
          menge: { art: 'hand', mengen: [10] },
        },
        {
          id: 'Z3',
          art: 'arbeitsgang',
          platzId: 'AP-GIBTSNICHT',
          schrittId: 'S0001',
          menge: { art: 'hand', mengen: [10] },
        },
        { id: 'Z4', art: 'zukauf', preise: [1_000] },
      ],
    };
    const a = rechneKalkulation(k, produktion(), lager(), '2026-10-25').auflagen[0];
    if (!a) throw new Error('Auflage fehlt');
    expect(a.zeilen.map((z) => z.hinweise)).toEqual([
      ['Kein Preis für L1 zum 2026-10-25 – rechnet nicht'],
      ['Kein Preis von Andere GmbH für L4 – rechnet nicht'],
      ['Arbeitsplatz AP-GIBTSNICHT nicht gefunden'],
      ['Kein Lieferant angegeben'],
    ]);
    expect([a.vollstaendig, euro(a.summeVoll), euro(a.verkauf)]).toEqual([
      false,
      '1,00 €',
      '1,00 €',
    ]);
  });
});
