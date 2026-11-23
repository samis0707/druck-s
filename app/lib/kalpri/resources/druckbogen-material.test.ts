import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  preisHinzufuegen,
  pruefeArtikelbestand,
  pruefeLager,
  pruefeMaterial,
  rechneKalkulation,
  type Artikel,
  type Kalkulation,
  type Lager,
  type Material,
  type Produktion,
} from './index';

// T103: Druckbogen am Material (Vorschnitt) und Vorschneiden „Aus Artikel“

const HEUTE = '2026-11-08';
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const VIER_VIER = { vorne: { farbe: 'farbig' as const }, hinten: { farbe: 'farbig' as const } };

const JUWEL = {
  id: 'M-JUWEL',
  form: 'Bogen',
  sorte: 'Juwel Premium Card matt',
  grammatur: 320,
  dickeUm: 380,
  breiteUm: 650_000,
  hoeheUm: 920_000,
  laufrichtung: 'SB',
  druckbogen: mm(324, 458),
} as Material;

/** Lager mit Juwel 65 × 92 (Druckbogen 32,4 × 45,8), 400 € je 1.000 Bogen. */
function lager(material: Material = JUWEL): Lager {
  const l: Lager = { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, material] };
  const r = preisHinzufuegen(l, {
    materialId: material.id,
    lieferant: 'Berberich',
    basis: 'je1000',
    betragZehntelcent: 400_000,
    gueltigAb: '2026-01-01',
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

/** Beispiel-Produktion, Tonermaschine höchstens 33 × 48,7 cm, Rand 4 mm. */
function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C');
  ton.grenzen = { ...ton.grenzen, randUm: 4000, formatMax: mm(330, 487) };
  return p;
}

function visitenkarte(materialId = 'M-JUWEL'): Artikel {
  const a: Artikel = {
    id: 'A-0101',
    titel: 'Visitenkarte',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: mm(85, 55) },
    teile: [
      {
        id: 'T1',
        name: 'Karte',
        jeProdukt: 1,
        woraus: { zustand: 'fest', wert: { art: 'material', materialId } },
        druck: { zustand: 'fest', wert: VIER_VIER },
        wer: { zustand: 'fest', wert: 'haus' },
      },
    ],
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

function ausArtikel(a: Artikel, auflagen: number[], l = lager(), p = produktion()) {
  const v = kalkulationAusArtikel(a, p, l, { auflagen, erstelltAm: HEUTE });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0] as Kalkulation;
  return { v, k, e: rechneKalkulation(k, p, l, HEUTE) };
}

describe('T103 Schema: Druckbogen am Material', () => {
  it('Bogen mit Druckbogen 324 × 458 ist gültig, auch gedreht', () => {
    expect(pruefeMaterial(JUWEL).ok).toBe(true);
    expect(pruefeMaterial({ ...JUWEL, druckbogen: mm(458, 324) }).ok).toBe(true);
  });

  it('größer als der Bogen: Meldung am Feld druckbogen (Material und Lager)', () => {
    const gross = { ...JUWEL, druckbogen: mm(660, 930) };
    const r = pruefeMaterial(gross);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fehler).toContainEqual({
        pfad: 'druckbogen',
        meldung: 'Druckbogen ist größer als der Bogen',
      });
    }
    const l = pruefeLager({
      ...BEISPIEL_LAGER,
      materialien: [...BEISPIEL_LAGER.materialien, gross],
    });
    expect(l.ok).toBe(false);
  });
});

describe('T103 Aus Artikel: Vorschneiden kommt von selbst', () => {
  it('Visitenkarte auf Juwel: Material, Vorschneiden, Druck, Schneiden – in dieser Reihenfolge', () => {
    const { k, v } = ausArtikel(visitenkarte(), [250]);
    expect(
      k.zeilen.map((z) =>
        z.art === 'arbeitsgang'
          ? `${z.schrittId}${z.bezeichnung ? ` ${z.bezeichnung}` : ''}`
          : z.art,
      ),
    ).toEqual(['material', 'S0006 Vorschneiden', 'S0001', 'S0006']);
    const vor = k.zeilen[1];
    expect(vor?.art === 'arbeitsgang' ? vor.menge : null).toEqual({
      art: 'papierweg',
      teilId: 'T1',
      wert: 'vorschneiden',
      gestapelt: true,
    });
    expect(v.hinweise).toEqual([]);
  });

  it('Rohbogen zu groß, Material ohne Druckbogen: auch Vorschneiden', () => {
    const ohne = { ...JUWEL, id: 'M-OHNE' } as Material & { druckbogen?: unknown };
    delete ohne.druckbogen;
    const { k } = ausArtikel(visitenkarte('M-OHNE'), [250], lager(ohne));
    expect(k.zeilen.some((z) => z.art === 'arbeitsgang' && z.bezeichnung === 'Vorschneiden')).toBe(
      true,
    );
  });

  it('Bogen passt in die Maschine (SRA3): kein Vorschneiden', () => {
    const sra3 = {
      ...JUWEL,
      id: 'M-SRA3',
      breiteUm: 320_000,
      hoeheUm: 450_000,
    } as Material & { druckbogen?: unknown };
    delete sra3.druckbogen;
    const { k } = ausArtikel(visitenkarte('M-SRA3'), [250], lager(sra3));
    expect(k.zeilen.some((z) => z.art === 'arbeitsgang' && z.bezeichnung === 'Vorschneiden')).toBe(
      false,
    );
  });
});

describe('T103 Rechnen mit dem Druckbogen vom Material', () => {
  it('250 Visitenkarten: 21 Nutzen auf 32,4 × 45,8, 6 Rohbogen zu 0,40 €, kein Hinweis', () => {
    const { e } = ausArtikel(visitenkarte(), [250]);
    const au = e.auflagen[0];
    const weg = au?.papierwege[0]?.papierweg;
    expect(weg?.rechenweg).toContain(
      'Druckbogen vom Material: 32,4 × 45,8 cm aus Rohbogen 65 × 92 cm',
    );
    expect(weg?.nutzenJeBogen).toBe(21);
    expect(weg?.druckbogenJeRohbogen).toBe(4);
    expect(weg?.rohbogen).toBe(6);
    expect(weg?.hinweise).toEqual([]);
    const papier = au?.zeilen.find((z) => z.zeileId === 'Z1');
    expect(papier?.menge).toBe(6);
    expect(papier?.kostenVoll?.zehntelcent).toBe(2_400);
    const druck = au?.zeilen.find((z) => z.zeileId === 'Z3');
    expect(druck?.hinweise.some((h) => h.includes('Nicht geeignet'))).toBe(false);
    expect(au?.vollstaendig).toBe(true);
  });

  it('Druckbogen des Teils geht vor', () => {
    const { k } = ausArtikel(visitenkarte(), [250]);
    const teile = (k.teile ?? []).map((t) => ({ ...t, druckbogen: mm(320, 450) }));
    const p = produktion();
    const e = rechneKalkulation({ ...k, teile }, p, lager(), HEUTE);
    const weg = e.auflagen[0]?.papierwege[0]?.papierweg;
    expect(weg?.druckbogenFormat).toEqual(mm(320, 450));
    expect(weg?.rechenweg.some((t) => t.startsWith('Druckbogen vom Material'))).toBe(false);
  });

  it('Druckbogen vom Material größer als die Maschine: Hinweis, dann Vorschlag wie bisher', () => {
    const p = produktion();
    const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
    if (!ton) throw new Error('AP-TON5C');
    ton.grenzen = { ...ton.grenzen, formatMax: mm(320, 450) };
    const { e } = ausArtikel(visitenkarte(), [250], lager(), p);
    const weg = e.auflagen[0]?.papierwege[0]?.papierweg;
    expect(weg?.hinweise).toContain(
      'Druckbogen vom Material 32,4 × 45,8 cm passt nicht in die Druckmaschine (höchstens 32 × 45 cm)',
    );
    expect(weg?.rechenweg.some((t) => t.startsWith('Druckbogen automatisch'))).toBe(true);
  });
});
