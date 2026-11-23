import { describe, expect, it } from 'vitest';
import { leereAusschiessVorlagen, type AusschiessVorlagen } from '@druck/layout-core';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  rechneKalkulation,
  type Kalkulation,
  type PapierwegErgebnis,
  type Produktion,
} from './index';

/** Beispiel-Produktion; Ricoh mit SRA3 als Höchstformat und 4 mm Rand. */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
  if (!ton) throw new Error('AP-TON5C fehlt');
  ton.grenzen = {
    ...ton.grenzen,
    randUm: 4000,
    formatMax: { breiteUm: 330_000, hoeheUm: 487_000 },
  };
  return p;
}

const VORLAGEN: AusschiessVorlagen = {
  ...leereAusschiessVorlagen(),
  schemas: [
    {
      id: 'AS-0001',
      name: 'Visitenkarte ohne Beschnitt',
      beschnittUm: 0,
      steg: { xUm: 0, yUm: 0 },
      endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
    },
    { id: 'AS-0002', name: 'Raster 2 × 2', raster: { spalten: 2, zeilen: 2 } },
    { id: 'AS-0003', name: 'Bogen 32 × 45', bogen: { breiteUm: 320_000, hoeheUm: 450_000 } },
  ],
};

function papierweg(teil: Record<string, unknown>, vorlagen = VORLAGEN): PapierwegErgebnis {
  const r = kalkulationHinzufuegen(leereKalkulationen(), {
    titel: 'Karten',
    auflagen: [1000],
    einheit: 'Stueck',
    teile: [
      {
        id: 'T1',
        name: 'Karte',
        materialId: 'L1',
        endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
        jeProdukt: 1,
        ...teil,
      },
    ],
    zeilen: [
      {
        id: 'Z1',
        art: 'arbeitsgang',
        platzId: 'AP-TON5C',
        schrittId: 'S0001',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
        druck: { vorne: { farbe: 'farbig' } },
      },
      {
        id: 'Z2',
        art: 'arbeitsgang',
        platzId: 'AP-SCHN',
        schrittId: 'S0006',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'vorschneiden' },
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k: Kalkulation | undefined = r.wert.kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  const pw = rechneKalkulation(k, produktion(), BEISPIEL_LAGER, '2026-10-27', vorlagen).auflagen[0]
    ?.papierwege[0]?.papierweg;
  if (!pw) throw new Error('Papierweg fehlt');
  return pw;
}

describe('Kalkulation: Nutzen aus dem Ausschießschema', () => {
  it('automatisch: 91 × 61 mit Beschnitt auf 322 × 479 (SRA3 − 4 mm Rand) → gedreht 5 × 5 = 25', () => {
    const pw = papierweg({});
    expect(pw.nutzenRaster).toEqual({ spalten: 5, zeilen: 5, gedreht: true, anzahl: 25 });
    // Doppelschnitt: 2 Randschnitte + 2 je Zwischenraum → Streifen 2 + 8 = 10, je Streifen 10
    expect(pw.schnitteEndschnitt).toEqual({ einzeln: 60, gestapelt: 20 });
  });

  it('Schema ohne Beschnitt, Steg 0: mehr Nutzen, Einzelschnitte statt Doppelschnitt', () => {
    const pw = papierweg({ schemaId: 'AS-0001' });
    expect(pw.nutzenJeBogen).toBe(25);
    expect(pw.nutzenRaster?.gedreht).toBe(true);
    // Einzelschnitt: 2 Randschnitte + 1 je Zwischenraum → Streifen 2 + 4 = 6, je Streifen 6
    expect(pw.schnitteEndschnitt).toEqual({ einzeln: 36, gestapelt: 12 });
    expect(pw.rechenweg).toContain(
      'Nutzen: 85 × 55 mm + 0 mm Beschnitt, Rand 4 mm auf 33 × 48,7 cm → 5 × 5 (gedreht) = 25' +
        ' (Schema „Visitenkarte ohne Beschnitt“)',
    );
    expect(pw.hinweise).toEqual([]);
  });

  it('festes Raster 2 × 2 und Druckbogen aus dem Schema', () => {
    expect(papierweg({ schemaId: 'AS-0002' }).nutzenJeBogen).toBe(4);
    const pw = papierweg({ schemaId: 'AS-0003' });
    expect(pw.druckbogenFormat).toEqual({ breiteUm: 320_000, hoeheUm: 450_000 });
    expect(pw.druckbogenJeRohbogen).toBe(4);
  });

  it('Hinweise: Schema für ein anderes Format, Schema nicht gefunden, Raster passt nicht', () => {
    expect(
      papierweg({ schemaId: 'AS-0001', endformat: { breiteUm: 90_000, hoeheUm: 50_000 } }).hinweise,
    ).toEqual(['Schema „Visitenkarte ohne Beschnitt“ ist für 85 × 55 mm, das Teil hat 90 × 50 mm']);
    expect(papierweg({ schemaId: 'AS-9999' }).hinweise).toEqual([
      'Ausschießschema AS-9999 nicht gefunden – automatisch',
    ]);
    const gross = papierweg({
      schemaId: 'AS-0002',
      endformat: { breiteUm: 210_000, hoeheUm: 297_000 },
      druckbogen: { breiteUm: 330_000, hoeheUm: 487_000 },
    });
    expect(gross.nutzenJeBogen).toBeNull();
    expect(gross.hinweise[0]).toMatch(
      /^Endformat 210 × 297 mm passt nicht auf den Druckbogen 33 × 48,7 cm \(Schema „Raster 2 × 2“: Raster 2 × 2 passt nicht/,
    );
  });
});
