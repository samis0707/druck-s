import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  antwortenMitVorgabe,
  artikelFragen,
  artikelMitAntworten,
  kalkulationHinzufuegen,
  leereKalkulationen,
  merkmalVorschlaege,
  type Artikel,
  type Produktion,
} from './index';

// T112: Merkmale aus dem Katalog – Vorschläge und Auswahl bei offenen Merkmalen

function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const bohren = p.arbeitsschritte.find((s) => s.id === 'S0014');
  if (!bohren) throw new Error('S0014');
  bohren.imWeg = { art: 'merkmal', name: 'Bohren', werte: ['2-fach', '4-fach'] };
  return p;
}

const ARTIKEL: Artikel = {
  id: 'A-0001',
  titel: 'Register',
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
      merkmale: [{ name: 'Bohren', wert: { zustand: 'offen' } }],
    },
  ],
};

describe('T112 offenes Merkmal mit Werten im Katalog', () => {
  it('wird zur Auswahl 2-fach / 4-fach; ohne Antwort gilt der erste Wert', () => {
    const f = artikelFragen(ARTIKEL, undefined, produktion());
    const bohren = f.find((x) => x.schluessel === 'teil:T1:merkmal:Bohren');
    expect(bohren?.art).toBe('auswahl');
    expect(bohren?.optionen.map((o) => o.wert)).toEqual(['2-fach', '4-fach']);
    const fest = artikelMitAntworten(ARTIKEL, antwortenMitVorgabe(f, {}));
    expect(fest.teile[0]?.merkmale?.[0]?.wert).toEqual({ zustand: 'fest', wert: '2-fach' });
    const vier = artikelMitAntworten(ARTIKEL, { 'teil:T1:merkmal:Bohren': '4-fach' });
    expect(vier.teile[0]?.merkmale?.[0]?.wert).toEqual({ zustand: 'fest', wert: '4-fach' });
  });

  it('ohne Werte im Katalog bleibt es ein Textfeld', () => {
    const f = artikelFragen(ARTIKEL, undefined, BEISPIEL_PRODUKTION);
    expect(f.find((x) => x.schluessel === 'teil:T1:merkmal:Bohren')?.art).toBe('text');
  });
});

describe('T112 Merkmal-Vorschläge aus dem Katalog', () => {
  it('Namen und Werte aus „Im Arbeitsweg“, auch ohne Artikel', () => {
    const v = merkmalVorschlaege({ version: 1, artikel: [] }, produktion());
    expect(v.namen).toContain('Bohren');
    expect(v.werte['Bohren']).toEqual(['2-fach', '4-fach']);
    const ohne = merkmalVorschlaege({ version: 1, artikel: [] });
    expect(ohne.namen).toEqual([]);
  });
});

describe('T112 Arbeitsanweisung', () => {
  it('wird mit der Kalkulation gespeichert', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Register',
      auflagen: [50],
      einheit: 'Satz',
      zeilen: [],
      arbeitsanweisung: 'Digitaldruck umgekehrt 20 → 1',
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.wert.kalkulationen[0]?.arbeitsanweisung).toBe('Digitaldruck umgekehrt 20 → 1');
  });
});
