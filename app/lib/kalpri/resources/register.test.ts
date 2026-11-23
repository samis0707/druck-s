import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  arbeitsweg,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeArtikelbestand,
  pruefeProduktion,
  rechneKalkulation,
  type Artikel,
  type Kalkulation,
  type Produktion,
} from './index';

// T111: Register – Stanzen schneidet aus (kein Endschnitt), Stanze aufbauen je Registerblatt
// einmal je Auftrag

const HEUTE = '2026-11-10';
const MIN = 60_000;

function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const stanzen = p.arbeitsschritte.find((s) => s.id === 'S0008');
  if (!stanzen) throw new Error('S0008');
  stanzen.imWeg = { art: 'merkmal', name: 'Register' };
  stanzen.menge = { wert: 'druckbogen' };
  stanzen.schneidetAus = true;
  p.arbeitsschritte.push({
    id: 'S0090',
    name: 'Stanze aufbauen',
    einheit: 'Blatt',
    imWeg: { art: 'merkmal', name: 'Register' },
    menge: { wert: 'blaetter' },
  });
  const vorstufe = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-VORSTUFE');
  vorstufe?.schritte.push({
    schrittId: 'S0090',
    leistung: { menge: 1, dauerMs: 10 * MIN },
    ruesten: [{ name: 'Grundform', dauerMs: 25 * MIN, je: 'Auftrag' }],
  });
  expect(pruefeProduktion(p).ok).toBe(true);
  return p;
}

function register(merkmal: 'fest' | 'offen' | null): Artikel {
  const a: Artikel = {
    id: 'A-0001',
    titel: 'Register 10-teilig',
    einheit: 'Satz',
    endformat: { zustand: 'fest', wert: { breiteUm: 160_000, hoeheUm: 210_000 } },
    teile: [
      {
        id: 'T1',
        name: 'Registerblatt',
        jeProdukt: 10,
        woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L4' } },
        druck: { zustand: 'fest', wert: { vorne: { farbe: 'farbig' } } },
        wer: { zustand: 'fest', wert: 'haus' },
        ...(merkmal === null
          ? {}
          : {
              merkmale: [
                merkmal === 'fest'
                  ? { name: 'Register', wert: { zustand: 'fest' as const, wert: 'Taben gestanzt' } }
                  : { name: 'Register', wert: { zustand: 'offen' as const } },
              ],
            }),
      },
    ],
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

const ids = (a: Artikel, p: Produktion) =>
  arbeitsweg(a, p).schritte.map((s) => `${s.teilId ?? '-'} ${s.schrittId}`);

describe('T111 Arbeitsweg Register', () => {
  it('mit Register: Stanzen und Stanze aufbauen, kein Endschnitt', () => {
    const w = ids(register('fest'), produktion());
    expect(w).toContain('T1 S0008');
    expect(w).toContain('T1 S0090');
    expect(w).not.toContain('T1 S0006');
  });

  it('ohne Register: Endschnitt bleibt, kein Stanzen', () => {
    const w = ids(register(null), produktion());
    expect(w).toContain('T1 S0006');
    expect(w).not.toContain('T1 S0008');
  });
});

describe('T111 Kalkulation Register', () => {
  function anlegen(): Kalkulation {
    const v = kalkulationAusArtikel(register('fest'), produktion(), BEISPIEL_LAGER, {
      auflagen: [50, 500],
      erstelltAm: HEUTE,
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('keine Kalkulation');
    return k;
  }

  it('Stanze aufbauen: 10 Blätter einmal je Auftrag, 25 + 100 min, gleich in jeder Auflage', () => {
    const k = anlegen();
    const z = k.zeilen.find((x) => x.art === 'arbeitsgang' && x.schrittId === 'S0090');
    expect(z?.art === 'arbeitsgang' ? z.menge : undefined).toEqual({
      art: 'auftrag',
      teilId: 'T1',
    });
    const e = rechneKalkulation(k, produktion(), BEISPIEL_LAGER, HEUTE);
    const mengen = e.auflagen.map((a) => a.zeilen.find((x) => x.zeileId === z?.id)?.menge);
    expect(mengen).toEqual([10, 10]);
    const dauer = e.auflagen.map((a) => a.zeilen.find((x) => x.zeileId === z?.id)?.zeitMs);
    expect(dauer).toEqual([125 * MIN, 125 * MIN]);
  });

  it('Stanzen zählt Druckbogen (nicht Registerblätter)', () => {
    const k = anlegen();
    const z = k.zeilen.find((x) => x.art === 'arbeitsgang' && x.schrittId === 'S0008');
    expect(z?.art === 'arbeitsgang' ? z.menge : undefined).toEqual({
      art: 'papierweg',
      teilId: 'T1',
      wert: 'druckbogen',
    });
    const e = rechneKalkulation(k, produktion(), BEISPIEL_LAGER, HEUTE);
    const dz = k.zeilen.find((x) => x.art === 'arbeitsgang' && x.schrittId === 'S0001');
    const druck = e.auflagen[0]?.zeilen.find((x) => x.zeileId === dz?.id);
    const stanz = e.auflagen[0]?.zeilen.find((x) => x.zeileId === z?.id);
    // gute Menge: so viele Druckbogen wie der Druck, weit unter 500 Registerblättern
    expect(stanz?.menge).toBeLessThan(500);
    expect(stanz?.menge).toBe(druck?.menge);
  });

  it('Teil fehlt bei „je Blatt“: Prüfung meldet', () => {
    const k = anlegen();
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      ...k,
      teile: [],
      zeilen: k.zeilen.filter(
        (x) => !(x.art === 'arbeitsgang' || x.art === 'material') || x.menge.art !== 'papierweg',
      ),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.map((f) => f.meldung)).toContain('Teil T1 nicht vorhanden');
  });
});

describe('T111 Vorschneiden bleibt beim Stanzen', () => {
  it('Rohbogen 70 × 100 mit Druckbogen 33 × 48,7: Vorschneiden ja, Endschnitt nein', () => {
    const a = register('fest');
    const teil = a.teile[0];
    if (!teil) throw new Error('Teil');
    const groß: Artikel = {
      ...a,
      teile: [
        { ...teil, woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L1' } } },
      ],
    };
    // L1 (70 × 100) mit eigenem Druckbogen 33 × 48,7 → muss vorgeschnitten werden
    const lager = JSON.parse(JSON.stringify(BEISPIEL_LAGER)) as typeof BEISPIEL_LAGER;
    const l1 = lager.materialien.find((m) => m.id === 'L1');
    if (l1?.form === 'Bogen') l1.druckbogen = { breiteUm: 330_000, hoeheUm: 487_000 };
    const v = kalkulationAusArtikel(groß, produktion(), lager, {
      auflagen: [50],
      erstelltAm: HEUTE,
    });
    const schnitte = (v.eingabe['zeilen'] as { schrittId?: string; bezeichnung?: string }[]).filter(
      (z) => z.schrittId === 'S0006',
    );
    expect(schnitte.map((z) => z.bezeichnung)).toEqual(['Vorschneiden']);
  });
});
