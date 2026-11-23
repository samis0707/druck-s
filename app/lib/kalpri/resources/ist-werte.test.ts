import { describe, expect, it } from 'vitest';
import {
  istAbweichung,
  istAnhaengen,
  istFuer,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeKalkulationen,
  type Kalkulation,
  type IstWert,
} from './index';

function kalkulation(): Kalkulation {
  const r = kalkulationHinzufuegen(leereKalkulationen(), {
    titel: 'Karte',
    einheit: 'Stueck',
    auflagen: [500, 1000],
    erstelltAm: '2026-10-27',
    zeilen: [
      {
        id: 'Z1',
        art: 'material',
        materialId: 'L4',
        menge: { art: 'auflage' },
      },
      {
        id: 'Z2',
        art: 'arbeitsgang',
        platzId: 'AP-SCHN',
        schrittId: 'S0006',
        menge: { art: 'auflage', faktor: 4 },
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('Kalkulation fehlt');
  return k;
}

const erster: IstWert = {
  zeileId: 'Z2',
  auflage: 1000,
  menge: 900,
  zeitMs: 60_000,
  erfasstAm: '2026-10-28',
};

describe('Ist-Werte anhängen', () => {
  it('hängt an, ohne die Kalkulation zu verändern', () => {
    const k = kalkulation();
    const r = istAnhaengen(k, [erster]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(k.ist).toBeUndefined();
    expect(r.wert.ist).toEqual([erster]);
    expect(pruefeKalkulationen({ version: 1, kalkulationen: [r.wert] }).ok).toBe(true);
  });

  it('der zuletzt angehängte Wert gilt, je Auflage getrennt', () => {
    const k = kalkulation();
    const a = istAnhaengen(k, [erster]);
    if (!a.ok) throw new Error('erster');
    const b = istAnhaengen(a.wert, [{ ...erster, menge: 850, erfasstAm: '2026-10-29' }]);
    if (!b.ok) throw new Error('zweiter');
    const c = istAnhaengen(b.wert, [
      { zeileId: 'Z2', auflage: 500, menge: 450, erfasstAm: '2026-10-29' },
    ]);
    if (!c.ok) throw new Error('dritte');
    expect(c.wert.ist).toHaveLength(3);
    expect(istFuer(c.wert, 'Z2', 1000)?.menge).toBe(850);
    expect(istFuer(c.wert, 'Z2', 500)?.menge).toBe(450);
    expect(istFuer(c.wert, 'Z1', 500)).toBeNull();
  });

  it('unbekannte Zeile und Auflage werden gemeldet', () => {
    const k = kalkulation();
    const zeile = istAnhaengen(k, [{ ...erster, zeileId: 'Z9' }]);
    expect(zeile.ok ? [] : zeile.fehler.map((f) => `${f.pfad} ${f.meldung}`)).toEqual([
      'ist.0.zeileId Zeile Z9 nicht vorhanden',
    ]);
    const auflage = istAnhaengen(k, [{ ...erster, auflage: 250 }]);
    expect(auflage.ok ? [] : auflage.fehler.map((f) => `${f.pfad} ${f.meldung}`)).toEqual([
      'ist.0.auflage Auflage 250 ist nicht in der Kalkulation',
    ]);
  });

  it('meldet fehlende Pflichtfelder', () => {
    const k = kalkulation();
    const r = istAnhaengen(k, [{ ...erster, erfasstAm: '2026-02-30' }]);
    expect(r.ok ? [] : r.fehler.map((f) => f.pfad)).toEqual(['ist.0.erfasstAm']);
  });
});

describe('Abweichung zum Soll', () => {
  it('Prozent mit einer Nachkommastelle', () => {
    expect(istAbweichung(1000, 900)).toBe(-10);
    expect(istAbweichung(1000, 1200)).toBe(20);
    expect(istAbweichung(1000, 1045)).toBe(4.5);
    expect(istAbweichung(null, 900)).toBeNull();
    expect(istAbweichung(1000, null)).toBeNull();
    expect(istAbweichung(0, 900)).toBeNull();
  });
});
