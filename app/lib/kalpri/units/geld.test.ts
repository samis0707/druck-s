import { describe, expect, it } from 'vitest';
import { euro, formatEuro, malG, minusG, plusG, summeG, zehntelcent } from './index';

describe('Geld', () => {
  it('euro in Zehntelcent', () => {
    expect(euro(1.234).zehntelcent).toBe(1234);
    expect(euro(0.0005).zehntelcent).toBe(1);
    expect(() => zehntelcent(1.5)).toThrow(RangeError);
    expect(() => euro(Number.NaN)).toThrow('Ungültiger Geldbetrag');
  });
  it('rechnen', () => {
    expect(plusG(euro(1), euro(2)).zehntelcent).toBe(3000);
    expect(minusG(euro(1), euro(2)).zehntelcent).toBe(-1000);
    expect(malG(euro(1), 1 / 3).zehntelcent).toBe(333);
    expect(summeG([]).zehntelcent).toBe(0);
    expect(summeG([euro(0.1), euro(0.2)]).zehntelcent).toBe(300);
  });
  it('formatEuro rundet auf Cent', () => {
    expect(formatEuro(euro(1234.565))).toBe('1.234,57 €');
    expect(formatEuro(euro(0.004))).toBe('0,00 €');
    expect(formatEuro(euro(-1.005))).toBe('-1,01 €');
  });
});
