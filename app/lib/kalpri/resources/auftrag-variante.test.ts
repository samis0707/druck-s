import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  artikelAusKalkulation,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  mengeAusQuelle,
  pruefeArtikelbestand,
  pruefeKalkulationen,
  rechneKalkulation,
  type Artikel,
  type ArtikelTeil,
  type Kalkulation,
  type Produktion,
} from './index';

// T106: Menge „einmal je Auftrag“ und Variante beim Druck am Artikel-Teil

const HEUTE = '2026-11-09';
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Objektdruck im Weg; am Inkjet Varianten „Tüte“ (2.500/h) und „Tasche“ (600/h). */
function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const obj = p.arbeitsschritte.find((s) => s.id === 'S0002');
  if (!obj) throw new Error('S0002');
  obj.imWeg = { art: 'druck' };
  const ink = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-INK4C');
  const s = ink?.schritte.find((x) => x.schrittId === 'S0002');
  if (!s) throw new Error('AP-INK4C');
  s.profile = [
    { name: 'Tüte', menge: 2500, dauerMs: 3_600_000 },
    { name: 'Tasche', menge: 600, dauerMs: 3_600_000 },
  ];
  return p;
}

function tuete(variante?: string): Artikel {
  const t: ArtikelTeil = {
    id: 'T1',
    name: 'Tüte',
    jeProdukt: 1,
    woraus: { zustand: 'fest', wert: { art: 'beschrieben', text: 'Bäckertüte' } },
    druck: { zustand: 'fest', wert: { vorne: { farbe: 'schwarz' } } },
    wer: { zustand: 'fest', wert: 'haus' },
    wareGestellt: true,
    ...(variante === undefined ? {} : { variante }),
  };
  const a: Artikel = {
    id: 'A-0101',
    titel: 'Bäckertüte',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: mm(150, 340) },
    teile: [t],
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

function anlegen(a: Artikel) {
  const p = produktion();
  const v = kalkulationAusArtikel(a, p, BEISPIEL_LAGER, { auflagen: [1000], erstelltAm: HEUTE });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0] as Kalkulation;
  return { v, k, p };
}

describe('T106 Menge einmal je Auftrag', () => {
  it('Schema nimmt { art: auftrag }; je Auflage 1', () => {
    expect(mengeAusQuelle({ art: 'auftrag' }, [100, 500, 1000], 0, 'Auftrag')).toBe(1);
    expect(mengeAusQuelle({ art: 'auftrag' }, [100, 500, 1000], 2, 'Auftrag')).toBe(1);
    expect(mengeAusQuelle({ art: 'auftrag' }, [100], 3, 'Auftrag')).toBeNull();
  });

  it('Datencheck je Auftrag: in jeder Auflage 1 Auftrag, gleiche Kosten', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Flyer',
      auflagen: [100, 5000],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-VORSTUFE',
          schrittId: 'S0004',
          menge: { art: 'auftrag' },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0] as Kalkulation;
    expect(pruefeKalkulationen({ version: 1, kalkulationen: [k] }).ok).toBe(true);
    const e = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, HEUTE);
    expect(e.auflagen.map((a) => a.zeilen[0]?.menge)).toEqual([1, 1]);
    expect(e.auflagen[0]?.zeilen[0]?.kostenVoll).toEqual(e.auflagen[1]?.zeilen[0]?.kostenVoll);
  });
});

describe('T106 Variante beim Druck', () => {
  it('Variante „tüte“ (Groß/Klein egal) kommt als Variante an die Druckzeile', () => {
    const { v, k } = anlegen(tuete('tüte'));
    const druck = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0002');
    expect(druck?.art === 'arbeitsgang' ? druck.profil : undefined).toBe('Tüte');
    expect(v.hinweise.some((h) => h.includes('Variante'))).toBe(false);
  });

  it('rechnet mit der Leistung der Variante (Tasche 600/h langsamer als Tüte 2.500/h)', () => {
    const kosten = (variante: string) => {
      const { k, p } = anlegen(tuete(variante));
      const e = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE);
      return e.auflagen[0]?.zeilen.find((z) => z.zeileId === 'Z1')?.kostenVoll?.zehntelcent ?? 0;
    };
    expect(kosten('Tasche')).toBeGreaterThan(kosten('Tüte'));
  });

  it('Variante gibt es an der Maschine nicht: Hinweis, keine Variante', () => {
    const { v, k } = anlegen(tuete('Kuvert'));
    const druck = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0002');
    expect(druck?.art === 'arbeitsgang' ? druck.profil : 'x').toBeUndefined();
    expect(v.hinweise).toContain(
      'Objektdruck: Variante „Kuvert“ gibt es an Inkjet Fertigware nicht',
    );
  });

  it('Kalkulation → Artikel: Variante zurück ans Teil', () => {
    const { k, p } = anlegen(tuete('Tüte'));
    const r = artikelAusKalkulation({ ...k, artikelId: 'A-9999' }, p, BEISPIEL_LAGER, {
      version: 1,
      artikel: [],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.artikel.teile[0]?.variante).toBe('Tüte');
  });
});
