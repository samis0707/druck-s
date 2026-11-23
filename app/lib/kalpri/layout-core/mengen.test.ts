import { describe, expect, it } from 'vitest';
import { berechneMengen, type MengenEingabe, type Mengengeruest } from './index';

function eingabe(teil: Partial<MengenEingabe> = {}): MengenEingabe {
  return {
    nutzenJeBogen: 21,
    auflage: 1000,
    zuschuss: { bogen: 10, prozent: 5 },
    farbigkeit: { vorne: 4, hinten: 4 },
    ...teil,
  };
}

function mengen(e: unknown): Mengengeruest {
  const r = berechneMengen(e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehler(e: unknown) {
  const r = berechneMengen(e);
  return r.ok ? [] : r.fehler;
}

describe('berechneMengen', () => {
  it('Visitenkarten 21 Nutzen, 1000 Stück, 4/4: ganze Bogen, leere Nutzen, Zuschuss in Bogen', () => {
    expect(mengen(eingabe())).toEqual({
      nutzenJeBogen: 21,
      auflage: { wert: 1000, einheit: 'Stueck' },
      bogenNetto: { wert: 48, einheit: 'Bogen' },
      leereNutzen: 8,
      zuschuss: { wert: 13, einheit: 'Bogen' },
      bogenGesamt: { wert: 61, einheit: 'Bogen' },
      bogenseiten: [
        { seite: 'vorne', farben: 4, anzahl: { wert: 61, einheit: 'Bogenseite' } },
        { seite: 'hinten', farben: 4, anzahl: { wert: 61, einheit: 'Bogenseite' } },
      ],
      bogenseitenGesamt: { wert: 122, einheit: 'Bogenseite' },
      farbigkeit: '4/4',
    });
  });

  it('einseitig 4/0 und 0/1 zählen nur die bedruckte Seite', () => {
    const m = mengen(eingabe({ farbigkeit: { vorne: 4, hinten: 0 } }));
    expect(m.bogenseiten).toEqual([
      { seite: 'vorne', farben: 4, anzahl: { wert: 61, einheit: 'Bogenseite' } },
    ]);
    expect(m.bogenseitenGesamt.wert).toBe(61);
    expect(
      mengen(eingabe({ farbigkeit: { vorne: 0, hinten: 1 } })).bogenseiten.map((s) => s.seite),
    ).toEqual(['hinten']);
  });

  it('geht die Auflage auf, gibt es keine leeren Nutzen', () => {
    const m = mengen(eingabe({ auflage: 1050, zuschuss: { bogen: 0, prozent: 0 } }));
    expect([m.bogenNetto.wert, m.leereNutzen, m.zuschuss.wert, m.bogenGesamt.wert]).toEqual([
      50, 0, 0, 50,
    ]);
  });

  it('Prozent-Zuschuss wird ganzzahlig aufgerundet, ohne Gleitkommafehler', () => {
    expect(
      mengen(eingabe({ nutzenJeBogen: 1, auflage: 100, zuschuss: { bogen: 0, prozent: 7 } }))
        .zuschuss.wert,
    ).toBe(7);
    expect(
      mengen(eingabe({ nutzenJeBogen: 1, auflage: 100, zuschuss: { bogen: 0, prozent: 7.01 } }))
        .zuschuss.wert,
    ).toBe(8);
    expect(
      mengen(eingabe({ nutzenJeBogen: 1, auflage: 10, zuschuss: { bogen: 2, prozent: 2.5 } }))
        .zuschuss.wert,
    ).toBe(3);
  });

  it('prüft die Eingabe', () => {
    expect(fehler(eingabe({ auflage: 0 }))).toContainEqual({
      pfad: 'auflage',
      meldung: 'muss größer als 0 sein',
    });
    expect(fehler(eingabe({ nutzenJeBogen: 2.5 }))).toContainEqual({
      pfad: 'nutzenJeBogen',
      meldung: 'muss eine ganze Zahl sein',
    });
    expect(fehler(eingabe({ zuschuss: { bogen: 0, prozent: 2.555 } }))).toContainEqual({
      pfad: 'zuschuss.prozent',
      meldung: 'höchstens 2 Nachkommastellen',
    });
    expect(fehler(eingabe({ zuschuss: { bogen: 0, prozent: 101 } }))).toContainEqual({
      pfad: 'zuschuss.prozent',
      meldung: 'höchstens 100',
    });
    expect(fehler(eingabe({ farbigkeit: { vorne: 9, hinten: 0 } }))).toContainEqual({
      pfad: 'farbigkeit.vorne',
      meldung: 'höchstens 8',
    });
    expect(fehler(eingabe({ farbigkeit: { vorne: 0, hinten: 0 } }))).toEqual([
      { pfad: 'farbigkeit', meldung: 'Mindestens eine Seite muss bedruckt sein' },
    ]);
  });
});
