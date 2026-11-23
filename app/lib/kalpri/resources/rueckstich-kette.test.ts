import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeArtikelbestand,
  pruefeProduktion,
  rechneKalkulation,
  type Artikel,
  type ArtikelTeil,
  type Kalkulation,
  type Produktion,
} from './index';

// T104: Rückstich-Kette – „läuft mit“-Partner kommt dazu (Zusammentragen vor Heften), Lagen je
// Exemplar, Stapel für Schritte je Exemplar (Dreiseitenbeschnitt)

const HEUTE = '2026-11-08';
const MIN = 60_000;
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };

/** Beispiel-Produktion: Heften läuft im Bookletmaker mit dem Zusammentragen; Katalog-Schritt
 *  Dreiseitenbeschnitt (je Exemplar × 3 ÷ 50) am Schnellschneider mit Nebenzeit je Stapel. */
function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  p.arbeitsschritte.push({
    id: 'S0023',
    name: 'Dreiseitenbeschnitt',
    einheit: 'Schnitt',
    imWeg: { art: 'merkmal', name: 'Bindung', werte: ['Rückstich'] },
    menge: { wert: 'produkt', faktor: 3, teiler: 50 },
  });
  const platz = (id: string) => {
    const x = (p.arbeitsplaetze ?? []).find((a) => a.id === id);
    if (!x) throw new Error(id);
    return x;
  };
  platz('AP-ZUS').schritte.push({
    schrittId: 'S0017',
    ruesten: [{ name: 'Heftkopf einstellen', dauerMs: 10 * MIN, je: 'Auftrag' }],
    laeuftMit: { schrittId: 'S0013' },
  });
  platz('AP-SCHN').schritte.push({
    schrittId: 'S0023',
    leistung: { menge: 120, dauerMs: 60 * MIN },
    ruesten: [
      { name: 'Rüsten', dauerMs: 10 * MIN, je: 'Auftrag' },
      { name: 'Nebenzeit je Stapel', dauerMs: 2.5 * MIN, je: 'Stapel' },
    ],
  });
  expect(pruefeProduktion(p).ok).toBe(true);
  return p;
}

function teil(id: string, name: string, extra: Partial<ArtikelTeil>): ArtikelTeil {
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

function broschuere(): Artikel {
  const a: Artikel = {
    id: 'A-0102',
    titel: 'Broschüre A5',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: mm(148, 210) },
    merkmale: [{ name: 'Bindung', wert: { zustand: 'fest', wert: 'Rückstich' } }],
    teile: [
      teil('U', 'Umschlag', {
        seiten: { zustand: 'fest', wert: 4 },
        liegtUm: 'I',
        woraus: {
          zustand: 'fest',
          wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 300 },
        },
      }),
      teil('I', 'Inhalt', { seiten: { zustand: 'fest', wert: 16 } }),
    ],
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

function anlegen(a: Artikel, p: Produktion, auflagen = [500]) {
  const v = kalkulationAusArtikel(a, p, BEISPIEL_LAGER, { auflagen, erstelltAm: HEUTE });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0] as Kalkulation;
  return { v, k, e: rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE) };
}

const gaenge = (k: Kalkulation) =>
  k.zeilen.flatMap((z) => (z.art === 'arbeitsgang' ? [`${z.platzId} ${z.schrittId}`] : []));

describe('T104 Aus Artikel: Rückstich-Kette', () => {
  it('Zusammentragen kommt vor das Heften (gleiche Maschine), Lagen = 1 + 4 je Exemplar', () => {
    const { v, k } = anlegen(broschuere(), produktion());
    const g = gaenge(k);
    const zus = g.indexOf('AP-ZUS S0013');
    expect(zus).toBeGreaterThan(-1);
    expect(g[zus + 1]).toBe('AP-ZUS S0017');
    expect(g[zus + 2]).toBe('AP-SCHN S0023');
    const zeile = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0013');
    expect(zeile?.art === 'arbeitsgang' ? zeile.menge : undefined).toEqual({
      art: 'produkt',
      faktor: 5,
    });
    expect(v.hinweise).toContain('Heften läuft mit Zusammentragen – Zeile Zusammentragen dazu');
  });

  it('Dreiseitenbeschnitt: Stapel = Exemplare ÷ 50, Bezeichnung mit Schritt und Grund', () => {
    const { k } = anlegen(broschuere(), produktion());
    const zeile = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0023');
    expect(zeile?.art === 'arbeitsgang' ? zeile.stapel : undefined).toEqual({
      art: 'produkt',
      teiler: 50,
    });
    expect(zeile?.bezeichnung).toBe('Dreiseitenbeschnitt (Bindung: Rückstich)');
  });

  it('Heften ohne „läuft mit“ (Beispiel: Kleine Maschinen): keine Zeile Zusammentragen', () => {
    const p = produktion();
    const zus = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-ZUS');
    if (!zus) throw new Error('AP-ZUS');
    zus.schritte = zus.schritte.filter((s) => s.schrittId !== 'S0017');
    const { k } = anlegen(broschuere(), p);
    expect(gaenge(k).some((g) => g.endsWith('S0013'))).toBe(false);
  });

  it('Partner schon da (Bohren läuft mit Digitaldruck): keine zweite Druckzeile', () => {
    const p = produktion();
    const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
    if (!ton) throw new Error('AP-TON5C');
    ton.schritte.push({ schrittId: 'S0014', laeuftMit: { schrittId: 'S0001' } });
    const a: Artikel = {
      ...broschuere(),
      merkmale: [],
      teile: [
        teil('T1', 'Karte', {
          merkmale: [{ name: 'Bohren', wert: { zustand: 'fest', wert: '2-fach' } }],
        }),
      ],
    };
    const { k } = anlegen(a, p);
    expect(gaenge(k).filter((g) => g === 'AP-TON5C S0001')).toHaveLength(1);
    expect(gaenge(k)).toContain('AP-TON5C S0014');
  });
});

describe('T104 Rechnen', () => {
  it('500 Broschüren: Lagen, Heften nur Rüsten, Dreiseitenbeschnitt in 10 Stapeln', () => {
    const { e, k } = anlegen(broschuere(), produktion());
    const au = e.auflagen[0];
    const id = (s: string) =>
      k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === s)?.id ?? '';
    const zus = au?.zeilen.find((z) => z.zeileId === id('S0013'));
    const heften = au?.zeilen.find((z) => z.zeileId === id('S0017'));
    const drei = au?.zeilen.find((z) => z.zeileId === id('S0023'));
    // 500 Exemplare × 5 Lagen (der eigene Zuschuss des Zusammentragens zählt in der Laufzeit)
    expect(zus?.menge).toBe(2500);
    expect(heften?.hinweise.some((h) => h.includes('nur Rüsten'))).toBe(true);
    expect(drei?.hinweise.some((h) => h.includes('Menge in Stapel fehlt'))).toBe(false);
    expect(drei?.rechenweg).toContain(
      'Menge aus dem Produkt: 500 Exemplare in 10 Stapeln × 3 ÷ 50 = 30',
    );
    expect(drei?.menge).toBe(30);
  });

  it('Stapel von Hand geht vor', () => {
    const { k } = anlegen(broschuere(), produktion());
    const zeilen = k.zeilen.map((z) =>
      z.art === 'arbeitsgang' && z.schrittId === 'S0023'
        ? { ...z, stapel: { art: 'hand' as const, mengen: [2] } }
        : z,
    );
    const e = rechneKalkulation({ ...k, zeilen }, produktion(), BEISPIEL_LAGER, HEUTE);
    const id = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0023')?.id;
    const drei = e.auflagen[0]?.zeilen.find((z) => z.zeileId === id);
    expect(drei?.rechenweg.some((t) => t.includes('in 10 Stapeln'))).toBe(false);
    expect(drei?.hinweise.some((h) => h.includes('Menge in Stapel fehlt'))).toBe(false);
  });
});
