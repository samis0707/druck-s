import { describe, expect, it } from 'vitest';
import { einheitAnzeige, formatMenge, menge } from './index';

describe('einheitAnzeige', () => {
  it('liefert deutsche Anzeigenamen', () => {
    expect(einheitAnzeige('Stueck')).toBe('Stück');
    expect(einheitAnzeige('m2')).toBe('m²');
    expect(einheitAnzeige('Bogenseite')).toBe('Bogenseiten');
    expect(einheitAnzeige('Bogenseite', 1)).toBe('Bogenseite');
    expect(einheitAnzeige('Klick')).toBe('Klicks');
    expect(einheitAnzeige('Klick', 1)).toBe('Klick');
  });
  it('formatMenge nutzt dieselben Namen', () => {
    expect(formatMenge(menge(1, 'Klick'))).toBe('1 Klick');
    expect(formatMenge(menge(3, 'Stueck'))).toBe('3 Stück');
  });
});
