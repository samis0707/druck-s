import { describe, expect, it } from 'vitest';
import {
  beschreibeLeistung,
  dauerJeEinheit,
  formatLeistung,
  jeStunde,
  laufzeit,
  leistung,
  minuten,
  sekunden,
  stunden,
  ms,
} from './index';

describe('leistung', () => {
  it('Menge + Einheit + Zeit → je Stunde und je Einheit', () => {
    const falten = leistung(10, 'Stueck', minuten(5));
    expect(jeStunde(falten)).toBe(120);
    expect(dauerJeEinheit(falten).ms).toBe(30_000);
    const praegen = leistung(25, 'Bogen', minuten(1));
    expect(jeStunde(praegen)).toBe(1500);
    const duplo = leistung(1, 'Satz', sekunden(1.5));
    expect(jeStunde(duplo)).toBe(2400);
    const bohren = leistung(1, 'Hub', minuten(0.875));
    expect(Math.round(jeStunde(bohren) * 10_000)).toBe(685_714);
  });

  it('ungültige Leistungen werfen', () => {
    expect(() => leistung(0, 'Bogen', minuten(1))).toThrow(
      'Leistung braucht eine Menge größer als 0',
    );
    expect(() => leistung(10, 'Bogen', ms(0))).toThrow('Leistung braucht eine Zeit größer als 0');
    expect(() => leistung(2.5, 'Bogen', minuten(1))).toThrow('Bogen muss ganzzahlig sein');
    expect(leistung(11, 'm2', stunden(1)).menge).toBe(11);
  });

  it('Laufzeit für eine Menge, auf ganze ms gerundet', () => {
    const tiegel = leistung(2295, 'Bogen', stunden(1));
    expect(laufzeit(tiegel, 2600).ms).toBe(4_078_431);
    const duplo = leistung(1920, 'Satz', stunden(1));
    expect(laufzeit(duplo, 1030).ms).toBe(1_931_250);
    const falten = leistung(300, 'Stueck', stunden(1));
    expect(laufzeit(falten, 1000).ms).toBe(12_000_000);
    expect(laufzeit(falten, 0).ms).toBe(0);
    expect(() => laufzeit(falten, 1.5)).toThrow('Stueck muss ganzzahlig sein');
  });

  it('Anzeige je Stunde und als Satz', () => {
    expect(formatLeistung(leistung(1, 'Hub', minuten(0.875)))).toBe('68,57 Hübe/h');
    expect(formatLeistung(leistung(1, 'Satz', sekunden(1.5)))).toBe('2.400 Sätze/h');
    expect(beschreibeLeistung(leistung(10, 'Stueck', minuten(5)))).toBe(
      '10 Stück in 5 min = 120 Stück/h = 30 s je Stück',
    );
    expect(beschreibeLeistung(leistung(25, 'Bogen', minuten(1)))).toBe(
      '25 Bogen in 1 min = 1.500 Bogen/h = 2,4 s je Bogen',
    );
    expect(beschreibeLeistung(leistung(1, 'Hub', minuten(0.875)))).toBe(
      '1 Hub in 52,5 s = 68,57 Hübe/h',
    );
    expect(beschreibeLeistung(leistung(23, 'm2', stunden(1)))).toBe(
      '23 m² in 1 h = 23 m²/h = 2,61 min je m²',
    );
  });
});
