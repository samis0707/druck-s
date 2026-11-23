import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  anzahlAusText,
  arbeitsweg,
  imWegText,
  plaetzeFuerSchritt,
  pruefeArtikelbestand,
  seitenRegelText,
  wegMengeText,
  type Artikel,
  type ArtikelTeil,
} from './index';

const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };

function teil(id: string, name: string, extra: Partial<ArtikelTeil> = {}): ArtikelTeil {
  return {
    id,
    name,
    jeProdukt: 1,
    woraus: { zustand: 'fest', wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 300 } },
    druck: { zustand: 'fest', wert: VIER_VIER },
    wer: { zustand: 'fest', wert: 'haus' },
    ...extra,
  };
}

function artikel(teile: ArtikelTeil[], merkmale: Artikel['merkmale'] = []): Artikel {
  const a: Artikel = {
    id: 'A-0001',
    titel: 'Test',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: { breiteUm: 85_000, hoeheUm: 55_000 } },
    teile,
    merkmale,
  };
  // gültig nach dem Schema
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

const kurz = (w: ReturnType<typeof arbeitsweg>) =>
  w.schritte.map(
    (s) => `${s.teilId ?? 'Produkt'}: ${s.name}${s.bedingung ? ` (${s.bedingung})` : ''}`,
  );

describe('Arbeitsweg aus Druck und Merkmalen', () => {
  it('Visitenkarte: Druck, Schneiden, Ecken (am Teil), Verpacken (je Exemplar) – mit Maschinen', () => {
    const a = artikel(
      [
        teil('T1', 'Karte', {
          merkmale: [{ name: 'Ecken', wert: { zustand: 'fest', wert: 'gerundet R5' } }],
        }),
      ],
      [{ name: 'Verpackung', wert: { zustand: 'fest', wert: 'Karton' } }],
    );
    const w = arbeitsweg(a, BEISPIEL_PRODUKTION);
    expect(kurz(w)).toEqual([
      'T1: Digitaldruck',
      'T1: Schneiden',
      'T1: Ecken runden',
      'Produkt: Verpacken',
    ]);
    const ecken = w.schritte[2];
    expect(ecken).toMatchObject({
      grund: 'Ecken: gerundet R5',
      menge: { wert: 'stapel', faktor: 4 },
    });
    expect(ecken?.plaetze.map((p) => p.name)).toEqual(['Kleine Maschinen']);
    expect(w.schritte[0]?.plaetze[0]).toEqual({
      id: 'AP-TON5C',
      name: 'Digitaldruck Toner',
      rechnet: true,
    });
    expect(w.meldungen).toEqual([]);
  });

  it('wählbare und offene Werte machen Schritte bedingt; unbedruckt/Lieferant ohne Schritte', () => {
    const w = arbeitsweg(
      artikel([
        teil('T1', 'Karte', {
          druck: { zustand: 'waehlbar', werte: ['ohne', VIER_VIER] },
          merkmale: [
            { name: 'Ecken', wert: { zustand: 'waehlbar', werte: ['eckig', 'gerundet R5'] } },
          ],
        }),
        teil('T2', 'Kuvert', { wer: { zustand: 'fest', wert: 'lieferant' } }),
        teil('T3', 'Beileger', { druck: { zustand: 'fest', wert: 'ohne' } }),
      ]),
      BEISPIEL_PRODUKTION,
    );
    expect(kurz(w)).toEqual([
      'T1: Digitaldruck (wenn bedruckt)',
      'T1: Schneiden',
      'T1: Ecken runden (nur wenn Ecken: gerundet)',
      'T3: Schneiden',
    ]);
  });

  it('Anzahl aus dem Merkmal: „4-fach, Ø 6 mm“ → 4; ohne Zahl → Hinweis', () => {
    const mit = arbeitsweg(
      artikel([
        teil('T1', 'Karte', {
          merkmale: [{ name: 'Bohren', wert: { zustand: 'fest', wert: '4-fach, Ø 6 mm' } }],
        }),
      ]),
      BEISPIEL_PRODUKTION,
    ).schritte.find((s) => s.name === 'Bohren');
    expect(mit).toMatchObject({ anzahl: 4, hinweise: [] });
    const ohne = arbeitsweg(
      artikel([
        teil('T1', 'Karte', {
          merkmale: [{ name: 'bohren', wert: { zustand: 'fest', wert: 'ja' } }],
        }),
      ]),
      BEISPIEL_PRODUKTION,
    ).schritte.find((s) => s.name === 'Bohren');
    expect(ohne).toMatchObject({
      anzahl: null,
      hinweise: ['Anzahl fehlt im Merkmal – gerechnet mit 1'],
    });
    expect([anzahlAusText('2 Rillen'), anzahlAusText('1,5 mm'), anzahlAusText('ja')]).toEqual([
      2,
      1.5,
      null,
    ]);
  });
});

describe('Regeln am Schritt: Rückstich', () => {
  const broschuere = (umschlag: number, inhalt: number, bindung = 'Rückstich, 2 Klammern') =>
    artikel(
      [
        teil('U', 'Umschlag', { seiten: { zustand: 'fest', wert: umschlag }, liegtUm: 'I' }),
        teil('I', 'Inhalt', { seiten: { zustand: 'fest', wert: inhalt } }),
      ],
      [{ name: 'Bindung', wert: { zustand: 'fest', wert: bindung } }],
    );

  it('Umschlag 6 mit Klappe ok, Inhalt 30 → nächste mögliche 28 oder 32', () => {
    const w = arbeitsweg(broschuere(6, 30), BEISPIEL_PRODUKTION);
    expect(kurz(w)).toContain('Produkt: Heften');
    expect(w.meldungen.map((m) => m.text)).toEqual([
      'Inhalt: 30 Seiten passen nicht zu Heften (Seiten durch 4 teilbar · 8–64 Seiten) – nächste mögliche: 28 oder 32',
    ]);
  });

  it('Umschlag 8 und Inhalt 68 passen nicht; andere Bindung → keine Regel', () => {
    expect(arbeitsweg(broschuere(8, 68), BEISPIEL_PRODUKTION).meldungen.map((m) => m.text)).toEqual(
      [
        'Umschlag: 8 Seiten passen nicht zu Heften (Umschlag 4 oder 6 Seiten) – erlaubt: 4 oder 6',
        'Inhalt: 68 Seiten passen nicht zu Heften (Seiten durch 4 teilbar · 8–64 Seiten) – nächste mögliche: 64',
      ],
    );
    expect(arbeitsweg(broschuere(4, 30, 'Klebebindung'), BEISPIEL_PRODUKTION).meldungen).toEqual(
      [],
    );
  });

  it('Bindung wählbar: Meldung mit Bedingung; Bereich wird geprüft', () => {
    const a = broschuere(4, 30);
    const w = arbeitsweg(
      {
        ...a,
        merkmale: [
          { name: 'Bindung', wert: { zustand: 'waehlbar', werte: ['Rückstich', 'Klebebindung'] } },
        ],
        teile: [
          a.teile[0] as ArtikelTeil,
          teil('I', 'Inhalt', {
            seiten: { zustand: 'waehlbar', bereich: { von: 8, bis: 64, schritt: 2 } },
          }),
        ],
      },
      BEISPIEL_PRODUKTION,
    );
    expect(w.meldungen.map((m) => m.text)).toEqual([
      'nur wenn Bindung: Rückstich: Inhalt: Bereich 8–64 enthält Seitenzahlen, die nicht zu Heften passen (Seiten durch 4 teilbar · 8–64 Seiten), z. B. 10, 14, 18',
    ]);
  });
});

describe('Texte und Maschinen je Schritt', () => {
  it('wann, Menge, Regel als Text; Maschinen ohne Leistung', () => {
    expect(imWegText(undefined)).toBe('nur von Hand');
    expect(imWegText({ art: 'merkmal', name: 'Ecken', werte: ['gerundet'] })).toBe(
      'wenn Ecken: gerundet',
    );
    expect(wegMengeText({ wert: 'stapel', faktor: 4 })).toBe('Stapel × 4');
    expect(wegMengeText({ wert: 'stapel', jeAnzahl: true })).toBe(
      'Stapel × Anzahl aus dem Merkmal',
    );
    expect(wegMengeText({ wert: 'produkt', teiler: 250 })).toBe('Exemplare ÷ 250');
    expect(seitenRegelText({ vielfaches: 4, min: 8, max: 64, umschlag: [4, 6] })).toBe(
      'Seiten durch 4 teilbar · 8–64 Seiten · Umschlag 4 oder 6 Seiten',
    );
    expect(plaetzeFuerSchritt(BEISPIEL_PRODUKTION, 'S0017')).toEqual([
      { id: 'AP-KLEIN', name: 'Kleine Maschinen', rechnet: false },
    ]);
  });
});
