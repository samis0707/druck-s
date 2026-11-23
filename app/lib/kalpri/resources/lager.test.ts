import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  bestandSetzen,
  lagerAlsJson,
  lagerAusJson,
  leeresLager,
  materialAendern,
  materialEntfernen,
  materialHinzufuegen,
  type Lager,
} from './index';

const bogen = {
  id: 'X1',
  form: 'Bogen',
  sorte: 'Test',
  grammatur: 135,
  breiteUm: 320000,
  hoeheUm: 450000,
  laufrichtung: 'SB',
} as const;

function tiefFrieren<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(tiefFrieren);
    Object.freeze(o);
  }
  return o;
}

function wert(e: { ok: boolean; wert?: Lager }): Lager {
  if (!e.ok || !e.wert) throw new Error('Ergebnis nicht ok');
  return e.wert;
}

describe('Material verwalten', () => {
  it('fügt hinzu und lehnt doppelte ID ab', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), bogen));
    expect(l1.materialien).toHaveLength(1);
    const e = materialHinzufuegen(l1, bogen);
    expect(e.ok).toBe(false);
    expect(e.ok ? [] : e.fehler).toContainEqual({ pfad: 'id', meldung: 'ID doppelt: X1' });
  });

  it('meldet Prüffehler des Materials', () => {
    const e = materialHinzufuegen(leeresLager(), { ...bogen, grammatur: 0 });
    expect(e.ok ? [] : e.fehler).toContainEqual({
      pfad: 'grammatur',
      meldung: 'muss größer als 0 sein',
    });
  });

  it('ändert vorhandenes Material', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), bogen));
    const l2 = wert(materialAendern(l1, { ...bogen, grammatur: 170 }));
    expect(l2.materialien[0]?.grammatur).toBe(170);
    const e = materialAendern(l1, { ...bogen, id: 'X2' });
    expect(e.ok ? [] : e.fehler).toContainEqual({
      pfad: 'id',
      meldung: 'Material X2 nicht gefunden',
    });
  });

  it('entfernt nur Material ohne Bestand', () => {
    const e = materialEntfernen(BEISPIEL_LAGER, 'L1');
    expect(e.ok ? [] : e.fehler).toContainEqual({
      pfad: 'id',
      meldung: 'Material L1 hat noch Bestand',
    });

    const l1 = wert(materialHinzufuegen(leeresLager(), bogen));
    const l2 = wert(
      bestandSetzen(l1, {
        materialId: 'X1',
        lagerort: 'A',
        menge: 0,
        einheit: 'Bogen',
        reserviert: 0,
      }),
    );
    const l3 = wert(materialEntfernen(l2, 'X1'));
    expect(l3.materialien).toHaveLength(0);
    expect(l3.bestaende).toHaveLength(0);
  });
});

describe('Bestand setzen', () => {
  it('ersetzt gleiche Zeile und hängt neue an', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), bogen));
    const l2 = wert(
      bestandSetzen(l1, {
        materialId: 'X1',
        lagerort: 'A',
        menge: 10,
        einheit: 'Bogen',
        reserviert: 0,
      }),
    );
    const l3 = wert(
      bestandSetzen(l2, {
        materialId: 'X1',
        lagerort: 'A',
        menge: 20,
        einheit: 'Bogen',
        reserviert: 5,
      }),
    );
    const l4 = wert(
      bestandSetzen(l3, {
        materialId: 'X1',
        lagerort: 'B',
        menge: 1,
        einheit: 'Bogen',
        reserviert: 0,
      }),
    );
    expect(l3.bestaende).toEqual([
      { materialId: 'X1', lagerort: 'A', menge: 20, einheit: 'Bogen', reserviert: 5 },
    ]);
    expect(l4.bestaende).toHaveLength(2);
  });

  it('lehnt unpassenden Bestand ab', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), bogen));
    const e = bestandSetzen(l1, {
      materialId: 'X1',
      lagerort: 'A',
      menge: 1,
      einheit: 'Bogen',
      reserviert: 2,
    });
    expect(e.ok).toBe(false);
  });
});

describe('Unveränderlichkeit', () => {
  it('verändert die Eingabe nie', () => {
    const eingang = tiefFrieren(JSON.parse(JSON.stringify(BEISPIEL_LAGER)) as Lager);
    const vorher = JSON.stringify(eingang);
    materialHinzufuegen(eingang, bogen);
    materialAendern(eingang, { ...eingang.materialien[0], sorte: 'Neu' });
    materialEntfernen(eingang, 'L9');
    bestandSetzen(eingang, {
      materialId: 'L1',
      lagerort: 'Halle B',
      menge: 1,
      einheit: 'Bogen',
      reserviert: 0,
    });
    expect(JSON.stringify(eingang)).toBe(vorher);
  });
});

describe('JSON', () => {
  it('sichert und lädt verlustfrei', () => {
    const text = lagerAlsJson(BEISPIEL_LAGER);
    const e = lagerAusJson(text);
    expect(e.ok).toBe(true);
    expect(lagerAlsJson(wert(e))).toBe(text);
  });

  it('sortiert stabil', () => {
    const umgedreht: Lager = {
      ...BEISPIEL_LAGER,
      materialien: [...BEISPIEL_LAGER.materialien].reverse(),
    };
    expect(lagerAlsJson(umgedreht)).toBe(lagerAlsJson(BEISPIEL_LAGER));
  });

  it('meldet kaputtes JSON und ungültige Inhalte', () => {
    const e1 = lagerAusJson('{ kaputt');
    expect(e1.ok ? [] : e1.fehler).toEqual([{ pfad: '', meldung: 'Kein gültiges JSON' }]);
    const e2 = lagerAusJson(
      JSON.stringify({ version: 1, materialien: [{ ...bogen, grammatur: -5 }], bestaende: [] }),
    );
    expect(e2.ok ? [] : e2.fehler).toContainEqual({
      pfad: 'materialien.0.grammatur',
      meldung: 'muss größer als 0 sein',
    });
  });
});
