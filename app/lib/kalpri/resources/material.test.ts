import { describe, expect, it } from 'vitest';
import { BEISPIEL_LAGER, pruefeLager, pruefeMaterial, type Lager } from './index';

const bogen = {
  id: 'X1',
  form: 'Bogen',
  sorte: 'Test',
  grammatur: 135,
  breiteUm: 320000,
  hoeheUm: 450000,
  laufrichtung: 'SB',
};

function mitLager(teil: Partial<Lager>): unknown {
  return { version: 1, materialien: [bogen], bestaende: [], ...teil };
}

describe('pruefeMaterial', () => {
  it('akzeptiert Bogen, Rolle und Stück', () => {
    expect(pruefeMaterial(bogen).ok).toBe(true);
    expect(
      pruefeMaterial({
        id: 'R1',
        form: 'Rolle',
        sorte: 'Folie',
        grammatur: 80,
        breiteUm: 330000,
        laengeM: 500,
      }).ok,
    ).toBe(true);
    expect(
      pruefeMaterial({
        id: 'S1',
        form: 'Stueck',
        sorte: 'Kuvert',
        breiteUm: 220000,
        hoeheUm: 110000,
      }).ok,
    ).toBe(true);
  });

  it('meldet Fehler mit Pfad und deutscher Meldung', () => {
    const fall = (eingabe: unknown) => {
      const e = pruefeMaterial(eingabe);
      return e.ok ? [] : e.fehler;
    };
    expect(fall({ ...bogen, sorte: '  ' })).toContainEqual({
      pfad: 'sorte',
      meldung: 'Pflichtfeld',
    });
    expect(fall({ ...bogen, sorte: undefined })).toContainEqual({
      pfad: 'sorte',
      meldung: 'Pflichtfeld',
    });
    expect(fall({ ...bogen, grammatur: 0 })).toContainEqual({
      pfad: 'grammatur',
      meldung: 'muss größer als 0 sein',
    });
    expect(fall({ ...bogen, grammatur: 1.5 })).toContainEqual({
      pfad: 'grammatur',
      meldung: 'muss eine ganze Zahl sein',
    });
    expect(fall({ ...bogen, grammatur: 'abc' })).toContainEqual({
      pfad: 'grammatur',
      meldung: 'muss eine Zahl sein',
    });
    expect(fall({ ...bogen, grammatur: 2001 })).toContainEqual({
      pfad: 'grammatur',
      meldung: 'höchstens 2000',
    });
    expect(fall({ ...bogen, id: 'a b' })).toContainEqual({
      pfad: 'id',
      meldung: 'nur Buchstaben, Ziffern, _ und -',
    });
    expect(fall({ ...bogen, laufrichtung: 'XY' })).toContainEqual({
      pfad: 'laufrichtung',
      meldung: 'Laufrichtung muss SB oder BB sein',
    });
    expect(fall({ ...bogen, form: 'Platte' })).toContainEqual({
      pfad: 'form',
      meldung: 'Form muss Bogen, Rolle oder Stueck sein',
    });
    expect(fall({ ...bogen, breiteUm: 320.5 })).toContainEqual({
      pfad: 'breiteUm',
      meldung: 'muss eine ganze Zahl sein',
    });
  });
});

describe('pruefeLager', () => {
  it('Beispiel-Lager ist gültig', () => {
    const e = pruefeLager(BEISPIEL_LAGER);
    expect(e.ok).toBe(true);
    expect(BEISPIEL_LAGER.materialien).toHaveLength(9);
  });

  it('erkennt doppelte IDs', () => {
    const e = pruefeLager(mitLager({ materialien: [bogen, bogen] as Lager['materialien'] }));
    expect(e.ok ? [] : e.fehler).toContainEqual({
      pfad: 'materialien.1.id',
      meldung: 'ID doppelt: X1',
    });
  });

  it('erkennt unbekanntes Material und falsche Einheit', () => {
    const e1 = pruefeLager(
      mitLager({
        bestaende: [
          { materialId: 'L99', lagerort: 'A', menge: 1, einheit: 'Bogen', reserviert: 0 },
        ],
      }),
    );
    expect(e1.ok ? [] : e1.fehler).toContainEqual({
      pfad: 'bestaende.0.materialId',
      meldung: 'Material L99 nicht gefunden',
    });

    const e2 = pruefeLager(
      mitLager({
        bestaende: [{ materialId: 'X1', lagerort: 'A', menge: 1, einheit: 'Rolle', reserviert: 0 }],
      }),
    );
    expect(e2.ok ? [] : e2.fehler).toContainEqual({
      pfad: 'bestaende.0.einheit',
      meldung: 'Einheit passt nicht zur Form: Bogen erwartet',
    });
  });

  it('prüft Menge und Reservierung', () => {
    const e1 = pruefeLager(
      mitLager({
        bestaende: [{ materialId: 'X1', lagerort: 'A', menge: 5, einheit: 'Bogen', reserviert: 6 }],
      }),
    );
    expect(e1.ok ? [] : e1.fehler).toContainEqual({
      pfad: 'bestaende.0.reserviert',
      meldung: 'Reserviert ist größer als Menge',
    });

    const e2 = pruefeLager(
      mitLager({
        bestaende: [
          { materialId: 'X1', lagerort: 'A', menge: -1, einheit: 'Bogen', reserviert: 0 },
        ],
      }),
    );
    expect(e2.ok ? [] : e2.fehler).toContainEqual({
      pfad: 'bestaende.0.menge',
      meldung: 'darf nicht negativ sein',
    });
  });
});
