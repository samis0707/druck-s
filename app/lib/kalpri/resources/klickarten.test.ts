import { describe, expect, it } from 'vitest';
import { formatEuro } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  preisHinzufuegen,
  pruefeProduktion,
  rechneKalkulation,
  type AuflagenErgebnis,
  type Farbwerk,
  type Kalkulation,
  type KlickartPosten,
  type Lager,
  type Produktion,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

/** Ricoh wie beim Nutzer: C M Y K fest, Sonderfarbstation hinten; 4c, 1c, Weiß. */
const RICOH: Farbwerk = {
  farben: [
    { name: 'Cyan', art: 'cyan' },
    { name: 'Magenta', art: 'magenta' },
    { name: 'Gelb', art: 'gelb' },
    { name: 'Schwarz', art: 'schwarz' },
    { name: 'Weiß', art: 'sonder' },
    { name: 'Lack', art: 'sonder' },
  ],
  stationen: [{ farbe: 'Cyan' }, { farbe: 'Magenta' }, { farbe: 'Gelb' }, { farbe: 'Schwarz' }, {}],
  gruppen: [
    { name: '4c', farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'], klicks: [{ zehntelcent: 25 }] },
    { name: '1c', farben: ['Schwarz'], klicks: [{ zehntelcent: 9 }] },
    { name: 'Weiß', farben: ['Weiß'], klicks: [{ zehntelcent: 16 }] },
  ],
  wechselMs: 20 * 60_000,
};

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

function produktion(werk: Farbwerk | null): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  if (werk) ton.farbwerk = werk;
  else {
    ton.klickpreise = [
      { farbe: 'farbig', zehntelcent: 37 },
      { farbe: 'schwarz', zehntelcent: 9 },
      { farbe: 'sonderfarbe', zehntelcent: 16 },
    ];
  }
  return p;
}

const druckZeile = (id: string, druck: Record<string, unknown>) => ({
  id,
  art: 'arbeitsgang',
  platzId: 'AP-TON5C',
  schrittId: 'S0001',
  menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
  druck,
});

function auflage(p: Produktion, zeilen: Record<string, unknown>[]): AuflagenErgebnis {
  const k: Kalkulation | undefined = wert(
    kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Karten',
      auflagen: [500],
      einheit: 'Stueck',
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
      zeilen,
    }),
  ).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  const a = rechneKalkulation(k, p, lager(), '2026-10-28').auflagen[0];
  if (!a) throw new Error('Auflage fehlt');
  return a;
}

const text = (l: readonly KlickartPosten[]) =>
  l.map((k) => `${k.name} ${k.anzahl} = ${formatEuro(k.kosten)}`);

describe('Klicks je Klickart', () => {
  it('Farbwerk: 4c vorne mit Weiß, hinten 1c – je Zeile und für den Auftrag', () => {
    const a = auflage(produktion(RICOH), [
      druckZeile('Z1', {
        vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß' }] },
        hinten: { farbe: 'schwarz' },
      }),
    ]);
    // 20 Druckbogen + Zuschuss 11 = 31: vorne 4c + Weiß (über 4c, Station hinten: ein
    // Durchgang), hinten 1c
    expect(text(a.zeilen[0]?.klicks?.jeKlickart ?? [])).toEqual([
      '4c 31 = 0,78 €',
      'Weiß 31 = 0,50 €',
      '1c 31 = 0,28 €',
    ]);
    expect(text(a.klicksJeKlickart)).toEqual([
      '4c 31 = 0,78 €',
      'Weiß 31 = 0,50 €',
      '1c 31 = 0,28 €',
    ]);
  });

  it('zwei Druckzeilen werden je Klickart zusammengezählt', () => {
    const a = auflage(produktion(RICOH), [
      druckZeile('Z1', { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } }),
      druckZeile('Z2', { vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] } }),
    ]);
    // Z2: Weiß unterlegt bei Station hinten = 2 Durchgänge, Zuschuss 11 × 2 = 22 → 42 Bogen;
    // Z1 davor bekommt die 22 als späteren Zuschuss: 42 + 11 = 53 Bogen × 2 Seiten
    expect(text(a.klicksJeKlickart)).toEqual(['4c 148 = 3,70 €', 'Weiß 42 = 0,67 €']);
  });

  it('ohne Farbwerk: bisherige Klickpreise als 4c, 1c, Sonderfarbe', () => {
    const a = auflage(produktion(null), [
      druckZeile('Z1', {
        vorne: { farbe: 'farbig', sonderfarben: 1 },
        hinten: { farbe: 'schwarz' },
      }),
    ]);
    expect(text(a.klicksJeKlickart)).toEqual([
      '4c 31 = 1,15 €',
      'Sonderfarbe 31 = 0,50 €',
      '1c 31 = 0,28 €',
    ]);
  });

  it('Papier: der zusätzliche Durchgang für die Farben bekommt auch Papier (Zuschuss doppelt)', () => {
    const a = auflage(produktion(RICOH), [
      {
        id: 'Z0',
        art: 'material',
        materialId: 'JUWEL',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
      },
      druckZeile('Z2', { vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] } }),
    ]);
    // 20 Druckbogen netto + 22 Zuschuss (11 × 2 Durchgänge) = 42 – so viel braucht der Druck
    expect(a.zeilen[0]?.menge).toBe(42);
    expect(a.zeilen[1]?.mengeGesamt).toBe(42);
  });

  it('ohne Druck keine Klicks', () => {
    const a = auflage(produktion(RICOH), [
      {
        id: 'Z1',
        art: 'arbeitsgang',
        platzId: 'AP-TON5C',
        schrittId: 'S0001',
        menge: { art: 'hand', mengen: [10] },
      },
    ]);
    expect(a.klicksJeKlickart).toEqual([]);
  });

  it('Schema: doppelte Klickart wird gemeldet', () => {
    const p = JSON.parse(JSON.stringify(produktion(RICOH))) as {
      arbeitsplaetze: { id: string; farbwerk?: { gruppen: unknown[] } }[];
    };
    const i = p.arbeitsplaetze.findIndex((x) => x.id === 'AP-TON5C');
    p.arbeitsplaetze[i]?.farbwerk?.gruppen.push({
      name: '4C',
      farben: ['Cyan'],
      klicks: [{ zehntelcent: 1 }],
    });
    const r = pruefeProduktion(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler).toEqual([
      { pfad: `arbeitsplaetze.${i}.farbwerk.gruppen.3.name`, meldung: 'Klickart doppelt: 4C' },
    ]);
  });
});
