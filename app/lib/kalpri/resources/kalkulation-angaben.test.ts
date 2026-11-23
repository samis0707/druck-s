import { describe, expect, it } from 'vitest';
import { kalkulationHinzufuegen, leereKalkulationen } from './index';

const zeile = {
  id: 'Z1',
  art: 'arbeitsgang',
  platzId: 'AP-KLEIN',
  schrittId: 'S0016',
  menge: { art: 'papierweg', teilId: 'T1', wert: 'stapel', faktor: 4 },
  angaben: ['4-fach', 'Ø 6 mm', 'Abstand 8 mm'],
};

function eingabe(z: unknown) {
  return {
    titel: 'Karte',
    einheit: 'Stueck',
    auflagen: [1000],
    erstelltAm: '2026-10-27',
    teile: [
      { id: 'T1', name: 'Karte', endformat: { breiteUm: 85_000, hoeheUm: 55_000 }, jeProdukt: 1 },
    ],
    zeilen: [z],
  };
}

describe('Angaben an einer Zeile', () => {
  it('werden gespeichert', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), eingabe(zeile));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wert.kalkulationen[0]?.zeilen[0]).toMatchObject({ angaben: zeile.angaben });
  });

  it('eine leere Angabe wird abgelehnt', () => {
    const r = kalkulationHinzufuegen(
      leereKalkulationen(),
      eingabe({ ...zeile, angaben: ['4-fach', '  '] }),
    );
    expect(r.ok ? [] : r.fehler.map((f) => `${f.pfad} ${f.meldung}`)).toEqual([
      'zeilen.0.angaben.1 Pflichtfeld',
    ]);
  });
});
