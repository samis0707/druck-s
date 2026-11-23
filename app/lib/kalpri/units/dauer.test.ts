import { describe, expect, it } from 'vitest';
import {
  euro,
  formatDauer,
  inMinuten,
  inStunden,
  kostenFuerDauer,
  leseDauer,
  malD,
  minuten,
  ms,
  plusD,
  sekunden,
  stunden,
  summeD,
  type Dauer,
} from './index';

function gelesen(text: string): number {
  const e = leseDauer(text);
  if (!e.ok) throw new Error(e.meldung);
  return e.wert.ms;
}

function meldung(text: string): string {
  const e = leseDauer(text);
  return e.ok ? '' : e.meldung;
}

describe('Dauer anlegen', () => {
  it('s, min, h in ganzen ms, kaufmännisch gerundet', () => {
    expect(sekunden(1.5).ms).toBe(1500);
    expect(minuten(0.875).ms).toBe(52500);
    expect(stunden(0.08).ms).toBe(288000);
    expect(sekunden(0.0005).ms).toBe(1);
    expect(ms(0).ms).toBe(0);
    expect(inMinuten(stunden(1))).toBe(60);
    expect(inStunden(minuten(90))).toBe(1.5);
  });

  it('ungültige Werte werfen', () => {
    expect(() => ms(1.5)).toThrow('Dauer muss ganzzahlig in ms sein');
    expect(() => minuten(-1)).toThrow('Dauer darf nicht negativ sein');
    expect(() => sekunden(Number.NaN)).toThrow('Ungültige Dauer');
    expect(() => stunden(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('rechnen: plus, mal, Summe', () => {
    expect(plusD(minuten(20), minuten(25)).ms).toBe(2_700_000);
    expect(malD(minuten(1), 18).ms).toBe(1_080_000);
    expect(malD(sekunden(1), 1 / 3).ms).toBe(333);
    expect(summeD([]).ms).toBe(0);
    expect(summeD([minuten(10), minuten(18)]).ms).toBe(1_680_000);
  });
});

describe('leseDauer', () => {
  it('liest Zahl mit Komma oder Punkt und Einheit', () => {
    expect(gelesen('5 min')).toBe(300_000);
    expect(gelesen('0,08 h')).toBe(288_000);
    expect(gelesen('1,5 s')).toBe(1500);
    expect(gelesen('0.875 min')).toBe(52_500);
    expect(gelesen('  2 Std. ')).toBe(7_200_000);
    expect(gelesen('30sek')).toBe(30_000);
    expect(gelesen('1 Stunde')).toBe(3_600_000);
    expect(gelesen('10 Minuten')).toBe(600_000);
    expect(gelesen('0 min')).toBe(0);
  });

  it('meldet Leeres, Unlesbares und Tausenderpunkte', () => {
    expect(meldung('')).toBe('Pflichtfeld');
    expect(meldung('   ')).toBe('Pflichtfeld');
    expect(meldung('5')).toBe('Zeit nicht lesbar – z. B. „5 min“, „0,08 h“, „1,5 s“');
    expect(meldung('fünf min')).toBe('Zeit nicht lesbar – z. B. „5 min“, „0,08 h“, „1,5 s“');
    expect(meldung('5 tage')).toBe('Zeit nicht lesbar – z. B. „5 min“, „0,08 h“, „1,5 s“');
    expect(meldung('-5 min')).toBe('Zeit nicht lesbar – z. B. „5 min“, „0,08 h“, „1,5 s“');
    expect(meldung('1.000 s')).toBe('Bitte ohne Tausenderpunkt eingeben');
    expect(meldung('1.500 min')).toBe('Bitte ohne Tausenderpunkt eingeben');
  });
});

describe('formatDauer', () => {
  it('automatisch s, min oder h, deutsch mit höchstens 2 Nachkommastellen', () => {
    expect(formatDauer(sekunden(52.5))).toBe('52,5 s');
    expect(formatDauer(minuten(5))).toBe('5 min');
    expect(formatDauer(stunden(0.08))).toBe('4,8 min');
    expect(formatDauer(minuten(113))).toBe('1,88 h');
    expect(formatDauer(ms(0))).toBe('0 s');
  });

  it('mit fester Einheit', () => {
    expect(formatDauer(minuten(113), 'min')).toBe('113 min');
    expect(formatDauer(ms(4_078_431), 'min')).toBe('67,97 min');
    expect(formatDauer(minuten(30), 'h')).toBe('0,5 h');
    expect(formatDauer(minuten(1), 's')).toBe('60 s');
  });
});

describe('kostenFuerDauer', () => {
  it('Stundensatz × Dauer, auf Zehntelcent gerundet', () => {
    const tiegel: Dauer = ms(6_778_431);
    expect(kostenFuerDauer(euro(55), tiegel).zehntelcent).toBe(103_559);
    expect(kostenFuerDauer(euro(42), minuten(205)).zehntelcent).toBe(143_500);
    expect(kostenFuerDauer(euro(48), ms(0)).zehntelcent).toBe(0);
  });
});
