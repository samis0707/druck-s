import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  offenesFormat,
  oeffnetText,
  pruefeArtikelbestand,
  rechneKalkulation,
  ruecken,
  rueckenText,
  type Artikel,
  type ArtikelTeil,
  type Lager,
  type Produktion,
} from './index';

/** Katalog mit Klebebindung (S0023) an den kleinen Maschinen – die Beispieldaten bleiben unberührt. */
const KLEBE = {
  id: 'S0023',
  name: 'Klebebindung',
  einheit: 'Exemplar' as const,
  imWeg: { art: 'merkmal' as const, name: 'Bindung', werte: ['Klebebindung'] },
  menge: { wert: 'produkt' as const },
  seiten: { vielfaches: 2, min: 8, max: 400, umschlag: [4, 6] },
  oeffnet: { nebeneinander: 2, bogen: true, ruecken: true },
};
const PRODUKTION: Produktion = {
  ...BEISPIEL_PRODUKTION,
  arbeitsschritte: [...BEISPIEL_PRODUKTION.arbeitsschritte, KLEBE],
  arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
    p.id === 'AP-KLEIN' ? { ...p, schritte: [...p.schritte, { schrittId: 'S0023' }] } : p,
  ),
};

const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });

function teil(id: string, name: string, extra: Partial<ArtikelTeil> = {}): ArtikelTeil {
  return {
    id,
    name,
    jeProdukt: 1,
    woraus: { zustand: 'fest', wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 135 } },
    druck: { zustand: 'fest', wert: VIER_VIER },
    wer: { zustand: 'fest', wert: 'haus' },
    ...extra,
  };
}

function artikel(extra: Partial<Artikel>): Artikel {
  const a: Artikel = {
    id: 'A-0001',
    titel: 'Test',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: mm(148, 210) },
    teile: [teil('T1', 'Blatt')],
    ...extra,
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

function broschuere(bindung: 'Rückstich' | 'Klebebindung'): Artikel {
  return artikel({
    titel: 'Broschüre A5',
    teile: [
      teil('U', 'Umschlag', {
        seiten: { zustand: 'fest', wert: 4 },
        liegtUm: 'I',
        woraus: {
          zustand: 'fest',
          wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 300 },
        },
      }),
      teil('I', 'Inhalt', { seiten: { zustand: 'fest', wert: 32 } }),
    ],
    merkmale: [{ name: 'Bindung', wert: { zustand: 'fest', wert: bindung } }],
  });
}

describe('Rücken aus Seiten und Papierdicke', () => {
  it('Blatt = aufgerundete Seitenhälften, Rücken = Blatt × Dicke', () => {
    expect(ruecken(32, 110)).toEqual({ seiten: 32, blatt: 16, dickeUm: 110, um: 1760 });
    expect(ruecken(31, 110)).toEqual({ seiten: 31, blatt: 16, dickeUm: 110, um: 1760 });
    expect(ruecken(1, 110)).toEqual({ seiten: 1, blatt: 1, dickeUm: 110, um: 110 });
    expect(ruecken(0, 110)).toBeNull();
    expect(ruecken(32, undefined)).toBeNull();
    expect(ruecken(32, 0)).toBeNull();
  });

  it('Text für die Anzeige', () => {
    expect(rueckenText({ seiten: 32, blatt: 16, dickeUm: 110, um: 1760 })).toBe(
      'Rücken 1,76 mm (16 Blatt × 110 µm)',
    );
  });
});

describe('Umschlag mit Rücken bei Klebebindung', () => {
  it('Umschlag 4 Seiten: zwei Endformate plus Rücken; Inhalt bleibt Doppelbogen', () => {
    const a = broschuere('Klebebindung');
    const [u, i] = a.teile as [ArtikelTeil, ArtikelTeil];
    const offen = offenesFormat(a, u, PRODUKTION, BEISPIEL_LAGER);
    expect(offen.format).toEqual({ breiteUm: 297_760, hoeheUm: 210_000 });
    expect(offen.grund).toBe(
      'Klebebindung, Umschlag, 4 Seiten + Rücken 1,76 mm (16 Blatt × 110 µm)',
    );
    expect(offen).toMatchObject({
      jeProdukt: 1,
      vonHand: false,
      hinweise: [],
      ruecken: { seiten: 32, blatt: 16, dickeUm: 110, um: 1760 },
    });
    const inhalt = offenesFormat(a, i, PRODUKTION, BEISPIEL_LAGER);
    expect(inhalt.format).toEqual(mm(296, 210));
    expect(inhalt.jeProdukt).toBe(8);
    expect(inhalt.grund).toBe('Klebebindung, 32 Seiten = 8 Bogen je Exemplar');
    expect(inhalt.ruecken).toBeNull();
  });

  it('ohne Papierdicke: kein stiller Rücken, sondern Hinweis', () => {
    const a = broschuere('Klebebindung');
    const u = a.teile[0] as ArtikelTeil;
    const ohneDicke: Lager = {
      ...BEISPIEL_LAGER,
      materialien: BEISPIEL_LAGER.materialien.map((m) => {
        if (m.id !== 'L1') return m;
        const kopie = { ...m, oberflaeche: 'beschichtet' as const };
        delete kopie.dickeUm;
        return kopie;
      }),
    };
    const offen = offenesFormat(a, u, PRODUKTION, ohneDicke);
    expect(offen.format).toEqual(mm(296, 210));
    expect(offen.ruecken).toBeNull();
    expect(offen.hinweise).toEqual(['Papierdicke fehlt – Rücken nicht gerechnet']);
  });

  it('Rückstich: kein Rücken, Umschlag bleibt 296 × 210', () => {
    const a = broschuere('Rückstich');
    const u = a.teile[0] as ArtikelTeil;
    const offen = offenesFormat(a, u, PRODUKTION, BEISPIEL_LAGER);
    expect(offen.format).toEqual(mm(296, 210));
    expect(offen.ruecken).toBeNull();
  });
});

describe('Katalogeintrag und Text', () => {
  it('Klebebindung öffnet mit Rücken', () => {
    const schritt = PRODUKTION.arbeitsschritte.find((s) => s.id === 'S0023');
    expect(schritt?.oeffnet).toEqual({ nebeneinander: 2, bogen: true, ruecken: true });
    expect(oeffnetText({ nebeneinander: 2, bogen: true, ruecken: true })).toBe(
      '2 Felder nebeneinander · Seiten auf mehrere Bogen (Bindung) · Rücken aus den Inhaltsseiten',
    );
  });

  it('Kalkulation aus dem Artikel übernimmt den Rücken ins offene Format', () => {
    const a = broschuere('Klebebindung');
    const { eingabe, hinweise } = kalkulationAusArtikel(a, PRODUKTION, BEISPIEL_LAGER, {
      auflagen: [500],
    });
    expect(eingabe.teile?.[0]?.offenesFormat).toEqual({ breiteUm: 297_760, hoeheUm: 210_000 });
    expect(eingabe.teile?.[1]?.jeProdukt).toBe(8);
    expect(hinweise).toEqual(['Klebebindung: An keiner Maschine ist eine Leistung hinterlegt']);
    const r = kalkulationHinzufuegen(leereKalkulationen(), eingabe);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation fehlt');
    expect(() => rechneKalkulation(k, PRODUKTION, BEISPIEL_LAGER, '2026-10-27')).not.toThrow();
  });
});
