import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  formatName,
  kalkulationEigenschaften,
  kalkulationHinzufuegen,
  kalkulationPasst,
  leereKalkulationen,
  leseStichworte,
  neueKalkulation,
  neuesProduktTeil,
  produktVon,
  type Artikel,
  type Kalkulation,
} from './index';

// T119: Eigenschaften und Suche, neue Kalkulation ohne Artikel

const HEUTE = '2026-11-11';

function anlegen(eingabe: Record<string, unknown>): Kalkulation {
  const r = kalkulationHinzufuegen(leereKalkulationen(), eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('keine');
  return k;
}

function mitProdukt(): Kalkulation {
  const material = BEISPIEL_LAGER.materialien.find((m) => m.grammatur !== undefined);
  if (!material) throw new Error('kein Material');
  const produkt: Artikel = {
    id: 'PRODUKT',
    titel: 'Register',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } },
    teile: [
      {
        ...neuesProduktTeil(1),
        name: 'Registerblatt',
        woraus: { zustand: 'fest', wert: { art: 'material', materialId: material.id } },
        merkmale: [{ name: 'Kaschierung', wert: { zustand: 'fest', wert: 'matt' } }],
      },
    ],
    merkmale: [{ name: 'Bohren', wert: { zustand: 'fest', wert: '2-fach' } }],
  };
  return anlegen({
    titel: 'Register für Seminar',
    kunde: 'Pagina',
    auflagen: [100],
    einheit: 'Stueck',
    zeilen: [],
    produkt,
    stichworte: ['jährlich'],
  });
}

describe('Eigenschaften und Suche (T119)', () => {
  it('1 Formatnamen, auch quer; unbekannt null', () => {
    expect(formatName({ breiteUm: 148_000, hoeheUm: 210_000 })).toBe('A5');
    expect(formatName({ breiteUm: 297_000, hoeheUm: 210_000 })).toBe('A4 quer');
    expect(formatName({ breiteUm: 85_000, hoeheUm: 55_000 })).toBe('Visitenkarte');
    expect(formatName({ breiteUm: 225_000, hoeheUm: 297_000 })).toBeNull();
  });

  it('2 Eigenschaften aus dem Produkt', () => {
    const k = mitProdukt();
    const e = kalkulationEigenschaften(k, BEISPIEL_LAGER);
    expect(e.slice(0, 3)).toEqual(['A5', '148 × 210 mm', 'Registerblatt']);
    expect(e).toContain('4/4');
    expect(e).toContain('Kaschierung: matt');
    expect(e).toContain('Bohren: 2-fach');
    expect(e.some((x) => x.endsWith(' g'))).toBe(true);
  });

  it('3 Suche über Titel, Kunde, Stichworte und Eigenschaften, alle Wörter', () => {
    const k = mitProdukt();
    expect(kalkulationPasst(k, 'a5 kaschierung', BEISPIEL_LAGER)).toBe(true);
    expect(kalkulationPasst(k, 'pagina jährlich', BEISPIEL_LAGER)).toBe(true);
    expect(kalkulationPasst(k, 'A4', BEISPIEL_LAGER)).toBe(false);
    expect(kalkulationPasst(k, '  ', BEISPIEL_LAGER)).toBe(true);
  });

  it('4 Stichworte lesen: Komma oder Semikolon, ohne Doppelte', () => {
    expect(leseStichworte('Pagina, Seminar; jährlich, pagina,, ')).toEqual([
      'Pagina',
      'Seminar',
      'jährlich',
    ]);
  });

  it('5 neue Kalkulation ohne Artikel: gültig, mit leerem Produkt', () => {
    const k = anlegen(
      neueKalkulation({
        titel: 'Flyer',
        auflagen: [1000, 2500],
        einheit: 'Stueck',
        erstelltAm: HEUTE,
      }),
    );
    expect(k.zeilen).toEqual([]);
    expect(k.artikelId).toBeUndefined();
    const p = produktVon(k);
    expect(p?.teile).toHaveLength(1);
    expect(p?.endformat.zustand).toBe('offen');
  });

  it('6 Stichworte werden geprüft (höchstens 40 Zeichen)', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      ...neueKalkulation({ titel: 'X', auflagen: [1], einheit: 'Stueck', erstelltAm: HEUTE }),
      stichworte: ['x'.repeat(41)],
    });
    expect(r.ok).toBe(false);
  });
});
