import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  guenstigsteGruppen,
  rechneDruckProbe,
  type Farbwerk,
  type Produktion,
} from './index';

const euro = (g: Geld | null | undefined) => (g ? formatEuro(g) : '–');
const MIN = 60_000;
const SRA3 = { breiteUm: 325_000, hoeheUm: 460_000 };

/** Ricoh mit Klickstufen nach Bogenlänge: bis 297 mm, bis 487 mm, darüber. */
const RICOH: Farbwerk = {
  farben: [
    { name: 'Cyan', art: 'cyan' },
    { name: 'Magenta', art: 'magenta' },
    { name: 'Gelb', art: 'gelb' },
    { name: 'Schwarz', art: 'schwarz' },
    { name: 'Weiß', art: 'sonder' },
  ],
  stationen: [{ farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }, {}],
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
    { name: 'Weiß', farben: ['Weiß'], klicks: [{ bisLaengeUm: 487_000, zehntelcent: 40 }] },
  ],
  wechselMs: 20 * MIN,
};

function produktion(werk: Farbwerk | null = RICOH): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  if (werk) ton.farbwerk = werk;
  else ton.klickpreise = [{ farbe: 'farbig', zehntelcent: 37 }];
  return p;
}

const EINGABE = { platzId: 'AP-TON5C', schrittId: 'S0001', menge: 24 };

describe('Klickstufen nach Bogenlänge', () => {
  const preis = (format: { breiteUm: number; hoeheUm: number }) => {
    const w = guenstigsteGruppen(RICOH, ['Cyan', 'Schwarz'], format);
    if (!w.ok) throw new Error(w.meldung);
    return w.gruppen.map((g) => `${g.name} ${g.zehntelcent}`);
  };

  it('die längere Seite zählt: A4 → bis 297, SRA3 → bis 487, 330 × 700 → darüber', () => {
    expect(preis({ breiteUm: 210_000, hoeheUm: 297_000 })).toEqual(['4c 22']);
    expect(preis({ breiteUm: 297_000, hoeheUm: 210_000 })).toEqual(['4c 22']);
    expect(preis(SRA3)).toEqual(['4c 37']);
    expect(preis({ breiteUm: 330_000, hoeheUm: 700_000 })).toEqual(['4c 74']);
  });

  it('ohne Stufe „darüber“ hat ein langer Bogen keinen Klickpreis', () => {
    expect(guenstigsteGruppen(RICOH, ['Weiß'], { breiteUm: 330_000, hoeheUm: 700_000 })).toEqual({
      ok: false,
      meldung: 'Kein Klickpreis für Weiß bei diesem Bogenformat',
    });
  });
});

describe('Ausprobieren mit Druck (rechneDruckProbe)', () => {
  it('4/4 auf SRA3: Klicks wie in der Kalkulation, Vollkosten mit Druck', () => {
    const r = rechneDruckProbe(
      produktion(),
      EINGABE,
      { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
      SRA3,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    // 24 + Zuschuss 11 = 35 Bogen × 2 Durchgänge; Lauf 1,4 min + Rüsten 5 min = 17,49 €
    expect([r.wert.probe.mengeGesamt, r.wert.probe.durchgaenge]).toEqual([35, 2]);
    expect(r.wert.klicks?.anzahl).toBe(70);
    expect(euro(r.wert.kostenVoll)).toBe('20,08 €');
    expect(r.wert.rechenweg.slice(-1)).toEqual([
      'Vollkosten mit Druck: 17,49 € Zeit + 2,59 € Klicks = 20,08 €',
    ]);
  });

  it('Weiß unterlegt bei Station hinten: 2 Durchgänge, Zuschuss doppelt, Wechsel 20 min', () => {
    const r = rechneDruckProbe(
      produktion(),
      EINGABE,
      { vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] } },
      SRA3,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.rechenweg).toContain(
      'Farbwerk vorne: 2 Durchgänge – 1: Weiß · 2: Cyan, Magenta, Gelb, Schwarz',
    );
    expect(r.wert.rechenweg).toContain(
      'Rüsten: Rüsten 5 min + Sonderfarbe wechseln 20 min = 25 min',
    );
    expect(r.wert.probe.mengeGesamt).toBe(46);
    expect(r.wert.hinweise).toContain('Mehr Durchgänge wegen der Farben: 2 statt 1');
  });

  it('ohne Druck: nur die Probe-Rechnung, Hinweis auf fehlende Klicks', () => {
    const r = rechneDruckProbe(produktion(), EINGABE, undefined, SRA3);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.klicks).toBeNull();
    expect(euro(r.wert.kostenVoll)).toBe(euro(r.wert.probe.kostenVoll));
    expect(r.wert.hinweise).toContain(
      'Druck (vorne/hinten) nicht angegeben – Klicks nicht gerechnet',
    );
  });

  it('Maschine ohne Farbwerk: bisherige Klickpreise, 4/4 = 2 Durchgänge', () => {
    const r = rechneDruckProbe(
      produktion(null),
      EINGABE,
      { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
      SRA3,
    );
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.probe.durchgaenge).toBe(2);
    expect(r.wert.rechenweg).toContain('Klicks vorne farbig: 35 × 0,037 € = 1,295 €');
  });

  it('Fehler der Probe kommen als Fehler zurück', () => {
    const r = rechneDruckProbe(produktion(), { ...EINGABE, schrittId: 'S9999' }, undefined, SRA3);
    expect(r.ok).toBe(false);
  });
});
