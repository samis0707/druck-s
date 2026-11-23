import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  artikelAusKalkulation,
  artikelUebernehmen,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  leererArtikelbestand,
  type Artikel,
  type ArtikelTeil,
  type Artikelbestand,
  type Kalkulation,
} from './index';

const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });

const kalkulation: Kalkulation = {
  id: 'K-0001',
  titel: 'Broschüre A5',
  kunde: 'Muster GmbH',
  einheit: 'Stueck',
  auflagen: [500],
  erstelltAm: '2026-10-27',
  teile: [
    {
      id: 'U',
      name: 'Umschlag',
      endformat: mm(148, 210),
      offenesFormat: { breiteUm: 297_760, hoeheUm: 210_000 },
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
      beschnittUm: 3000,
    },
  ],
  zeilen: [
    {
      id: 'Z1',
      art: 'material',
      materialId: 'L2',
      menge: { art: 'papierweg', teilId: 'U', wert: 'rohbogen' },
    },
    {
      id: 'Z2',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      materialId: 'L2',
      menge: { art: 'papierweg', teilId: 'U', wert: 'druckbogen' },
      druck: VIER_VIER,
    },
    {
      id: 'Z3',
      art: 'material',
      materialId: 'L1',
      menge: { art: 'papierweg', teilId: 'I', wert: 'rohbogen' },
    },
    {
      id: 'Z4',
      art: 'arbeitsgang',
      platzId: 'AP-TON5C',
      schrittId: 'S0001',
      materialId: 'L1',
      menge: { art: 'papierweg', teilId: 'I', wert: 'druckbogen' },
      druck: VIER_VIER,
    },
    {
      id: 'Z5',
      art: 'arbeitsgang',
      platzId: 'AP-KLEIN',
      schrittId: 'S0017',
      menge: { art: 'produkt' },
    },
  ],
};

function bestandMit(artikel: Artikel): Artikelbestand {
  return { version: 1, artikel: [artikel] };
}

const leer = leererArtikelbestand();

/** Broschüre wie im Artikel-Reiter: Umschlag (Sorte 300 g) liegt um Inhalt (32 Seiten). */
function broschuere(): Artikel {
  const teil = (id: string, name: string, extra: Partial<ArtikelTeil>): ArtikelTeil => ({
    id,
    name,
    jeProdukt: 1,
    woraus: {
      zustand: 'fest',
      wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 135 },
    },
    druck: { zustand: 'fest', wert: VIER_VIER },
    wer: { zustand: 'fest', wert: 'haus' },
    ...extra,
  });
  return {
    id: 'A-0007',
    titel: 'Broschüre A5',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: mm(148, 210) },
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
    merkmale: [{ name: 'Bindung', wert: { zustand: 'fest', wert: 'Rückstich' } }],
    lager: { losgroesse: 500 },
  };
}

/** Kalkulation aus dem Artikel, wie „Neue Kalkulation → Aus Artikel“ sie anlegt. */
function kalkulationAus(a: Artikel): Kalkulation {
  const { eingabe } = kalkulationAusArtikel(a, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
    auflagen: [500],
  });
  const r = kalkulationHinzufuegen(leereKalkulationen(), eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('Kalkulation fehlt');
  return k;
}

describe('Artikelentwurf ohne Grundlage', () => {
  it('Kopf, Endformat, Teile mit Papier und Farbigkeit; Merkmal aus dem Schritt', () => {
    const r = artikelAusKalkulation(kalkulation, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, leer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { artikel, grundlage, hinweise } = r.wert;
    expect(grundlage).toBeNull();
    expect(artikel.titel).toBe('Broschüre A5');
    expect(artikel.kunde).toBe('Muster GmbH');
    expect(artikel.endformat).toEqual({ zustand: 'fest', wert: mm(148, 210) });
    expect(artikel.teile.map((t) => `${t.id} ${t.name} ${t.jeProdukt}`)).toEqual([
      'U Umschlag 1',
      'I Inhalt 8',
    ]);
    expect(artikel.teile[0]?.woraus).toEqual({
      zustand: 'fest',
      wert: { art: 'material', materialId: 'L2' },
    });
    expect(artikel.teile[1]?.druck).toEqual({ zustand: 'fest', wert: VIER_VIER });
    expect(artikel.teile[0]?.wer).toEqual({ zustand: 'fest', wert: 'haus' });
    expect(artikel.teile[1]?.offenesFormat).toEqual(mm(296, 210));
    expect(artikel.teile[1]?.beschnittUm).toBe(3000);
    // Heften hat „Im Arbeitsweg: Bindung: Rückstich“ → Merkmal des Produkts
    expect(artikel.merkmale).toEqual([
      { name: 'Bindung', wert: { zustand: 'fest', wert: 'Rückstich' } },
    ]);
    expect(hinweise).toEqual(['Seiten stehen nicht in der Kalkulation – im Artikel ergänzen']);
    // gültig
    const neu = artikelUebernehmen(kalkulation, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, leer, 'neu');
    expect(neu.ok ? neu.wert.artikelId : neu.fehler).toBe('A-0001');
  });

  it('ohne Teile: Fehler statt leerem Artikel', () => {
    const r = artikelAusKalkulation(
      { ...kalkulation, teile: [] },
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      leer,
    );
    expect(r.ok ? [] : r.fehler).toEqual([
      { pfad: 'teile', meldung: 'Kalkulation ohne Teile – kein Artikel' },
    ]);
  });
});

describe('Artikel aktualisieren: zusammenführen statt ersetzen', () => {
  it('Seiten, Umschlag, Merkmale, Stück je Produkt und Lager bleiben; neues Papier kommt dazu', () => {
    const a = broschuere();
    const k = kalkulationAus(a);
    // in der Kalkulation: Inhalt auf Offset hochweiß 90 g (L3) umgestellt
    const k2: Kalkulation = {
      ...k,
      teile: (k.teile ?? []).map((t) => (t.id === 'I' ? { ...t, materialId: 'L3' } : t)),
    };
    const r = artikelUebernehmen(
      k2,
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      bestandMit(a),
      'aktualisieren',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.artikelId).toBe('A-0007');
    expect(r.wert.hinweise).toEqual([]);
    const neu = r.wert.bestand.artikel[0];
    expect(neu?.lager).toEqual({ losgroesse: 500 });
    expect(neu?.merkmale).toEqual(a.merkmale);
    expect(neu?.teile.map((t) => [t.id, t.jeProdukt, t.seiten, t.liegtUm ?? null])).toEqual([
      ['U', 1, { zustand: 'fest', wert: 4 }, 'I'],
      ['I', 1, { zustand: 'fest', wert: 32 }, null],
    ]);
    // Umschlag: L2 passt zur Sorte → Sorte bleibt; Inhalt: anderes Papier → Lagermaterial
    expect(neu?.teile[0]?.woraus).toEqual(a.teile[0]?.woraus);
    expect(neu?.teile[1]?.woraus).toEqual({
      zustand: 'fest',
      wert: { art: 'material', materialId: 'L3' },
    });
    // abgeleitetes offenes Format wird nicht als „von Hand“ eingefroren
    expect(neu?.teile[1]?.offenesFormat).toBeUndefined();
  });

  it('wählbare Werte bleiben wählbar; Teile ohne Gegenstück bleiben', () => {
    const a = broschuere();
    const vorlage: Artikel = {
      ...a,
      teile: [
        ...a.teile.map((t) =>
          t.id === 'I'
            ? { ...t, druck: { zustand: 'waehlbar' as const, werte: [VIER_VIER, 'ohne' as const] } }
            : t,
        ),
        {
          id: 'B',
          name: 'Beileger',
          jeProdukt: 1,
          woraus: { zustand: 'offen' },
          druck: { zustand: 'fest', wert: 'ohne' },
          wer: { zustand: 'fest', wert: 'lieferant' },
        },
      ],
    };
    const k = kalkulationAus(a);
    const r = artikelAusKalkulation(
      { ...k, artikelId: 'A-0007' },
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      bestandMit(vorlage),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.grundlage).toBe('A-0007');
    expect(r.wert.artikel.teile[1]?.druck).toEqual(vorlage.teile[1]?.druck);
    expect(r.wert.artikel.teile.map((t) => t.id)).toEqual(['U', 'I', 'B']);
    expect(r.wert.hinweise).toEqual([
      'Inhalt: wählbare Werte bleiben wählbar',
      'Beileger: nicht in der Kalkulation – unverändert',
    ]);
  });
});

describe('In den Artikel übernehmen', () => {
  it('neu mit Grundlage: neue ID, entstanden aus, ohne „auf Lager führen“', () => {
    const a = broschuere();
    const r = artikelUebernehmen(
      kalkulationAus(a),
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      bestandMit(a),
      'neu',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.artikelId).toBe('A-0008');
    const neu = r.wert.bestand.artikel[1];
    expect(neu?.entstandenAus).toBe('A-0007');
    expect(neu?.lager).toBeUndefined();
    expect(neu?.teile[1]?.seiten).toEqual({ zustand: 'fest', wert: 32 });
    expect(r.wert.bestand.artikel[0]).toEqual(a);
  });

  it('keiner: nichts wird geschrieben', () => {
    const r = artikelUebernehmen(kalkulation, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, leer, 'keiner');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.artikelId).toBeNull();
    expect(r.wert.bestand).toBe(leer);
  });

  it('aktualisieren ohne oder mit unbekanntem Artikel: Fehler', () => {
    const ohne = artikelUebernehmen(
      kalkulation,
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      leer,
      'aktualisieren',
    );
    expect(ohne.ok ? [] : ohne.fehler).toEqual([
      { pfad: 'artikelId', meldung: 'Kalkulation nennt keinen Artikel' },
    ]);
    const fremd = artikelUebernehmen(
      { ...kalkulation, artikelId: 'A-0009' },
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      leer,
      'aktualisieren',
    );
    expect(fremd.ok ? [] : fremd.fehler).toEqual([
      { pfad: 'artikelId', meldung: 'Artikel A-0009 nicht gefunden' },
    ]);
  });
});
