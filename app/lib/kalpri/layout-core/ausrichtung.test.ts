import { describe, expect, it } from 'vitest';
import { berechneRaster, besteAusnutzung, type Raster, type RasterEingabe } from './index';

const mm = (x: number) => Math.round(x * 1000);

/** SRA3, rundum 5 mm, Visitenkarte 85 × 55, Beschnitt 2, Steg 4 → 3 × 7 Nutzen, Block 267 × 413 mm. */
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

describe('Ausrichtung an Kanten mit festem Abstand', () => {
  it('ohne Angabe oder mitte/mitte: wie bisher zentriert', () => {
    const mitte = raster(eingabe({ ausrichtung: { x: { art: 'mitte' }, y: { art: 'mitte' } } }));
    expect(mitte.block).toEqual(raster(eingabe()).block);
  });

  it('links 10 mm, vorne 15 mm: Abstand Bogenkante bis Endformat des ersten Nutzens', () => {
    const r = raster(
      eingabe({
        ausrichtung: {
          x: { art: 'links', abstandUm: mm(10) },
          y: { art: 'vorne', abstandUm: mm(15) },
        },
      }),
    );
    expect(r.block).toEqual({ xUm: 8000, yUm: 13000, breiteUm: 267000, hoeheUm: 413000 });
    expect(r.slots[0]?.endformat).toMatchObject({ xUm: 10000, yUm: 15000 });
    expect(r.nutzen).toBe(21);
    expect(r.warnungen).toEqual([]);
  });

  it('rechts 10 mm, hinten 15 mm: Abstand Bogenkante bis Endformat des letzten Nutzens', () => {
    const r = raster(
      eingabe({
        ausrichtung: {
          x: { art: 'rechts', abstandUm: mm(10) },
          y: { art: 'hinten', abstandUm: mm(15) },
        },
      }),
    );
    const letzter = r.slots[20]?.endformat;
    if (!letzter) throw new Error('S21 fehlt');
    expect(letzter.xUm + letzter.breiteUm).toBe(310000);
    expect(letzter.yUm + letzter.hoeheUm).toBe(435000);
  });

  it('gemischt: x zentriert, y vorne', () => {
    const r = raster(
      eingabe({ ausrichtung: { x: { art: 'mitte' }, y: { art: 'vorne', abstandUm: mm(20) } } }),
    );
    expect(r.block.xUm).toBe(26500);
    expect(r.slots[0]?.endformat.yUm).toBe(20000);
  });

  it('Warnung im nicht bedruckbaren Bereich, Fehler über den Bogen hinaus', () => {
    const nah = raster(
      eingabe({ ausrichtung: { x: { art: 'links', abstandUm: mm(3) }, y: { art: 'mitte' } } }),
    );
    expect(nah.warnungen).toEqual(['Nutzen ragen in den nicht bedruckbaren Bereich']);
    expect(
      fehler(
        eingabe({ ausrichtung: { x: { art: 'links', abstandUm: mm(1) }, y: { art: 'mitte' } } }),
      ),
    ).toEqual([{ pfad: 'ausrichtung', meldung: 'Nutzen ragen über den Bogen hinaus' }]);
    expect(
      fehler(
        eingabe({ ausrichtung: { x: { art: 'mitte' }, y: { art: 'hinten', abstandUm: mm(1) } } }),
      ),
    ).toEqual([{ pfad: 'ausrichtung', meldung: 'Nutzen ragen über den Bogen hinaus' }]);
  });

  it('prüft die Eingabe der Ausrichtung', () => {
    expect(
      fehler(
        eingabe({
          ausrichtung: {
            x: { art: 'oben' },
            y: { art: 'mitte' },
          } as unknown as RasterEingabe['ausrichtung'],
        }),
      ),
    ).toContainEqual({
      pfad: 'ausrichtung.x.art',
      meldung: 'Ausrichtung muss mitte, links oder rechts sein',
    });
    expect(
      fehler(eingabe({ ausrichtung: { x: { art: 'mitte' }, y: { art: 'vorne', abstandUm: -1 } } })),
    ).toContainEqual({
      pfad: 'ausrichtung.y.abstandUm',
      meldung: 'darf nicht negativ sein',
    });
  });

  it('besteAusnutzung übernimmt die Ausrichtung', () => {
    const r = besteAusnutzung(
      eingabe({
        ausrichtung: {
          x: { art: 'links', abstandUm: mm(10) },
          y: { art: 'vorne', abstandUm: mm(15) },
        },
      }),
      { bogenDrehbar: false },
    );
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    expect(r.wert.slots[0]?.endformat).toMatchObject({ xUm: 10000, yUm: 15000 });
  });
});
