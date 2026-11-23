import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  preisHinzufuegen,
  rechneKalkulation,
  type Farbwerk,
  type Kalkulation,
  type Lager,
  type Produktion,
  type ZeilenErgebnis,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const euro = (g: Geld | null) => (g === null ? '–' : formatEuro(g));
const MIN = 60_000;

function lager(): Lager {
  return wert(
    preisHinzufuegen(
      {
        ...BEISPIEL_LAGER,
        materialien: [
          ...BEISPIEL_LAGER.materialien,
          {
            id: 'JUWEL',
            sorte: 'Juwel Premium Card glatt',
            grammatur: 320,
            dickeUm: 380,
            form: 'Bogen',
            breiteUm: 650_000,
            hoeheUm: 920_000,
          },
        ],
      },
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

/** Ricoh mit Farbwerk: wechselbare Station vorne, dann C M Y K; Weiß mit Toner, Gold nur Toner. */
const RICOH: Farbwerk = {
  farben: [
    { name: 'Cyan', art: 'cyan' },
    { name: 'Magenta', art: 'magenta' },
    { name: 'Gelb', art: 'gelb' },
    { name: 'Schwarz', art: 'schwarz' },
    {
      name: 'Weiß',
      art: 'sonder',
      toner: { kartuscheZehntelcent: 250_000, reichweiteSeiten: 10_000 },
    },
    { name: 'Lack', art: 'sonder' },
    {
      name: 'Gold',
      art: 'sonder',
      toner: { kartuscheZehntelcent: 300_000, reichweiteSeiten: 8_000, standardDeckungProzent: 20 },
    },
    { name: 'Silber', art: 'sonder' },
  ],
  stationen: [{}, { farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }],
  gruppen: [
    {
      name: '4c',
      farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'],
      klicks: [
        { bisLaengeUm: 297_000, zehntelcent: 22 },
        { bisLaengeUm: 487_000, zehntelcent: 37 },
        { zehntelcent: 74 },
      ],
    },
    { name: 'Schwarz', farben: ['Schwarz'], klicks: [{ zehntelcent: 9 }] },
    { name: 'Weiß', farben: ['Weiß'], klicks: [{ zehntelcent: 40 }] },
    { name: 'Lack', farben: ['Lack'], klicks: [{ zehntelcent: 16 }] },
  ],
  wechselMs: 20 * MIN,
};

function produktion(werk: Farbwerk | undefined = RICOH): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  ton.grenzen = { ...ton.grenzen, randUm: 4000 };
  if (werk) ton.farbwerk = werk;
  return p;
}

function zeile(druck: Record<string, unknown>, p: Produktion = produktion()): ZeilenErgebnis {
  const k: Kalkulation | undefined = wert(
    kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Visitenkarten',
      auflagen: [500],
      einheit: 'Stueck',
      gewinnProzent: 15,
      teile: [
        {
          id: 'T1',
          name: 'Karte',
          materialId: 'JUWEL',
          endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
          jeProdukt: 1,
          druckbogen: { breiteUm: 325_000, hoeheUm: 460_000 },
        },
      ],
      zeilen: [
        {
          id: 'Z2',
          art: 'arbeitsgang',
          platzId: 'AP-TON5C',
          schrittId: 'S0001',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
          druck,
        },
      ],
    }),
  ).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  const z = rechneKalkulation(k, p, lager(), '2026-10-28').auflagen[0]?.zeilen[0];
  if (!z) throw new Error('Zeile fehlt');
  return z;
}

const klickZeilen = (z: ZeilenErgebnis) =>
  z.rechenweg.filter((t) => t.startsWith('Klicks') || t.startsWith('Farbwerk'));

describe('Druck nach dem Farbwerk', () => {
  it('4/4 ohne Sonderfarbe rechnet wie die bisherigen Klickpreise', () => {
    const z = zeile({ vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } });
    expect(z).toMatchObject({ menge: 24, mengeGesamt: 35 });
    expect(z.klicks?.anzahl).toBe(70);
    expect(euro(z.klicks?.kosten ?? null)).toBe('2,59 €');
    expect(z.klicks?.toner).toBeNull();
    expect(euro(z.kostenVoll)).toBe('20,08 €');
    expect(klickZeilen(z)).toEqual([
      'Farbwerk vorne: Cyan, Magenta, Gelb, Schwarz',
      'Klicks vorne 4c: 35 × 0,037 € (Bogenlänge bis 487 mm) = 1,295 €',
      'Farbwerk hinten: Cyan, Magenta, Gelb, Schwarz',
      'Klicks hinten 4c: 35 × 0,037 € (Bogenlänge bis 487 mm) = 1,295 €',
    ]);
    // Lauf 1,4 min + Rüsten 5 min = 6,4 min × 164 €/h = 17,49 € + Klicks 2,59 €
    expect(z.rechenweg).toContain('Vollkosten mit Druck: 17,49 € Zeit + 2,59 € Klicks = 20,08 €');
  });

  it('4/0 mit Weiß unterlegt: ein Durchgang, Klick 4c + Weiß, Toner Weiß, 20 min Wechsel', () => {
    const z = zeile({
      vorne: {
        farbe: 'farbig',
        sonder: [{ name: 'Weiß', lage: 'unter', deckungProzent: 100 }],
      },
    });
    expect(z).toMatchObject({ menge: 24, mengeGesamt: 35 });
    // 35 × 0,037 + 35 × 0,040 = 1,295 + 1,40 = 2,70 €
    expect(z.klicks?.anzahl).toBe(70);
    expect(euro(z.klicks?.kosten ?? null)).toBe('2,70 €');
    // Toner Weiß: 35 × 0,1495 m² × 100 % × (250 € ÷ 10.000 ÷ 0,06237 m² ÷ 5 %) = 41,95 €
    expect(euro(z.klicks?.toner ?? null)).toBe('41,95 €');
    expect(z.rechenweg).toContain('Rüsten: Rüsten 5 min + Sonderfarbe wechseln 20 min = 25 min');
    expect(z.rechenweg.some((t) => t.includes('Durchgänge'))).toBe(false);
    expect(klickZeilen(z)).toEqual([
      'Farbwerk vorne: Weiß, Cyan, Magenta, Gelb, Schwarz',
      'Klicks vorne 4c: 35 × 0,037 € (Bogenlänge bis 487 mm) = 1,295 €',
      'Klicks vorne Weiß: 35 × 0,040 € = 1,40 €',
    ]);
    expect(z.rechenweg).toContain(
      'Toner vorne Weiß: 35 × 0,1495 m² × 100 % × 8,017 €/m² ' +
        '(Kartusche 250,00 € ÷ 10.000 Seiten A4 bei 5 % Deckung) = 41,95 €',
    );
  });

  it('vorne Weiß unterlegt, hinten Lack: 3 Durchgänge, Zuschuss doppelt, 2 Wechsel', () => {
    const z = zeile({
      vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter', deckungProzent: 50 }] },
      hinten: { farbe: 'farbig', sonder: [{ name: 'Lack' }] },
    });
    // Zuschuss 10 + 2 % von 24 = 11, × 2 = 22 → 46 Bogen
    expect(z).toMatchObject({ menge: 24, mengeGesamt: 46 });
    expect(z.rechenweg).toContain(
      'Zuschuss: 10 fest + 2 % = 11 × 2 (1 Durchgang mehr für Farben) = 22 → 46 Bogen',
    );
    expect(z.rechenweg).toContain('Lauf: 46 Bogen × 3 Durchgänge ÷ 3.000/h = 2,76 min');
    expect(z.rechenweg).toContain(
      'Rüsten: Rüsten 5 min + Sonderfarbe wechseln 2 × 20 min = 45 min',
    );
    expect(klickZeilen(z)).toEqual([
      'Farbwerk vorne: Weiß, Cyan, Magenta, Gelb, Schwarz',
      'Klicks vorne 4c: 46 × 0,037 € (Bogenlänge bis 487 mm) = 1,702 €',
      'Klicks vorne Weiß: 46 × 0,040 € = 1,84 €',
      'Farbwerk hinten: 2 Durchgänge – 1: Cyan, Magenta, Gelb, Schwarz · 2: Lack',
      'Klicks hinten Durchgang 1 4c: 46 × 0,037 € (Bogenlänge bis 487 mm) = 1,702 €',
      'Klicks hinten Durchgang 2 Lack: 46 × 0,016 € = 0,736 €',
    ]);
    expect(z.klicks?.anzahl).toBe(184);
    expect(z.hinweise).toContain('Mehr Durchgänge wegen der Farben: 3 statt 2');
  });

  it('Gold ohne Gruppe kostet nur Toner (Standarddeckung der Farbe), Silber gibt einen Hinweis', () => {
    const z = zeile({
      vorne: { farbe: 'schwarz', sonder: [{ name: 'Gold', lage: 'unter' }] },
      hinten: { farbe: 'schwarz', sonder: [{ name: 'Silber', lage: 'unter' }] },
    });
    expect(klickZeilen(z)).toEqual([
      'Farbwerk vorne: Gold, Schwarz',
      'Klicks vorne Schwarz: 35 × 0,009 € = 0,315 €',
      'Farbwerk hinten: Silber, Schwarz',
      'Klicks hinten Schwarz: 35 × 0,009 € = 0,315 €',
    ]);
    expect(z.rechenweg.some((t) => t.startsWith('Toner vorne Gold:') && t.includes('× 20 %'))).toBe(
      true,
    );
    expect(z.hinweise).toContain('Silber: weder Klickpreis noch Toner – nicht gerechnet');
    expect(z.rechenweg).toContain(
      'Rüsten: Rüsten 5 min + Sonderfarbe wechseln 2 × 20 min = 45 min',
    );
  });

  it('Farbe nicht im Farbwerk: Hinweis, keine Klicks, Zeit wird gerechnet', () => {
    const z = zeile({ vorne: { farbe: 'farbig', sonder: [{ name: 'Neon' }] } });
    expect(z.klicks).toBeNull();
    expect(z.hinweise).toContain(
      'Farbwerk: vorne: Neon ist nicht im Farbwerk der Maschine – Klicks nicht gerechnet',
    );
    expect(z.kostenVoll).not.toBeNull();
  });

  it('alte Sonderfarbe als Anzahl: Hinweis statt stiller Rechnung', () => {
    const z = zeile({ vorne: { farbe: 'farbig', sonderfarben: 1 } });
    expect(z.klicks).toBeNull();
    expect(z.hinweise).toContain(
      'Farbwerk: vorne: Sonderfarbe ohne Namen – im Druck die Sonderfarbe wählen – Klicks nicht gerechnet',
    );
  });

  it('ohne Wechselzeit am Farbwerk kein Rüstposten für die Sonderfarbe', () => {
    const ohneWechsel: Farbwerk = { ...RICOH };
    delete ohneWechsel.wechselMs;
    const z = zeile(
      { vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] } },
      produktion(ohneWechsel),
    );
    expect(z.rechenweg).toContain('Rüsten: Rüsten 5 min = 5 min');
  });
});
