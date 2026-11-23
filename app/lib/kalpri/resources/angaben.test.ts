import { describe, expect, it } from 'vitest';
import { angabenAusText, angabenText, anzahlAusAngaben } from './angaben';

describe('Angaben am Schritt', () => {
  it('Text wird zu Angaben; Komma und Semikolon trennen, Leeres fällt weg', () => {
    expect(angabenAusText('4-fach, Ø 6 mm; Abstand 8 mm')).toEqual([
      '4-fach',
      'Ø 6 mm',
      'Abstand 8 mm',
    ]);
    expect(angabenAusText('   ')).toEqual([]);
    expect(angabenAusText('4-fach,, 8 mm')).toEqual(['4-fach', '8 mm']);
    expect(angabenAusText('x'.repeat(100))).toEqual(['x'.repeat(80)]);
    // Komma zwischen Ziffern ist ein Dezimalkomma
    expect(angabenAusText('Ø 1,5 mm, 4-fach')).toEqual(['Ø 1,5 mm', '4-fach']);
  });

  it('Anzahl ist die erste Zahl der ersten Angabe mit Zahl', () => {
    expect(anzahlAusAngaben(['4-fach', 'Ø 6 mm', 'Abstand 8 mm'])).toBe(4);
    expect(anzahlAusAngaben(['Ø 6 mm', '4-fach'])).toBe(6);
    expect(anzahlAusAngaben(['1,5 mm'])).toBe(1.5);
    expect(anzahlAusAngaben(['gerundet'])).toBeNull();
    expect(anzahlAusAngaben([])).toBeNull();
    expect(anzahlAusAngaben(undefined)).toBeNull();
  });

  it('Angaben als Text', () => {
    expect(angabenText(['4-fach', 'Ø 6 mm'])).toBe('4-fach, Ø 6 mm');
    expect(angabenText([])).toBe('');
    expect(angabenText(undefined)).toBe('');
  });
});
