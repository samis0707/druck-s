import { describe, expect, it } from 'vitest';
import { berechneRaster, besteAusnutzung, type Raster, type RasterEingabe } from './index';

const mm = (x: number) => Math.round(x * 1000);

/** SRA3 320 × 450 mm, rundum 5 mm nicht bedruckbar. */
function eingabe(teil: Partial<RasterEingabe> = {}): RasterEingabe {
  return {
    bogen: { breiteUm: mm(320), hoeheUm: mm(450) },
    raender: { greiferUm: mm(5), hintenUm: mm(5), linksUm: mm(5), rechtsUm: mm(5) },
    endformat: { breiteUm: mm(85), hoeheUm: mm(55) },
    beschnittUm: mm(2),
    steg: { xUm: mm(4), yUm: mm(4) },
    drehungErlaubt: true,
    ...teil,
  };
}

function raster(e: unknown): Raster {
  const r = berechneRaster(e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehler(e: unknown) {
  const r = berechneRaster(e);
  return r.ok ? [] : r.fehler;
}

describe('berechneRaster – automatisch', () => {
  it('Visitenkarte 85 × 55 auf SRA3: 3 × 7 = 21 Nutzen, zentriert im druckbaren Bereich', () => {
    const r = raster(eingabe());
    expect([r.spalten, r.zeilen, r.nutzen, r.gedreht]).toEqual([3, 7, 21, false]);
    expect(r.bogen).toEqual({ breiteUm: 320000, hoeheUm: 450000 });
    expect(r.druckbereich).toEqual({ xUm: 5000, yUm: 5000, breiteUm: 310000, hoeheUm: 440000 });
    expect(r.block).toEqual({ xUm: 26500, yUm: 18500, breiteUm: 267000, hoeheUm: 413000 });
    expect(r.ausnutzung).toBe(0.6818);
    expect(r.warnungen).toEqual([]);
  });

  it('Slots: Zeile 1 an der Greiferkante, von links nach rechts nummeriert', () => {
    const r = raster(eingabe());
    expect(r.slots).toHaveLength(21);
    expect(r.slots[0]).toEqual({
      id: 'S1',
      spalte: 1,
      zeile: 1,
      drehung: 0,
      endformat: { xUm: 28500, yUm: 20500, breiteUm: 85000, hoeheUm: 55000 },
      beschnitt: { xUm: 26500, yUm: 18500, breiteUm: 89000, hoeheUm: 59000 },
    });
    expect(r.slots[1]?.endformat.xUm).toBe(28500 + 89000);
    expect(r.slots[3]).toMatchObject({ id: 'S4', spalte: 1, zeile: 2 });
    expect(r.slots[20]).toMatchObject({
      id: 'S21',
      spalte: 3,
      zeile: 7,
      endformat: { xUm: 206500, yUm: 374500 },
    });
  });

  it('dreht, wenn es mehr Nutzen bringt (A6 auf SRA3: 6 statt 4)', () => {
    const a6 = {
      endformat: { breiteUm: mm(105), hoeheUm: mm(148) },
      beschnittUm: mm(3),
      steg: { xUm: mm(6), yUm: mm(6) },
    };
    const r = raster(eingabe(a6));
    expect([r.spalten, r.zeilen, r.nutzen, r.gedreht]).toEqual([2, 3, 6, true]);
    expect(r.slots[0]).toMatchObject({
      drehung: 90,
      endformat: { breiteUm: 148000, hoeheUm: 105000 },
    });
    const ohne = raster(eingabe({ ...a6, drehungErlaubt: false }));
    expect([ohne.nutzen, ohne.gedreht]).toEqual([4, false]);
  });

  it('bei Gleichstand bleibt das Endformat ungedreht', () => {
    const r = raster(
      eingabe({
        endformat: { breiteUm: mm(148), hoeheUm: mm(210) },
        beschnittUm: mm(3),
        steg: { xUm: mm(6), yUm: mm(6) },
      }),
    );
    expect([r.nutzen, r.gedreht]).toEqual([4, false]);
  });
});

describe('berechneRaster – festes Raster', () => {
  const a6 = {
    endformat: { breiteUm: mm(105), hoeheUm: mm(148) },
    beschnittUm: mm(3),
    steg: { xUm: mm(6), yUm: mm(6) },
  };

  it('nimmt das feste Raster, ungedreht zuerst', () => {
    const r = raster(eingabe({ ...a6, raster: { spalten: 2, zeilen: 2 } }));
    expect([r.spalten, r.zeilen, r.nutzen, r.gedreht]).toEqual([2, 2, 4, false]);
    const g = raster(eingabe({ ...a6, raster: { spalten: 2, zeilen: 3 } }));
    expect([g.nutzen, g.gedreht]).toEqual([6, true]);
  });

  it('meldet ein Raster, das nicht passt', () => {
    expect(fehler(eingabe({ ...a6, raster: { spalten: 3, zeilen: 3 } }))).toEqual([
      { pfad: 'raster', meldung: 'Raster 3 × 3 passt nicht in den druckbaren Bereich' },
    ]);
  });
});

describe('berechneRaster – Fehler und Warnungen', () => {
  it('Endformat zu groß, Ränder zu groß', () => {
    expect(fehler(eingabe({ endformat: { breiteUm: mm(500), hoeheUm: mm(500) } }))).toEqual([
      { pfad: '', meldung: 'Endformat passt nicht in den druckbaren Bereich' },
    ]);
    expect(
      fehler(
        eingabe({ raender: { greiferUm: mm(300), hintenUm: mm(200), linksUm: 0, rechtsUm: 0 } }),
      ),
    ).toEqual([{ pfad: 'raender', meldung: 'Ränder sind größer als der Bogen' }]);
  });

  it('prüft die Eingabe mit Pfad', () => {
    expect(fehler(eingabe({ beschnittUm: -1 }))).toContainEqual({
      pfad: 'beschnittUm',
      meldung: 'darf nicht negativ sein',
    });
    expect(fehler(eingabe({ endformat: { breiteUm: 85000.5, hoeheUm: 55000 } }))).toContainEqual({
      pfad: 'endformat.breiteUm',
      meldung: 'muss eine ganze Zahl sein',
    });
    expect(fehler(eingabe({ endformat: { breiteUm: 0, hoeheUm: 55000 } }))).toContainEqual({
      pfad: 'endformat.breiteUm',
      meldung: 'muss größer als 0 sein',
    });
  });

  it('warnt, wenn der Steg kleiner als der doppelte Beschnitt ist', () => {
    const w = 'Steg kleiner als doppelter Beschnitt: Beschnitt benachbarter Nutzen überlappt';
    expect(raster(eingabe({ steg: { xUm: 0, yUm: 0 } })).warnungen).toEqual([w]);
    expect(raster(eingabe({ steg: { xUm: mm(4), yUm: mm(3) } })).warnungen).toEqual([w]);
    expect(raster(eingabe({ steg: { xUm: 0, yUm: 0 }, beschnittUm: 0 })).warnungen).toEqual([]);
    expect(
      raster(
        eingabe({ endformat: { breiteUm: mm(300), hoeheUm: mm(400) }, steg: { xUm: 0, yUm: 0 } }),
      ).warnungen,
    ).toEqual([]);
  });
});

describe('besteAusnutzung', () => {
  // Greiferrand 15 mm, sonst 5 mm; Endformat 100 × 150 ohne Beschnitt und Steg, Endformat nicht drehbar
  const fall = eingabe({
    raender: { greiferUm: mm(15), hintenUm: mm(5), linksUm: mm(5), rechtsUm: mm(5) },
    endformat: { breiteUm: mm(100), hoeheUm: mm(150) },
    beschnittUm: 0,
    steg: { xUm: 0, yUm: 0 },
    drehungErlaubt: false,
  });

  it('dreht den Bogen, wenn das mehr Nutzen bringt', () => {
    const r = besteAusnutzung(fall, { bogenDrehbar: true });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect([r.wert.bogenGedreht, r.wert.nutzen, r.wert.spalten, r.wert.zeilen]).toEqual([
      true,
      8,
      4,
      2,
    ]);
    expect(r.wert.bogen).toEqual({ breiteUm: 450000, hoeheUm: 320000 });
    expect(r.wert.druckbereich).toEqual({
      xUm: 5000,
      yUm: 15000,
      breiteUm: 440000,
      hoeheUm: 300000,
    });
  });

  it('ohne Bogendrehung und mit festem Raster in der Eingabe: rechnet automatisch in der gegebenen Lage', () => {
    const r = besteAusnutzung(
      { ...fall, raster: { spalten: 1, zeilen: 1 } },
      { bogenDrehbar: false },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect([r.wert.bogenGedreht, r.wert.nutzen]).toEqual([false, 6]);
    const zuGross = besteAusnutzung(
      eingabe({ endformat: { breiteUm: mm(500), hoeheUm: mm(500) } }),
      { bogenDrehbar: true },
    );
    expect(zuGross.ok ? [] : zuGross.fehler).toEqual([
      { pfad: '', meldung: 'Endformat passt nicht in den druckbaren Bereich' },
    ]);
  });
});
