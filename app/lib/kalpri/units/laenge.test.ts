import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  formatMm,
  inMm,
  inPt,
  m,
  mal,
  minus,
  mm,
  plus,
  pt,
  rundeKaufmaennisch,
  um,
  vergleiche,
} from './index';

describe('rundeKaufmaennisch', () => {
  it('rundet .5 vom Nullpunkt weg', () => {
    expect(rundeKaufmaennisch(2.5)).toBe(3);
    expect(rundeKaufmaennisch(-2.5)).toBe(-3);
    expect(rundeKaufmaennisch(2.4)).toBe(2);
    expect(rundeKaufmaennisch(-2.4)).toBe(-2);
  });
});

describe('Längen anlegen', () => {
  it('mm in µm', () => {
    expect(mm(210).um).toBe(210000);
    expect(mm(0.1).um).toBe(100);
    expect(mm(0.0005).um).toBe(1);
    expect(mm(-0.0005).um).toBe(-1);
  });
  it('m und pt in µm', () => {
    expect(m(1).um).toBe(1_000_000);
    expect(pt(72).um).toBe(25400);
    expect(pt(1).um).toBe(353);
  });
  it('um nur ganzzahlig', () => {
    expect(um(5).um).toBe(5);
    expect(() => um(1.5)).toThrow(RangeError);
  });
  it('ungültige Zahlen werfen', () => {
    expect(() => mm(Number.NaN)).toThrow('Ungültige Länge');
    expect(() => mm(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => pt(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('Umrechnen', () => {
  it('in mm und pt', () => {
    expect(inMm(mm(297))).toBe(297);
    expect(inPt(mm(25.4))).toBe(72);
    expect(inMm(pt(1))).toBe(0.353);
  });
  it('mm → µm → mm ist für ganze µm verlustfrei', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (n) => {
        expect(mm(inMm(um(n))).um).toBe(n);
      }),
    );
  });
});

describe('Rechnen', () => {
  it('plus, minus, mal', () => {
    expect(plus(mm(1), mm(2)).um).toBe(3000);
    expect(minus(mm(5), mm(2)).um).toBe(3000);
    expect(mal(mm(10), 1 / 3).um).toBe(3333);
  });
  it('vergleiche', () => {
    expect(vergleiche(mm(1), mm(2))).toBe(-1);
    expect(vergleiche(mm(2), mm(2))).toBe(0);
    expect(vergleiche(mm(3), mm(2))).toBe(1);
  });
});

describe('formatMm', () => {
  it('deutsches Format', () => {
    expect(formatMm(mm(210))).toBe('210,0 mm');
    expect(formatMm(mm(0.35), 2)).toBe('0,35 mm');
    expect(formatMm(mm(3), 0)).toBe('3 mm');
  });
});
