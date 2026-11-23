import { describe, expect, it } from 'vitest';
import { formatMenge, malM, menge, plusM } from './index';

describe('menge', () => {
  it('legt gültige Mengen an', () => {
    expect(menge(1000, 'Bogen')).toEqual({ wert: 1000, einheit: 'Bogen' });
    expect(menge(12.5, 'm2').wert).toBe(12.5);
  });
  it('lehnt ungültige Mengen ab', () => {
    expect(() => menge(-1, 'Bogen')).toThrow('Menge darf nicht negativ sein');
    expect(() => menge(1.5, 'Bogen')).toThrow('Bogen muss ganzzahlig sein');
    expect(() => menge(Number.NaN, 'Stunde')).toThrow('Ungültige Menge');
  });
});

describe('plusM', () => {
  it('addiert gleiche Einheiten', () => {
    expect(plusM(menge(2, 'Bogen'), menge(3, 'Bogen')).wert).toBe(5);
  });
  it('verhindert gemischte Einheiten im Typsystem und zur Laufzeit', () => {
    expect(() =>
      // @ts-expect-error Bogen und Bogenseite dürfen nicht addiert werden
      plusM(menge(1, 'Bogen'), menge(1, 'Bogenseite')),
    ).toThrow('Einheiten passen nicht: Bogen + Bogenseite');
  });
});

describe('malM', () => {
  it('rundet ganzzahlige Einheiten auf', () => {
    expect(malM(menge(10, 'Bogen'), 0.25).wert).toBe(3);
    expect(malM(menge(10, 'm2'), 0.25).wert).toBe(2.5);
  });
});

describe('formatMenge', () => {
  it('deutsches Format mit Anzeigenamen', () => {
    expect(formatMenge(menge(1000, 'Bogen'))).toBe('1.000 Bogen');
    expect(formatMenge(menge(12.5, 'm2'))).toBe('12,5 m²');
    expect(formatMenge(menge(3, 'Stueck'))).toBe('3 Stück');
    expect(formatMenge(menge(1, 'Klick'))).toBe('1 Klick');
    expect(formatMenge(menge(2, 'Klick'))).toBe('2 Klicks');
    expect(formatMenge(menge(2.25, 'Stunde'))).toBe('2,25 Std.');
  });
});
