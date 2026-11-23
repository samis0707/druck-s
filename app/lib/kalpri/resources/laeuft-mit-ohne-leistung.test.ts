import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  arbeitsplatzHinweise,
  plaetzeFuerSchritt,
  rechneKalkulation,
  type Kalkulation,
  type Produktion,
} from './index';

type Platz = NonNullable<Produktion['arbeitsplaetze']>[number];

/** Digitaldruck Toner kann zusätzlich Bohren – läuft mit dem Druck, ohne eigene Leistung. */
function mitBohrenAmToner(laeuftMit: { schrittId: string; leistungProzent?: number }): Produktion {
  return {
    ...BEISPIEL_PRODUKTION,
    arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map(
      (p): Platz =>
        p.id === 'AP-TON5C'
          ? {
              ...p,
              schritte: [
                ...p.schritte,
                {
                  schrittId: 'S0014',
                  ruesten: [{ name: 'Lochwerk einsetzen', dauerMs: 120_000, je: 'Auftrag' }],
                  laeuftMit,
                },
              ],
            }
          : p,
    ),
  };
}

const p = mitBohrenAmToner({ schrittId: 'S0001' });
const druck = {
  id: 'Z1',
  art: 'arbeitsgang' as const,
  platzId: 'AP-TON5C',
  schrittId: 'S0001',
  materialId: 'L2',
  menge: { art: 'hand' as const, mengen: [500] },
  druck: { vorne: { farbe: 'farbig' as const } },
};
const bohren = (platzId: string) => ({
  id: 'Z2',
  art: 'arbeitsgang' as const,
  platzId,
  schrittId: 'S0014',
  menge: { art: 'hand' as const, mengen: [500] },
});

function rechne(zeilen: Kalkulation['zeilen'], prod: Produktion = p) {
  const k: Kalkulation = {
    id: 'K-0001',
    titel: 'Gelocht',
    einheit: 'Stueck',
    auflagen: [500],
    zeilen,
  };
  const a = rechneKalkulation(k, prod, BEISPIEL_LAGER, '2026-11-07').auflagen[0];
  if (!a) throw new Error('keine Auflage');
  return a.zeilen;
}

describe('„läuft mit“ ohne eigene Leistung (T99)', () => {
  it('Stammdaten: kein „Leistung fehlt“, Maschine gilt als fähig', () => {
    const toner = (p.arbeitsplaetze ?? []).find((x) => x.id === 'AP-TON5C');
    if (!toner) throw new Error('Toner fehlt');
    expect(arbeitsplatzHinweise(p, toner).join(' ')).not.toContain('Bohren: Leistung fehlt');
    expect(plaetzeFuerSchritt(p, 'S0014').find((x) => x.id === 'AP-TON5C')?.rechnet).toBe(true);
  });

  it('mit Druck an derselben Maschine: nur Rüsten, Rechenweg „keine eigene“, Tabelle „läuft mit“', () => {
    const z = rechne([druck, bohren('AP-TON5C')])[1];
    expect(z?.hinweise).toContain('Bohren läuft mit Digitaldruck – nur Rüsten');
    expect(z?.zeitMs).toBe(120_000);
    expect(z?.kostenVoll?.zehntelcent).toBe(5_467); // 2 min × 164 €/h
    expect(z?.rechenweg[0]).toBe('Leistung: keine eigene (läuft mit Digitaldruck)');
    expect(z?.rechenweg).toContain('Lauf: läuft mit Digitaldruck – keine eigene Laufzeit');
    expect(z?.werte).toMatchObject({ art: 'arbeitsgang', laeuftMit: 'Digitaldruck' });
  });

  it('ohne Druckzeile an der Maschine: klare Meldung, rechnet nicht', () => {
    const z = rechne([bohren('AP-TON5C')])[0];
    expect(z?.kostenVoll).toBeNull();
    expect(z?.hinweise).toContain(
      'Bohren läuft nur mit Digitaldruck an derselben Maschine – diese Zeile fehlt',
    );
  });

  it('dieselbe Kalkulation, Bohren an anderer Maschine: eigener Arbeitsgang mit Leistung', () => {
    const z = rechne([druck, bohren('AP-KLEIN')])[1];
    expect(z?.hinweise.join(' ')).not.toContain('läuft mit');
    expect(z?.zeitMs).toBeGreaterThan(120_000);
    expect(z?.werte).toMatchObject({ art: 'arbeitsgang', jeStunde: (1000 / (0.875 * 1000)) * 60 });
    expect(z?.werte && 'laeuftMit' in z.werte).toBe(false);
  });

  it('Leistung des anderen −10 %: der Druck wird langsamer', () => {
    const langsamer = mitBohrenAmToner({ schrittId: 'S0001', leistungProzent: -10 });
    const ohne = rechne([druck, bohren('AP-TON5C')], langsamer)[0];
    const nurDruck = rechne([druck], langsamer)[0];
    expect(ohne?.werte?.art === 'arbeitsgang' && ohne.werte.jeStunde).toBeCloseTo(
      (nurDruck?.werte?.art === 'arbeitsgang' ? nurDruck.werte.jeStunde : 0) * 0.9,
    );
  });
});
