import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  artikelFragen,
  artikelMitAntworten,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  offenesFormat,
  offenesFormatText,
  pruefeArtikelbestand,
  rechneKalkulation,
  type Artikel,
  type ArtikelTeil,
} from './index';

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

const flyer = (bund?: 'links' | 'oben') =>
  artikel({
    endformat: { zustand: 'fest', wert: mm(99, 210) },
    ...(bund ? { bund } : {}),
    teile: [
      teil('T1', 'Flyer', {
        seiten: { zustand: 'fest', wert: 6 },
        merkmale: [{ name: 'Falz', wert: { zustand: 'fest', wert: 'Wickelfalz' } }],
      }),
    ],
  });

const broschuere = (umschlag: number, inhalt: number) =>
  artikel({
    titel: 'Broschüre A5',
    teile: [
      teil('U', 'Umschlag', {
        seiten: { zustand: 'fest', wert: umschlag },
        liegtUm: 'I',
        woraus: {
          zustand: 'fest',
          wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 300 },
        },
      }),
      teil('I', 'Inhalt', { seiten: { zustand: 'fest', wert: inhalt } }),
    ],
    merkmale: [{ name: 'Bindung', wert: { zustand: 'fest', wert: 'Rückstich' } }],
  });

describe('offenes Format aus dem Schritt, der es öffnet', () => {
  it('Wickelfalz 6 Seiten: drei Felder nebeneinander; Bund oben: untereinander', () => {
    const a = flyer();
    const t = a.teile[0] as ArtikelTeil;
    const o = offenesFormat(a, t, BEISPIEL_PRODUKTION);
    expect(o).toMatchObject({ format: mm(297, 210), jeProdukt: 1, vonHand: false });
    expect(offenesFormatText(o, mm(99, 210))).toBe('offen 297 × 210 mm (Wickelfalz, 6 Seiten)');
    const oben = flyer('oben');
    expect(offenesFormat(oben, oben.teile[0] as ArtikelTeil, BEISPIEL_PRODUKTION).format).toEqual(
      mm(99, 630),
    );
  });

  it('Rückstich: Inhalt 32 Seiten = 8 Doppelbogen, Umschlag 6 Seiten = ein Bogen mit Klappe', () => {
    const a = broschuere(6, 32);
    const [u, i] = a.teile as [ArtikelTeil, ArtikelTeil];
    expect(offenesFormat(a, i, BEISPIEL_PRODUKTION)).toMatchObject({
      format: mm(296, 210),
      jeProdukt: 8,
      grund: 'Heften, 32 Seiten = 8 Bogen je Exemplar',
    });
    expect(offenesFormat(a, u, BEISPIEL_PRODUKTION)).toMatchObject({
      format: mm(444, 210),
      jeProdukt: 1,
      grund: 'Heften, Umschlag, 6 Seiten',
    });
    // 30 Seiten füllen den letzten Bogen nicht
    const b = broschuere(4, 30);
    expect(offenesFormat(b, b.teile[1] as ArtikelTeil, BEISPIEL_PRODUKTION)).toMatchObject({
      jeProdukt: 8,
      hinweise: ['30 Seiten füllen 8 Bogen zu je 4 Seiten nicht ganz'],
    });
  });

  it('ohne öffnenden Schritt = Endformat; von Hand geht vor', () => {
    const a = artikel({});
    const o = offenesFormat(a, a.teile[0] as ArtikelTeil, BEISPIEL_PRODUKTION);
    expect(o).toMatchObject({ format: mm(148, 210), jeProdukt: 1, grund: null });
    expect(offenesFormatText(o, mm(148, 210))).toBe(null);
    const f = flyer();
    const hand = { ...f, teile: [{ ...(f.teile[0] as ArtikelTeil), offenesFormat: mm(295, 210) }] };
    expect(offenesFormat(hand, hand.teile[0] as ArtikelTeil, BEISPIEL_PRODUKTION)).toMatchObject({
      format: mm(295, 210),
      grund: 'von Hand (Wickelfalz, 6 Seiten)',
      vonHand: true,
    });
  });
});

describe('Vorlage: offene und wählbare Werte abfragen', () => {
  const vorlage = artikel({
    titel: 'Broschüre (Vorlage)',
    endformat: { zustand: 'offen' },
    teile: [
      teil('U', 'Umschlag', { seiten: { zustand: 'fest', wert: 4 }, liegtUm: 'I' }),
      teil('I', 'Inhalt', {
        seiten: { zustand: 'waehlbar', bereich: { von: 8, bis: 16, schritt: 4 } },
        druck: { zustand: 'waehlbar', werte: [VIER_VIER, 'ohne'] },
      }),
    ],
    merkmale: [
      { name: 'Bindung', wert: { zustand: 'waehlbar', werte: ['Rückstich', 'Klebebindung'] } },
      { name: 'Verpackung', wert: { zustand: 'offen' } },
    ],
  });

  it('Fragen mit Auswahl; Antworten legen fest', () => {
    const fragen = artikelFragen(vorlage, BEISPIEL_LAGER);
    expect(
      fragen.map((f) => `${f.titel} (${f.art}): ${f.optionen.map((o) => o.text).join(' | ')}`),
    ).toEqual([
      'Endformat (format): ',
      'Inhalt: Farbigkeit (auswahl): 4/4 | unbedruckt',
      'Inhalt: Seiten (auswahl): 8 Seiten | 12 Seiten | 16 Seiten',
      'Bindung (auswahl): Rückstich | Klebebindung',
      'Verpackung (text): ',
    ]);
    const fest = artikelMitAntworten(vorlage, {
      endformat: mm(148, 210),
      'teil:I:seiten': '12',
      'merkmal:Bindung': '0',
      'merkmal:Verpackung': 'zu 250',
    });
    expect(fest.endformat).toEqual({ zustand: 'fest', wert: mm(148, 210) });
    expect(fest.teile[1]?.seiten).toEqual({ zustand: 'fest', wert: 12 });
    // ohne Antwort: der erste wählbare Wert
    expect(fest.teile[1]?.druck).toEqual({ zustand: 'fest', wert: VIER_VIER });
    expect(fest.merkmale?.map((m) => m.wert)).toEqual([
      { zustand: 'fest', wert: 'Rückstich' },
      { zustand: 'fest', wert: 'zu 250' },
    ]);
    expect(artikelFragen(fest)).toEqual([]);
  });
});

describe('Kalkulation aus dem Artikel', () => {
  it('Broschüre: Teile mit offenem Format und Bogen je Exemplar, Zeilen aus dem Arbeitsweg', () => {
    const { eingabe, hinweise } = kalkulationAusArtikel(
      broschuere(4, 32),
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      { auflagen: [500, 1000], erstelltAm: '2026-10-27' },
    );
    expect(eingabe.teile).toEqual([
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
    ]);
    expect(
      eingabe.zeilen.map((z) =>
        z.art === 'arbeitsgang'
          ? `${z.id} ${z.schrittId}@${z.platzId} ${z.menge.art === 'papierweg' ? `${z.menge.teilId}:${z.menge.wert}` : z.menge.art}`
          : `${z.id} ${z.art}`,
      ),
    ).toEqual([
      'Z1 material',
      'Z2 S0001@AP-TON5C U:druckbogen',
      'Z3 S0006@AP-SCHN U:endschnitt',
      'Z4 material',
      'Z5 S0001@AP-TON5C I:druckbogen',
      'Z6 S0006@AP-SCHN I:endschnitt',
      'Z7 S0017@AP-KLEIN produkt',
    ]);
    const druck = eingabe.zeilen[1];
    expect(druck?.art === 'arbeitsgang' ? druck.druck : null).toEqual(VIER_VIER);
    expect(hinweise).toEqual(['Heften: An keiner Maschine ist eine Leistung hinterlegt']);
    // gültig und rechenbar
    const r = kalkulationHinzufuegen(leereKalkulationen(), eingabe);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('Kalkulation fehlt');
    expect(k.artikelId).toBe('A-0001');
    const e = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-10-27');
    // Nutzen netto: Umschlag 1 je Exemplar, Inhalt 8 Doppelbogen je Exemplar
    expect(e.auflagen.map((x) => x.papierwege.map((p) => p.nutzenNetto))).toEqual([
      [500, 4000],
      [1000, 8000],
    ]);
    // offenes Format 296 × 210 + Beschnitt auf dem Rohbogen 70 × 100 (Toner im Beispiel ohne
    // Höchstformat): 9 Nutzen
    expect(e.auflagen[0]?.papierwege.map((p) => p.papierweg.nutzenJeBogen)).toEqual([9, 9]);
  });

  it('Lieferant → Zukauf; offene Werte und Merkmale ohne Schritt als Hinweis', () => {
    const a = artikel({
      teile: [
        teil('T1', 'Karte', {
          druck: { zustand: 'offen' },
          merkmale: [{ name: 'Lack', wert: { zustand: 'fest', wert: 'UV partiell' } }],
        }),
        teil('T2', 'Kuvert', {
          wer: { zustand: 'fest', wert: 'lieferant' },
          anfrageText: 'C6 mit Fenster',
        }),
      ],
    });
    const { eingabe, hinweise } = kalkulationAusArtikel(a, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
      auflagen: [1000],
    });
    expect(eingabe.zeilen.map((z) => `${z.art} ${z.bezeichnung ?? ''}`.trim())).toEqual([
      'material',
      'arbeitsgang',
      'zukauf Kuvert (Zukauf)',
    ]);
    expect(hinweise).toEqual([
      'Karte: Farbigkeit offen',
      'Digitaldruck nicht übernommen (wenn bedruckt)',
      'Kuvert: Preis vom Lieferanten eintragen',
      'Merkmal „Lack“: kein Arbeitsschritt im Katalog – von Hand ergänzen',
    ]);
  });
});
