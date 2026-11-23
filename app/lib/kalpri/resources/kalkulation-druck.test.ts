import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  lieferantHinzufuegen,
  preisHinzufuegen,
  rechenweg,
  rechneKalkulation,
  rechneProbe,
  type AuflagenErgebnis,
  type Kalkulation,
  type Klickpreis,
  type Lager,
  type Material,
  type Produktion,
  type ZeilenErgebnis,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const euro = (g: Geld | null) => (g === null ? '–' : formatEuro(g));

const JUWEL: Material = {
  id: 'JUWEL',
  sorte: 'Juwel Premium Card glatt',
  grammatur: 320,
  dickeUm: 380,
  form: 'Bogen',
  breiteUm: 650_000,
  hoeheUm: 920_000,
};

/** Klickpreise Ricoh C7200: 4c A4 0,022 € / A3 bis 48,7 cm 0,037 €, 1c 0,009 €, SF 0,016 €. */
const KLICKS: Klickpreis[] = [
  { farbe: 'farbig', bisFormat: { breiteUm: 210_000, hoeheUm: 297_000 }, zehntelcent: 22 },
  { farbe: 'farbig', bisFormat: { breiteUm: 330_000, hoeheUm: 487_000 }, zehntelcent: 37 },
  { farbe: 'schwarz', zehntelcent: 9 },
  { farbe: 'sonderfarbe', zehntelcent: 16 },
];

function lager(material: Material = JUWEL): Lager {
  return wert(
    preisHinzufuegen(
      { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, material] },
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

/** Beispiel-Produktion: Digitaldruck mit 4 mm Rand und Klickpreisen an der Maschine
 *  (ohne: keine Klickpreise). */
function produktion(mitKlicks = true): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  ton.grenzen = { ...ton.grenzen, randUm: 4000 };
  if (mitKlicks) ton.klickpreise = KLICKS;
  return p;
}

function kalkulation(eingabe: Record<string, unknown>): Kalkulation {
  const k = wert(kalkulationHinzufuegen(leereKalkulationen(), eingabe)).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

function auflage(
  k: Kalkulation,
  p: Produktion = produktion(),
  l: Lager = lager(),
): AuflagenErgebnis {
  const a = rechneKalkulation(k, p, l, '2026-10-26').auflagen[0];
  if (!a) throw new Error('Auflage fehlt');
  return a;
}

function zeile(a: AuflagenErgebnis, id: string): ZeilenErgebnis {
  const z = a.zeilen.find((x) => x.zeileId === id);
  if (!z) throw new Error(`Zeile ${id} fehlt`);
  return z;
}

const KARTE = {
  id: 'T1',
  name: 'Karte',
  materialId: 'JUWEL',
  endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
  jeProdukt: 1,
  druckbogen: { breiteUm: 325_000, hoeheUm: 460_000 },
};

function visitenkarten(druck: Record<string, unknown>, mehr: Record<string, unknown>[] = []) {
  return {
    titel: 'Visitenkarten',
    auflagen: [500],
    einheit: 'Stueck',
    gewinnProzent: 15,
    teile: [KARTE],
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
        druck,
      },
      ...mehr,
    ],
  };
}

const VIER_VIER = { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } };

describe('Durchgänge', () => {
  it('Leistung gilt je Durchgang: 4/4 = 2 Durchgänge', () => {
    const r = wert(
      rechneProbe(BEISPIEL_PRODUKTION, {
        platzId: 'AP-TON5C',
        schrittId: 'S0001',
        menge: 100,
        durchgaenge: 2,
      }),
    );
    expect([r.durchgaenge, r.mengeGesamt, r.laufMs]).toEqual([2, 112, 268_800]);
    expect(rechenweg(r)[2]).toBe('Lauf: 112 Bogen × 2 Durchgänge ÷ 3.000/h = 4,48 min');
  });
});

describe('Druck mit Klicks', () => {
  it('Visitenkarten 4/4: 35 Bogen × 2 Seiten = 70 Klicks zu 0,037 € (A3)', () => {
    const z = zeile(auflage(kalkulation(visitenkarten(VIER_VIER))), 'Z2');
    expect(z).toMatchObject({ menge: 24, mengeGesamt: 35 });
    expect(z.klicks?.anzahl).toBe(70);
    expect(euro(z.klicks?.kosten ?? null)).toBe('2,59 €');
    // Lauf 35 × 2 ÷ 3.000/h = 1,4 min + Rüsten 5 min = 6,4 min × 164 €/h = 17,49 € + Klicks
    expect(euro(z.kostenVoll)).toBe('20,08 €');
    expect(z.rechenweg.filter((t) => t.startsWith('Klicks'))).toEqual([
      'Klicks vorne farbig: 35 × 0,037 € (bis 33 × 48,7 cm) = 1,295 €',
      'Klicks hinten farbig: 35 × 0,037 € (bis 33 × 48,7 cm) = 1,295 €',
    ]);
  });

  it('4/1 mit Sonderfarbe vorne: schwarz und Sonderfarbe je eigener Klick', () => {
    const z = zeile(
      auflage(
        kalkulation(
          visitenkarten({
            vorne: { farbe: 'farbig', sonderfarben: 1 },
            hinten: { farbe: 'schwarz' },
          }),
        ),
      ),
      'Z2',
    );
    // 35 × 0,037 + 35 × 0,016 + 35 × 0,009 = 1,295 + 0,56 + 0,315 = 2,17 €
    expect(z.klicks?.anzahl).toBe(105);
    expect(euro(z.klicks?.kosten ?? null)).toBe('2,17 €');
  });

  it('4/0 auf A4-Bogen nimmt den A4-Klick, einseitig 1 Durchgang', () => {
    const a4 = { ...KARTE, druckbogen: { breiteUm: 210_000, hoeheUm: 297_000 } };
    const z = zeile(
      auflage(kalkulation({ ...visitenkarten({ vorne: { farbe: 'farbig' } }), teile: [a4] })),
      'Z2',
    );
    expect(z.rechenweg.some((t) => t.includes('× 0,022 € (bis 21 × 29,7 cm)'))).toBe(true);
    expect(z.rechenweg.some((t) => t.includes('Durchgänge'))).toBe(false);
  });

  it('Klickpreise am Schritt gehen vor denen der Maschine', () => {
    const p = produktion();
    const schritt = p.arbeitsplaetze
      ?.find((a) => a.id === 'AP-TON5C')
      ?.schritte.find((s) => s.schrittId === 'S0001');
    if (!schritt) throw new Error('S0001 fehlt');
    schritt.klickpreise = [{ farbe: 'farbig', zehntelcent: 50 }];
    const z = zeile(auflage(kalkulation(visitenkarten(VIER_VIER)), p), 'Z2');
    // 70 Klicks × 0,050 € = 3,50 €
    expect(euro(z.klicks?.kosten ?? null)).toBe('3,50 €');
  });

  it('Maschine mit Klickpreisen, aber ohne Druck-Angabe: Hinweis, keine Klicks', () => {
    const k = kalkulation(visitenkarten(VIER_VIER));
    const ohneDruck = kalkulation({
      ...visitenkarten(VIER_VIER),
      zeilen: k.zeilen.map((z) => {
        if (z.art !== 'arbeitsgang') return z;
        const ohne: Record<string, unknown> = { ...z };
        delete ohne['druck'];
        return ohne;
      }),
    });
    const z = zeile(auflage(ohneDruck), 'Z2');
    expect(z.klicks).toBeNull();
    expect(z.hinweise).toContain('Druck (vorne/hinten) nicht angegeben – Klicks nicht gerechnet');
  });

  it('fehlende Klickpreise werden gemeldet, die Zeile rechnet ohne Klicks', () => {
    const ohne = zeile(auflage(kalkulation(visitenkarten(VIER_VIER)), produktion(false)), 'Z2');
    expect(ohne.klicks).toBeNull();
    expect(ohne.hinweise).toContain(
      'Keine Klickpreise am Arbeitsplatz hinterlegt – Klicks nicht gerechnet',
    );
    const gross = { ...KARTE, druckbogen: { breiteUm: 330_000, hoeheUm: 600_000 } };
    const z = zeile(auflage(kalkulation({ ...visitenkarten(VIER_VIER), teile: [gross] })), 'Z2');
    expect(z.hinweise).toContain('Kein Klickpreis für farbig bei 33 × 60 cm – rechnet nicht');
  });

  it('ohne Klickpreise, aber mit Verbrauch (Tinte statt Klick): kein Hinweis (T109)', () => {
    const p = produktion(false);
    const druck = (p.arbeitsplaetze ?? [])
      .find((a) => a.id === 'AP-TON5C')
      ?.schritte.find((s) => s.schrittId === 'S0001');
    if (!druck) throw new Error('S0001 fehlt');
    druck.verbrauch = [{ materialId: 'JUWEL', menge: 1, je: 'Bogen' }];
    const z = zeile(auflage(kalkulation(visitenkarten(VIER_VIER)), p), 'Z2');
    expect(z.klicks).toBeNull();
    expect(z.hinweise.some((h) => h.startsWith('Keine Klickpreise'))).toBe(false);
  });
});

describe('Aufschlag am Material und Kosten für Paginanet', () => {
  it('Aufschlag am Material: Gewinnaufschlag kommt standardmäßig dazu; Zeile geht vor Material', () => {
    const mitAufschlag = lager({ ...JUWEL, aufschlagProzent: 20 });
    const k = kalkulation(visitenkarten(VIER_VIER));
    const z = zeile(auflage(k, produktion(), mitAufschlag), 'Z1');
    expect([euro(z.kostenVoll), euro(z.kostenMitZeilenaufschlag), euro(z.verkauf)]).toEqual([
      '42,42 €',
      '50,90 €',
      '58,54 €',
    ]);
    expect(z.rechenweg.at(-2)).toBe('Aufschlag am Material: 42,42 € + 20 % + 0,00 € = 50,90 €');
    expect(z.rechenweg.at(-1)).toBe('+ Gewinnaufschlag 15 %: 50,90 € → 58,54 €');
    const zeilenAufschlag = kalkulation({
      ...visitenkarten(VIER_VIER),
      zeilen: [
        { ...visitenkarten(VIER_VIER).zeilen[0], aufschlagProzent: 10 },
        visitenkarten(VIER_VIER).zeilen[1],
      ],
    });
    expect(euro(zeile(auflage(zeilenAufschlag, produktion(), mitAufschlag), 'Z1').verkauf)).toBe(
      '53,66 €',
    );
  });

  it('Schalter am Material und an der Zeile: Aufschlag ersetzt den Gewinnaufschlag', () => {
    const ersetzt = lager({ ...JUWEL, aufschlagProzent: 20, gewinnZusaetzlich: false });
    const k = kalkulation(visitenkarten(VIER_VIER));
    const z = zeile(auflage(k, produktion(), ersetzt), 'Z1');
    expect(euro(z.verkauf)).toBe('50,90 €');
    expect(z.rechenweg.at(-1)).toBe('Aufschlag ersetzt den Gewinnaufschlag');
    // Zeile übersteuert das Material
    const zeileZusaetzlich = kalkulation({
      ...visitenkarten(VIER_VIER),
      zeilen: [
        { ...visitenkarten(VIER_VIER).zeilen[0], gewinnZusaetzlich: true },
        visitenkarten(VIER_VIER).zeilen[1],
      ],
    });
    expect(euro(zeile(auflage(zeileZusaetzlich, produktion(), ersetzt), 'Z1').verkauf)).toBe(
      '58,54 €',
    );
  });

  it('Kosten mit Zeilenaufschlägen: ohne Gewinn, mit Lieferanten- und Materialaufschlag', () => {
    const p = wert(
      lieferantHinzufuegen(produktion(), { name: 'Veredler Süd', aufschlagProzent: 15 }),
    );
    const lieferantId = p.lieferanten?.[0]?.id;
    const k = kalkulation(
      visitenkarten(VIER_VIER, [
        { id: 'Z3', art: 'zukauf', lieferantId, preise: [85_000] },
        { id: 'Z4', art: 'zukauf', lieferant: 'Ohne Aufschlag', preise: [10_000] },
      ]),
    );
    const a = auflage(k, p);
    // Papier 42,42 + Druck 20,08 + Zukauf 85 + 15 % = 97,75 + Zukauf 10,00 (Gewinn nicht drin)
    expect(euro(zeile(a, 'Z3').kostenMitZeilenaufschlag)).toBe('97,75 €');
    expect(euro(zeile(a, 'Z4').kostenMitZeilenaufschlag)).toBe('10,00 €');
    expect(euro(a.kostenMitZeilenaufschlag)).toBe('170,25 €');
    // Verkauf: alle Zeilen + 15 % Gewinn, Z3 nach dem Lieferantenaufschlag
    expect(euro(a.verkauf)).toBe('195,79 €');
  });

  it('Schalter am Lieferanten: Aufschlag ersetzt den Gewinnaufschlag', () => {
    const p = wert(
      lieferantHinzufuegen(produktion(), {
        name: 'Veredler Süd',
        aufschlagProzent: 15,
        gewinnZusaetzlich: false,
      }),
    );
    const lieferantId = p.lieferanten?.[0]?.id;
    const k = kalkulation(
      visitenkarten(VIER_VIER, [{ id: 'Z3', art: 'zukauf', lieferantId, preise: [85_000] }]),
    );
    expect(euro(zeile(auflage(k, p), 'Z3').verkauf)).toBe('97,75 €');
  });
});

describe('Reihenfolge-Hinweise', () => {
  it('Endschnitt vor dem Druck und Produkt-Schritt vor Teil-Schritten werden gemeldet', () => {
    const k = kalkulation({
      ...visitenkarten(VIER_VIER),
      zeilen: [
        {
          id: 'Z0',
          art: 'arbeitsgang',
          platzId: 'AP-PACK',
          schrittId: 'S0020',
          menge: { art: 'produkt', teiler: 250 },
        },
        {
          id: 'Z9',
          art: 'arbeitsgang',
          platzId: 'AP-SCHN',
          schrittId: 'S0006',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'endschnitt' },
        },
        ...visitenkarten(VIER_VIER).zeilen,
      ],
    });
    const a = auflage(k);
    expect(zeile(a, 'Z9').hinweise).toContain('Endschnitt steht vor dem Druck');
    expect(zeile(a, 'Z0').hinweise).toContain(
      'Schritt für das ganze Produkt steht vor Schritten der Teile',
    );
  });
});

describe('Verbrauch extra (Toner/Tinte) am Klick', () => {
  /** Sonderfarbe: Service-Klick 0,016 € + Toner aus Kartusche 700 € für 10.000 A4 bei 5 %. */
  function mitToner(standardDeckungProzent?: number): Produktion {
    const p = produktion();
    const ton = p.arbeitsplaetze?.find((a) => a.id === 'AP-TON5C');
    if (!ton?.klickpreise) throw new Error('Klickpreise fehlen');
    ton.klickpreise = ton.klickpreise.map((k) =>
      k.farbe === 'sonderfarbe'
        ? {
            ...k,
            toner: {
              kartuscheZehntelcent: 700_000,
              reichweiteSeiten: 10_000,
              ...(standardDeckungProzent === undefined ? {} : { standardDeckungProzent }),
            },
          }
        : k,
    );
    return p;
  }

  const WEISS = (deckungProzent?: number) => ({
    vorne: {
      farbe: 'farbig' as const,
      sonderfarben: 1,
      ...(deckungProzent === undefined ? {} : { deckungProzent }),
    },
  });

  it('Fläche × Deckung × Kosten je m²; Deckung aus der Kalkulation', () => {
    const z = zeile(auflage(kalkulation(visitenkarten(WEISS(20))), mitToner(50)), 'Z2');
    // je m² bei 100 %: 700.000 ÷ 10.000 ÷ 0,06237 m² (A4) ÷ 5 % = 22.447 Zehntelcent = 22,45 €;
    // Bogen 32,5 × 46 cm = 0,1495 m²
    expect(z.rechenweg.filter((t) => t.startsWith('Toner'))).toEqual([
      'Toner vorne sonderfarbe: 35 × 0,1495 m² × 20 % × 22,447 €/m² ' +
        '(Kartusche 700,00 € ÷ 10.000 Seiten A4 bei 5 % Deckung) = 23,49 €',
    ]);
    expect(euro(z.klicks?.toner ?? null)).toBe('23,49 €');
  });

  it('ohne Deckung in der Kalkulation gilt der Standard der Maschine, sonst 100 % mit Hinweis', () => {
    const standard = zeile(auflage(kalkulation(visitenkarten(WEISS())), mitToner(50)), 'Z2');
    expect(standard.rechenweg.some((t) => t.includes('× 50 % ×'))).toBe(true);
    const ohne = zeile(auflage(kalkulation(visitenkarten(WEISS())), mitToner()), 'Z2');
    expect(ohne.rechenweg.some((t) => t.includes('× 100 % ×'))).toBe(true);
    expect(ohne.hinweise).toContain(
      'Deckung für Toner vorne sonderfarbe nicht angegeben – mit 100 % gerechnet',
    );
  });

  it('Toner geht in die Kosten der Zeile ein; Klickpreis 0 = nur Verbrauch', () => {
    const ohneToner = zeile(auflage(kalkulation(visitenkarten(WEISS(20)))), 'Z2');
    const mit = zeile(auflage(kalkulation(visitenkarten(WEISS(20))), mitToner()), 'Z2');
    const toner = mit.klicks?.toner?.zehntelcent ?? 0;
    // 35 × 0,1495 m² × 20 % × 22,45 €/m² = 23,49 € zusätzlich zum Service-Klick
    expect(toner).toBe(23_490);
    // nur Verbrauch (wie Inkjet): Klickpreis 0, Toner bleibt
    const nurVerbrauch = mitToner();
    const ton = nurVerbrauch.arbeitsplaetze?.find((a) => a.id === 'AP-TON5C');
    ton?.klickpreise?.forEach((k) => {
      if (k.farbe === 'sonderfarbe') k.zehntelcent = 0;
    });
    const nur = zeile(auflage(kalkulation(visitenkarten(WEISS(20))), nurVerbrauch), 'Z2');
    expect(nur.rechenweg).toContain('Klicks vorne sonderfarbe: 35 × 0,000 € = 0,00 €');
    expect(euro(nur.klicks?.toner ?? null)).toBe('23,49 €');
    expect((mit.kostenVoll?.zehntelcent ?? 0) - (ohneToner.kostenVoll?.zehntelcent ?? 0)).toBe(
      toner,
    );
  });
});
