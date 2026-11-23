import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  profilLeistung,
  pruefeProduktion,
  rechenweg,
  rechneProbe,
  type Produktion,
} from './index';

const MIN = 60_000;

/** Locher: Lochen je Stapel, 1 Stapel in 20 s, Rüsten 5 min; am Platz „Einschalten 1 min". */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  p.arbeitsschritte.push({ id: 'S9001', name: 'Lochen', einheit: 'Stapel' });
  (p.arbeitsplaetze ?? []).push({
    id: 'AP-LOCH',
    name: 'Locher',
    stundensatzVollZehntelcent: 60_000,
    ruesten: [{ name: 'Einschalten', dauerMs: MIN, je: 'Auftrag' }],
    schritte: [
      {
        schrittId: 'S9001',
        leistung: { menge: 1, dauerMs: 20_000 },
        ruesten: [{ name: 'Rüsten', dauerMs: 5 * MIN, je: 'Auftrag' }],
        zuschuss: { fest: 1 },
        profile: [
          {
            name: '2-fach DIN',
            beschreibung: 'Standard',
            angaben: ['2-fach', 'Ø 6 mm', 'Abstand 80 mm'],
            ruestenMs: 3 * MIN,
          },
          { name: '4-fach', menge: 1, dauerMs: 25_000, ruestenMs: 5 * MIN },
          { name: 'Sonder', zuschuss: { fest: 2, prozent: 10 } },
        ],
      },
    ],
  });
  const r = pruefeProduktion(p);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function probe(profil?: string) {
  const r = rechneProbe(produktion(), {
    platzId: 'AP-LOCH',
    schrittId: 'S9001',
    menge: 10,
    ...(profil === undefined ? {} : { profil }),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

describe('Varianten eines Schritts', () => {
  it('ohne Variante: Werte des Schritts', () => {
    expect(rechenweg(probe()).slice(0, 4)).toEqual([
      'Leistung: 180 Stapel/h',
      'Zuschuss: 1 fest + 0 % = 1 → 11 Stapel',
      'Lauf: 11 Stapel ÷ 180/h = 3,67 min',
      'Rüsten: Einschalten 1 min + Rüsten 5 min = 6 min',
    ]);
  });

  it('2-fach DIN: Leistung vom Schritt geerbt, eigene Rüstzeit ersetzt die des Schritts', () => {
    const r = probe('2-fach din');
    expect(r.profil).toBe('2-fach DIN');
    expect(rechenweg(r).slice(0, 4)).toEqual([
      'Leistung (2-fach DIN, vom Schritt): 180 Stapel/h',
      'Zuschuss: 1 fest + 0 % = 1 → 11 Stapel',
      'Lauf: 11 Stapel ÷ 180/h = 3,67 min',
      'Rüsten: Einschalten 1 min + Rüsten 2-fach DIN 3 min = 4 min',
    ]);
  });

  it('4-fach: eigene Leistung und Rüstzeit', () => {
    expect(rechenweg(probe('4-fach')).slice(0, 4)).toEqual([
      'Leistung (4-fach): 144 Stapel/h',
      'Zuschuss: 1 fest + 0 % = 1 → 11 Stapel',
      'Lauf: 11 Stapel ÷ 144/h = 4,58 min',
      'Rüsten: Einschalten 1 min + Rüsten 4-fach 5 min = 6 min',
    ]);
  });

  it('Sonder: eigener Zuschuss ersetzt den des Schritts, Rüsten vom Schritt', () => {
    expect(rechenweg(probe('Sonder')).slice(1, 4)).toEqual([
      'Zuschuss: 2 fest + 10 % = 3 → 13 Stapel',
      'Lauf: 13 Stapel ÷ 180/h = 4,33 min',
      'Rüsten: Einschalten 1 min + Rüsten 5 min = 6 min',
    ]);
  });

  it('unbekannte Variante: Meldung am Feld', () => {
    const r = rechneProbe(produktion(), {
      platzId: 'AP-LOCH',
      schrittId: 'S9001',
      menge: 10,
      profil: '6-fach',
    });
    expect(r).toEqual({
      ok: false,
      fehler: [{ pfad: 'profil', meldung: 'Ausführung 6-fach nicht gefunden' }],
    });
  });

  it('Leistung der Variante: null, wenn sie erbt', () => {
    expect(profilLeistung(produktion(), 'AP-LOCH', 'S9001', '2-fach DIN')).toBeNull();
    expect(profilLeistung(produktion(), 'AP-LOCH', 'S9001', '4-fach')?.dauer.ms).toBe(25_000);
  });

  it('Schema: Menge ohne Zeit und Zeit ohne Menge werden gemeldet', () => {
    const p = JSON.parse(JSON.stringify(produktion())) as {
      arbeitsplaetze: { schritte: { profile: Record<string, unknown>[] }[] }[];
    };
    const loch = p.arbeitsplaetze[p.arbeitsplaetze.length - 1];
    const profile = loch?.schritte[0]?.profile;
    if (!profile) throw new Error('Profile fehlen');
    profile.push({ name: 'nur Menge', menge: 2 }, { name: 'nur Zeit', dauerMs: 1000 });
    const r = pruefeProduktion(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const i = p.arbeitsplaetze.length - 1;
    expect(r.fehler).toEqual([
      { pfad: `arbeitsplaetze.${i}.schritte.0.profile.3.dauerMs`, meldung: 'Zeit fehlt' },
      { pfad: `arbeitsplaetze.${i}.schritte.0.profile.4.menge`, meldung: 'Menge fehlt' },
    ]);
  });
});
