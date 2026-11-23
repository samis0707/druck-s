import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  KalkulationSchema,
  ArbeitsschrittSchema,
  kalkulationBeschreibung,
  schrittInBeschreibung,
  type Artikel,
  type Kalkulation,
  type Produktion,
} from './index';

const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };
const VIER_NULL = { vorne: { farbe: 'farbig' as const } };
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });

const flyer: Kalkulation = {
  id: 'K-0001',
  titel: 'Flyer A5',
  einheit: 'Stueck',
  auflagen: [1000, 2500],
  teile: [
    {
      id: 'F',
      name: 'Flyer',
      endformat: mm(148, 210),
      offenesFormat: mm(297, 210),
      jeProdukt: 1,
      materialId: 'L2',
    },
  ],
  zeilen: [
    {
      id: 'Z1',
      art: 'material',
      materialId: 'L2',
      menge: { art: 'papierweg', teilId: 'F', wert: 'rohbogen' },
    },
    {
      id: 'Z2',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      materialId: 'L2',
      menge: { art: 'papierweg', teilId: 'F', wert: 'druckbogen' },
      druck: VIER_VIER,
    },
    {
      id: 'Z3',
      art: 'arbeitsgang',
      platzId: 'AP-SCHN',
      schrittId: 'S0006',
      menge: { art: 'papierweg', teilId: 'F', wert: 'endschnitt' },
    },
    {
      id: 'Z4',
      art: 'arbeitsgang',
      platzId: 'AP-AEROCUT',
      schrittId: 'S0007',
      menge: { art: 'papierweg', teilId: 'F', wert: 'nutzen' },
    },
    {
      id: 'Z5',
      art: 'arbeitsgang',
      platzId: 'AP-FALZ-A',
      schrittId: 'S0011',
      menge: { art: 'papierweg', teilId: 'F', wert: 'nutzen' },
    },
    {
      id: 'Z6',
      art: 'arbeitsgang',
      platzId: 'AP-PACK',
      schrittId: 'S0020',
      menge: { art: 'produkt' },
    },
    { id: 'Z7', art: 'sonstiges', bezeichnung: 'Versand', betraege: [12000] },
  ],
};

const broschuere: Kalkulation = {
  id: 'K-0002',
  titel: 'Broschüre A5',
  einheit: 'Stueck',
  auflagen: [500],
  artikelId: 'A-0001',
  teile: [
    {
      id: 'U',
      name: 'Umschlag',
      endformat: mm(148, 210),
      offenesFormat: mm(296, 210),
      jeProdukt: 1,
      materialId: 'L2',
    },
    {
      id: 'I',
      name: 'Inhalt',
      endformat: mm(148, 210),
      offenesFormat: mm(296, 210),
      jeProdukt: 8,
      materialId: 'L1',
    },
  ],
  zeilen: [
    {
      id: 'Z1',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      menge: { art: 'papierweg', teilId: 'U', wert: 'druckbogen' },
      druck: VIER_NULL,
    },
    {
      id: 'Z2',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      menge: { art: 'papierweg', teilId: 'I', wert: 'druckbogen' },
      druck: VIER_VIER,
    },
    {
      id: 'Z3',
      art: 'arbeitsgang',
      platzId: 'AP-KLEIN',
      schrittId: 'S0017',
      menge: { art: 'produkt' },
    },
    {
      id: 'Z4',
      art: 'arbeitsgang',
      platzId: 'AP-KLEIN',
      schrittId: 'S0014',
      angaben: ['4-fach', 'Ø 6 mm'],
      menge: { art: 'produkt' },
    },
    {
      id: 'Z5',
      art: 'zukauf',
      teilId: 'U',
      lieferant: 'Druckerei X',
      beschreibung: 'intern',
      preise: [100000],
    },
  ],
};

const artikel: Artikel = {
  id: 'A-0001',
  titel: 'Broschüre A5',
  einheit: 'Stueck',
  endformat: { zustand: 'fest', wert: mm(148, 210) },
  teile: [
    {
      id: 'U',
      name: 'Umschlag',
      jeProdukt: 1,
      woraus: { zustand: 'offen' },
      druck: { zustand: 'offen' },
      wer: { zustand: 'fest', wert: 'haus' },
      seiten: { zustand: 'fest', wert: 4 },
    },
    {
      id: 'I',
      name: 'Inhalt',
      jeProdukt: 1,
      woraus: { zustand: 'offen' },
      druck: { zustand: 'offen' },
      wer: { zustand: 'fest', wert: 'haus' },
      seiten: { zustand: 'waehlbar', bereich: { von: 8, bis: 64, schritt: 4 } },
    },
  ],
};

describe('schrittInBeschreibung (T95)', () => {
  const schritt = (id: string) => {
    const s = BEISPIEL_PRODUKTION.arbeitsschritte.find((x) => x.id === id);
    if (!s) throw new Error(id);
    return s;
  };

  it('ohne Einstellung: Druck und Schneiden nein, alles andere ja', () => {
    expect(schrittInBeschreibung(schritt('S0001'))).toBe(false);
    expect(schrittInBeschreibung(schritt('S0006'))).toBe(false);
    expect(schrittInBeschreibung(schritt('S0011'))).toBe(true);
    expect(schrittInBeschreibung(schritt('S0009'))).toBe(true);
  });

  it('die Einstellung am Schritt gilt', () => {
    expect(schrittInBeschreibung({ ...schritt('S0011'), inBeschreibung: false })).toBe(false);
    expect(schrittInBeschreibung({ ...schritt('S0006'), inBeschreibung: true })).toBe(true);
  });

  it('Schema: inBeschreibung ist ja/nein und freiwillig', () => {
    expect(ArbeitsschrittSchema.safeParse(schritt('S0011')).success).toBe(true);
    expect(
      ArbeitsschrittSchema.safeParse({ ...schritt('S0011'), inBeschreibung: false }).success,
    ).toBe(true);
    const falsch = ArbeitsschrittSchema.safeParse({ ...schritt('S0011'), inBeschreibung: 'ja' });
    expect(falsch.success).toBe(false);
  });
});

describe('kalkulationBeschreibung (T95)', () => {
  it('ein Teil: Format, offen, Farbigkeit auf Papier, Arbeitsgänge; ohne Druck, Schneiden, Sonstiges, Auflage', () => {
    expect(kalkulationBeschreibung(flyer, BEISPIEL_PRODUKTION, BEISPIEL_LAGER)).toBe(
      'Flyer A5 · Format 148 × 210 mm · offen 297 × 210 mm, 4/4 auf Bilderdruck matt 300 g, Rillen, Wickelfalz · Verpacken',
    );
  });

  it('mehrere Teile mit Namen; Seiten aus dem Artikel nur, wenn festgelegt; Angaben am Schritt', () => {
    expect(
      kalkulationBeschreibung(broschuere, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
        artikel: [artikel],
      }),
    ).toBe(
      'Broschüre A5 · Format 148 × 210 mm · Umschlag: offen 296 × 210 mm, 4 Seiten, 4/0 auf Bilderdruck matt 300 g · Inhalt: offen 296 × 210 mm, 4/4 auf Bilderdruck matt 135 g · Heften, Bohren 4-fach, Ø 6 mm',
    );
  });

  it('ohne Artikel keine Seiten', () => {
    expect(kalkulationBeschreibung(broschuere, BEISPIEL_PRODUKTION, BEISPIEL_LAGER)).toContain(
      'Umschlag: offen 296 × 210 mm, 4/0 auf',
    );
  });

  it('verschiedene Endformate je Teil; Teil ohne Druck nur mit Papier', () => {
    const k: Kalkulation = {
      ...flyer,
      teile: [
        { id: 'F', name: 'Karte', endformat: mm(85, 55), jeProdukt: 1, materialId: 'L2' },
        { id: 'H', name: 'Hülle', endformat: mm(90, 60), jeProdukt: 1, materialId: 'L1' },
      ],
      zeilen: [flyer.zeilen[1] as Kalkulation['zeilen'][number]],
    };
    expect(kalkulationBeschreibung(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER)).toBe(
      'Flyer A5 · Karte: Format 85 × 55 mm, 4/4 auf Bilderdruck matt 300 g · Hülle: Format 90 × 60 mm, Bilderdruck matt 135 g',
    );
  });

  it('Häkchen am Schritt: Wickelfalz aus, Schneiden an', () => {
    const p: Produktion = {
      ...BEISPIEL_PRODUKTION,
      arbeitsschritte: BEISPIEL_PRODUKTION.arbeitsschritte.map((s) =>
        s.id === 'S0011'
          ? { ...s, inBeschreibung: false }
          : s.id === 'S0006'
            ? { ...s, inBeschreibung: true }
            : s,
      ),
    };
    expect(kalkulationBeschreibung(flyer, p, BEISPIEL_LAGER)).toBe(
      'Flyer A5 · Format 148 × 210 mm · offen 297 × 210 mm, 4/4 auf Bilderdruck matt 300 g, Schneiden, Rillen · Verpacken',
    );
  });

  it('ohne Teile: Titel und Arbeitsgänge; unbekanntes Material fällt weg', () => {
    const k: Kalkulation = {
      ...flyer,
      teile: [{ id: 'F', name: 'Flyer', endformat: mm(148, 210), jeProdukt: 1, materialId: 'L99' }],
      zeilen: [flyer.zeilen[5] as Kalkulation['zeilen'][number]],
    };
    expect(kalkulationBeschreibung(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER)).toBe(
      'Flyer A5 · Format 148 × 210 mm · Verpacken',
    );
    expect(
      kalkulationBeschreibung(
        { ...flyer, teile: undefined, zeilen: [] },
        BEISPIEL_PRODUKTION,
        BEISPIEL_LAGER,
      ),
    ).toBe('Flyer A5');
  });

  it('Schema: eigene Beschreibung freiwillig, leer nicht erlaubt', () => {
    expect(
      KalkulationSchema.safeParse({ ...flyer, beschreibung: 'Flyer, eigene Fassung' }).success,
    ).toBe(true);
    expect(KalkulationSchema.safeParse({ ...flyer, beschreibung: '   ' }).success).toBe(false);
  });
});
