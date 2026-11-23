import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  druckbogenVorschlag,
  kalkulationHinzufuegen,
  leereKalkulationen,
  rechneKalkulation,
  type AuflagenErgebnis,
  type Kalkulation,
  type Produktion,
  type ZeilenErgebnis,
} from './index';

const A5 = { endformat: { breiteUm: 148_000, hoeheUm: 210_000 } };
const ROH_70_100 = { breiteUm: 700_000, hoeheUm: 1_000_000 };
const SRA3 = { breiteUm: 330_000, hoeheUm: 487_000 };

/** Beispiel-Produktion; Ricoh mit Höchstformat SRA3, 4 mm Rand und Klickpreisen. */
function produktion(max = true): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  ton.grenzen = { ...ton.grenzen, randUm: 4000, ...(max ? { formatMax: SRA3 } : {}) };
  ton.klickpreise = [
    { farbe: 'farbig', bisFormat: { breiteUm: 210_000, hoeheUm: 297_000 }, zehntelcent: 30 },
    { farbe: 'farbig', bisFormat: SRA3, zehntelcent: 45 },
  ];
  return p;
}

function kalkulation(zeilen: unknown[], teil: Record<string, unknown> = {}): Kalkulation {
  const r = kalkulationHinzufuegen(leereKalkulationen(), {
    titel: 'Flyer A5',
    auflagen: [1000],
    einheit: 'Stueck',
    teile: [{ id: 'T1', name: 'Flyer', materialId: 'L1', jeProdukt: 1, ...A5, ...teil }],
    zeilen,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return k;
}

const DRUCK = {
  id: 'Z3',
  art: 'arbeitsgang',
  platzId: 'AP-TON5C',
  schrittId: 'S0001',
  menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
  druck: { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
};
const PAPIER = {
  id: 'Z1',
  art: 'material',
  materialId: 'L1',
  menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
};
const VORSCHNEIDEN = {
  id: 'Z2',
  art: 'arbeitsgang',
  platzId: 'AP-SCHN',
  schrittId: 'S0006',
  menge: { art: 'papierweg', teilId: 'T1', wert: 'vorschneiden' },
};

function auflage(k: Kalkulation, p: Produktion = produktion()): AuflagenErgebnis {
  const a = rechneKalkulation(k, p, BEISPIEL_LAGER, '2026-10-27').auflagen[0];
  if (!a) throw new Error('Auflage fehlt');
  return a;
}

function zeile(a: AuflagenErgebnis, id: string): ZeilenErgebnis {
  const z = a.zeilen.find((x) => x.zeileId === id);
  if (!z) throw new Error(`Zeile ${id} fehlt`);
  return z;
}

describe('Druckbogen-Vorschlag (Vorschneiden)', () => {
  it('A5 auf 70 × 100 in SRA3: Höchstformat 4 × je Rohbogen schlägt die Neuntel-Teilung', () => {
    expect(druckbogenVorschlag(A5, ROH_70_100, SRA3, 4000)).toEqual({
      format: SRA3,
      jeRohbogen: 4,
      nutzenJeBogen: 4,
      geteilt: false,
      text:
        'Rohbogen 70 × 100 cm passt nicht in die Maschine (höchstens 33 × 48,7 cm) → 4 Druckbogen' +
        ' 33 × 48,7 cm je Rohbogen (Rest Abfall), je 4 Nutzen – wird vorgeschnitten',
    });
  });

  it('Visitenkarten auf 65 × 92: genaue Viertel-Teilung, gleich viele Nutzen, mehr je Rohbogen', () => {
    const v = druckbogenVorschlag(
      { endformat: { breiteUm: 85_000, hoeheUm: 55_000 } },
      { breiteUm: 650_000, hoeheUm: 920_000 },
      SRA3,
    );
    expect(v).toMatchObject({
      format: { breiteUm: 325_000, hoeheUm: 460_000 },
      jeRohbogen: 4,
      nutzenJeBogen: 25,
      geteilt: true,
    });
  });

  it('passt der Rohbogen schon, gibt es keinen Vorschlag', () => {
    expect(druckbogenVorschlag(A5, { breiteUm: 320_000, hoeheUm: 450_000 }, SRA3)).toBeNull();
  });
});

describe('Kalkulation: Druckbogen automatisch aus dem Höchstformat der Druckmaschine', () => {
  it('Flyer A5 auf 70 × 100: Druckbogen SRA3, Klickpreis SRA3, Rohbogen = Druckbogen ÷ 4', () => {
    const a = auflage(kalkulation([PAPIER, VORSCHNEIDEN, DRUCK]));
    const pw = a.papierwege[0]?.papierweg;
    expect(pw).toMatchObject({
      druckbogenFormat: SRA3,
      nutzenJeBogen: 4,
      druckbogenNetto: 250,
      druckbogenJeRohbogen: 4,
    });
    expect(pw?.rohbogen).toBe(Math.ceil((pw?.druckbogen ?? 0) / 4));
    expect(pw?.rechenweg[0]).toBe(
      'Druckbogen automatisch: Rohbogen 70 × 100 cm passt nicht in die Maschine (höchstens' +
        ' 33 × 48,7 cm) → 4 Druckbogen 33 × 48,7 cm je Rohbogen (Rest Abfall), je 4 Nutzen' +
        ' – wird vorgeschnitten',
    );
    expect(pw?.hinweise).toEqual([]);
    // Papier mit Zuschuss: so viele Rohbogen, wie der Druck braucht
    expect(zeile(a, 'Z1').menge).toBe(pw?.rohbogen);
    // Klicks je Seite zum SRA3-Preis
    expect(zeile(a, 'Z3').klicks?.anzahl).toBe(2 * (pw?.druckbogen ?? 0));
    expect(zeile(a, 'Z3').rechenweg).toContain(
      `Klicks vorne farbig: ${pw?.druckbogen ?? 0} × 0,045 € (bis 33 × 48,7 cm) = ${(((pw?.druckbogen ?? 0) * 45) / 1000).toFixed(((pw?.druckbogen ?? 0) * 45) % 10 === 0 ? 2 : 3).replace('.', ',')} €`,
    );
    // Vorschneiden: 2 × 2 SRA3 aus 70 × 100 mit Abfall je Richtung → 2 + 2 × 2 = 6 Schnitte
    expect(pw?.schnitteVorschneiden).toEqual({ einzeln: 6, gestapelt: 4 });
    expect(zeile(a, 'Z2').rechenweg[0]).toBe(
      'Menge aus dem Papierweg: 6 Schnitte je Stapel × 1 Stapel (67 Rohbogen) = 6',
    );
  });

  it('ohne Zeile Vorschneiden: Hinweis am Papierweg', () => {
    const pw = auflage(kalkulation([PAPIER, DRUCK])).papierwege[0]?.papierweg;
    expect(pw?.hinweise).toEqual([
      'Vorschneiden fehlt: Zeile Schneiden mit Menge „Papierweg T1: Schnitte Vorschneiden“ anlegen',
    ]);
  });

  it('ohne Höchstformat an der Maschine: gedruckt wird auf dem Rohbogen (wie bisher)', () => {
    const pw = auflage(kalkulation([PAPIER, DRUCK]), produktion(false)).papierwege[0]?.papierweg;
    expect(pw?.druckbogenFormat).toEqual(ROH_70_100);
    expect(pw?.hinweise).toEqual([]);
  });

  it('Druckbogen von Hand größer als die Maschine: Hinweis', () => {
    const k = kalkulation([PAPIER, VORSCHNEIDEN, DRUCK], {
      druckbogen: { breiteUm: 350_000, hoeheUm: 500_000 },
    });
    expect(auflage(k).papierwege[0]?.papierweg.hinweise).toEqual([
      'Druckbogen 35 × 50 cm ist größer als die Druckmaschine (höchstens 33 × 48,7 cm)',
    ]);
  });
});
