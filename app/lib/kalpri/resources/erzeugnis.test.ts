import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  erzeugnisText,
  kalkulationAusProdukt,
  kalkulationHinzufuegen,
  leereKalkulationen,
  neuesProduktTeil,
  pruefeProduktion,
  reihenfolgeHinweise,
  schrittErzeugnis,
  zeilenMitEingeordneter,
  type Zeile,
  type Artikel,
  type Kalkulation,
} from './index';

// T134: „aus … wird …“ je Tätigkeit, Prüfung der Reihenfolge

const HEUTE = '2026-11-11';
const schritt = (id: string) => {
  const s = BEISPIEL_PRODUKTION.arbeitsschritte.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

function flyer(): Kalkulation {
  const produkt: Artikel = {
    id: 'PRODUKT',
    titel: 'Flyer',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } },
    teile: [
      {
        ...neuesProduktTeil(1),
        name: 'Flyer',
        woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L4' } },
        merkmale: [{ name: 'Bohren', wert: { zustand: 'fest', wert: '2-fach' } }],
      },
    ],
  };
  const v = kalkulationAusProdukt(produkt, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
    titel: 'Flyer',
    auflagen: [500],
    erstelltAm: HEUTE,
  });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('k');
  return k;
}

describe('Erzeugnisse (T134)', () => {
  it('1 abgeleitet: Druck, Schneiden, je Nutzen, je Produkt, je Auftrag', () => {
    expect(erzeugnisText(schrittErzeugnis(schritt('S0001')))).toBe(
      'aus Rohbogen oder Druckbogen wird Druckbogen',
    );
    expect(schrittErzeugnis(schritt('S0006'))).toMatchObject({ wird: 'nutzen', abgeleitet: true });
    expect(schrittErzeugnis(schritt('S0014')).aus).toEqual(['nutzen', 'falzbogen']);
    expect(schrittErzeugnis(schritt('S0017')).wird).toBe('exemplar');
    expect(erzeugnisText(schrittErzeugnis(schritt('S0004')))).toBe('passt überall');
  });

  it('2 eingetragen geht vor; das Schema prüft die Werte', () => {
    const s = { ...schritt('S0014'), aus: ['exemplar' as const], wird: 'exemplar' as const };
    expect(schrittErzeugnis(s)).toEqual({ aus: ['exemplar'], wird: 'exemplar', abgeleitet: false });
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Record<string, unknown>;
    (p['arbeitsschritte'] as Record<string, unknown>[])[0]!['wird'] = 'quatsch';
    expect(pruefeProduktion(p).ok).toBe(false);
  });

  it('3 vorgeschlagener Weg passt; Bohren vor dem Schneiden gibt einen Hinweis', () => {
    const k = flyer();
    expect(reihenfolgeHinweise(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER).size).toBe(0);
    const bohren = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0014');
    if (!bohren) throw new Error('Bohren');
    const vorn: Kalkulation = {
      ...k,
      zeilen: [bohren, ...k.zeilen.filter((z) => z.id !== bohren.id)],
    };
    const h = reihenfolgeHinweise(vorn, BEISPIEL_PRODUKTION, BEISPIEL_LAGER);
    expect(h.get(bohren.id)).toBe(
      'Reihenfolge: Bohren braucht Nutzen (Blatt) oder Falzbogen – an dieser Stelle ist es Rohbogen',
    );
    expect(h.size).toBe(1);
  });

  it('4 Ware vom Kunden: Stanzen und Bohren passen ohne Druck und Schnitt', () => {
    const k = flyer();
    const teile = (k.teile ?? []).map((t) => ({ ...t, wareGestellt: true }));
    const nur = k.zeilen.filter(
      (z) => z.art === 'arbeitsgang' && (z.schrittId === 'S0014' || z.menge.art !== 'papierweg'),
    );
    expect(reihenfolgeHinweise({ zeilen: nur, teile }, BEISPIEL_PRODUKTION).size).toBe(0);
  });

  it('5 neue Zeile ordnet sich ein: Rillen (je Druckbogen) kommt vor das Schneiden', () => {
    const k = flyer();
    const neu: Zeile = {
      id: 'Z90',
      art: 'arbeitsgang',
      platzId: 'AP-AEROCUT',
      schrittId: 'S0007',
      menge: { art: 'papierweg', teilId: k.teile?.[0]?.id ?? 'T1', wert: 'druckbogen' },
    };
    const zeilen = zeilenMitEingeordneter(k, neu, BEISPIEL_PRODUKTION, BEISPIEL_LAGER);
    const i = zeilen.findIndex((z) => z.id === 'Z90');
    const schnitt = zeilen.findIndex(
      (z) =>
        z.art === 'arbeitsgang' &&
        z.schrittId === 'S0006' &&
        z.menge.art === 'papierweg' &&
        z.menge.wert === 'endschnitt',
    );
    expect(i >= 0 && i < schnitt).toBe(true);
    expect(reihenfolgeHinweise({ ...k, zeilen }, BEISPIEL_PRODUKTION, BEISPIEL_LAGER).size).toBe(0);
    // Bohren (je Nutzen) bleibt am Ende
    const bohren: Zeile = { ...neu, id: 'Z91', schrittId: 'S0015', platzId: 'AP-KLEIN' };
    const mitB = zeilenMitEingeordneter(
      k,
      { ...bohren, menge: { art: 'papierweg', teilId: k.teile?.[0]?.id ?? 'T1', wert: 'nutzen' } },
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
    );
    expect(mitB[mitB.length - 1]?.id).toBe('Z91');
  });
});
