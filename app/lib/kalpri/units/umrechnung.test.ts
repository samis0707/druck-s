import { describe, expect, it } from 'vitest';
import {
  EINHEITEN,
  einheitAnzeige,
  formatMenge,
  menge,
  mm,
  rechneUm,
  stapelAnzahl,
  um,
  umrechnung,
} from './index';

describe('neue Einheiten', () => {
  it('sind ganzzahlig und haben deutsche Namen', () => {
    expect(EINHEITEN).toContain('Hub');
    expect(EINHEITEN).toHaveLength(22);
    expect(einheitAnzeige('Buendel')).toBe('Bündel');
    expect(einheitAnzeige('Hub')).toBe('Hübe');
    expect(einheitAnzeige('Hub', 1)).toBe('Hub');
    expect(einheitAnzeige('Satz')).toBe('Sätze');
    expect(einheitAnzeige('Auftrag', 1)).toBe('Auftrag');
    expect(formatMenge(menge(1500, 'Lage'))).toBe('1.500 Lagen');
    expect(() => menge(2.5, 'Stapel')).toThrow('Stapel muss ganzzahlig sein');
  });
});

describe('Umrechnung', () => {
  it('in die Sammeleinheit aufgerundet, zurück multipliziert', () => {
    const buendel = umrechnung('Buendel', 50, 'Stueck');
    expect(rechneUm(menge(1000, 'Stueck'), buendel)).toEqual({ wert: 20, einheit: 'Buendel' });
    expect(rechneUm(menge(1001, 'Stueck'), buendel)).toEqual({ wert: 21, einheit: 'Buendel' });
    const paket = umrechnung('Paket', 10, 'Satz');
    expect(rechneUm(menge(1030, 'Satz'), paket)).toEqual({ wert: 103, einheit: 'Paket' });
    expect(rechneUm(menge(3, 'Paket'), paket)).toEqual({ wert: 30, einheit: 'Satz' });
  });

  it('falsche Einheit und ungültige Umrechnung werfen', () => {
    const buendel = umrechnung('Buendel', 50, 'Stueck');
    expect(() => rechneUm(menge(10, 'Bogen'), buendel)).toThrow(
      'Umrechnung passt nicht: Bogen (1 Buendel = 50 Stueck)',
    );
    expect(() => umrechnung('Paket', 0, 'Satz')).toThrow(
      'Umrechnung braucht eine Anzahl größer als 0',
    );
    expect(() => umrechnung('Satz', 10, 'Satz')).toThrow('Umrechnung in dieselbe Einheit: Satz');
  });
});

describe('stapelAnzahl', () => {
  it('ganze Blatt je Stapel, Stapel aufgerundet', () => {
    expect(stapelAnzahl(650, um(400), mm(120))).toEqual({ wert: 3, einheit: 'Stapel' });
    expect(stapelAnzahl(300, um(400), mm(120))).toEqual({ wert: 1, einheit: 'Stapel' });
    expect(stapelAnzahl(301, um(400), mm(120))).toEqual({ wert: 2, einheit: 'Stapel' });
    expect(stapelAnzahl(1000, um(110), mm(40))).toEqual({ wert: 3, einheit: 'Stapel' });
    expect(stapelAnzahl(0, um(110), mm(40))).toEqual({ wert: 0, einheit: 'Stapel' });
  });

  it('zu dickes Material und ungültige Werte werfen', () => {
    expect(() => stapelAnzahl(10, mm(30), mm(25))).toThrow(
      'Material ist dicker als die Einlegehöhe',
    );
    expect(() => stapelAnzahl(10, um(0), mm(25))).toThrow(
      'Dicke und Einlegehöhe müssen größer als 0 sein',
    );
    expect(() => stapelAnzahl(2.5, um(100), mm(25))).toThrow('Stueck muss ganzzahlig sein');
  });
});
