import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  berechneAusschiessPlan,
  besteLage,
  lagePositionen,
  liegtIn,
  ueberlappen,
  schnitteFuerLage,
  vorschnitte,
  type AusschiessPlan,
  type AusschiessPlanEingabe,
} from './index';

const ROH = { breiteUm: 650_000, hoeheUm: 920_000 };
const DRUCK = { breiteUm: 325_000, hoeheUm: 460_000 };

/** Visitenkarten 85 × 55 mm, 500 Stück, Druckbogen 325 × 460 aus Rohbogen 650 × 920 mm. */
function eingabe(teil: Partial<AusschiessPlanEingabe> = {}): AusschiessPlanEingabe {
  return {
    druckbogen: DRUCK,
    rohbogen: ROH,
    aufRohbogen: false,
    nutzenFormat: { breiteUm: 85_000, hoeheUm: 55_000 },
    beschnittUm: 3000,
    randUm: 4000,
    exemplare: 500,
    zuschussFest: 20,
    zuschussProzent: 3,
    ...teil,
  };
}

/** Plan ohne Raster und Rechtecke (die prüfen eigene Tests). */
function kurz(p: AusschiessPlan) {
  const { nutzenRaster, rohPositionen, ...rest } = p;
  return { ...rest, slots: nutzenRaster?.slots.length ?? null, rohStuecke: rohPositionen.length };
}

describe('Ausschießplan (Bogen, Zustand Schema) – T88', () => {
  it('1 Visitenkarten: Nutzen, Druckbogen + Zuschuss, Rohbogen, Schnitte, Papier', () => {
    expect(kurz(berechneAusschiessPlan(eingabe()))).toEqual({
      zustand: 'schema',
      druckbogenFormat: DRUCK,
      rohbogenFormat: ROH,
      nutzenJeBogen: 21,
      nutzenHerkunft: 'berechnet',
      nutzenLage: { spalten: 3, zeilen: 7, gedreht: false, anzahl: 21 },
      nutzenFehler: null,
      warnungen: [],
      doppelschnitt: true,
      // 500 ÷ 21 = 24; Zuschuss aufrunden(24 × 3 %) + 20 = 21
      druckbogenNetto: 24,
      zuschuss: 21,
      druckbogen: 45,
      druckbogenJeRohbogen: 4,
      rohLage: { spalten: 2, zeilen: 2, gedreht: false, anzahl: 4 },
      rohPasstNicht: false,
      rohbogen: 12,
      druckbogenAusRoh: 48,
      schnitteVorschneiden: { einzeln: 3, gestapelt: 2 },
      schnitteEndschnitt: { einzeln: 48, gestapelt: 20 },
      papierGenutztProzent: 66,
      slots: 21,
      rohStuecke: 4,
    });
  });

  it('2 Lage der Druckbogen auf dem Rohbogen als Rechtecke, Zeile für Zeile', () => {
    expect(berechneAusschiessPlan(eingabe()).rohPositionen).toEqual([
      { xUm: 0, yUm: 0, breiteUm: 325_000, hoeheUm: 460_000 },
      { xUm: 325_000, yUm: 0, breiteUm: 325_000, hoeheUm: 460_000 },
      { xUm: 0, yUm: 460_000, breiteUm: 325_000, hoeheUm: 460_000 },
      { xUm: 325_000, yUm: 460_000, breiteUm: 325_000, hoeheUm: 460_000 },
    ]);
    // gedreht: Breite und Höhe getauscht
    expect(
      lagePositionen(
        { breiteUm: 487_000, hoeheUm: 330_000 },
        { spalten: 2, zeilen: 1, gedreht: true, anzahl: 2 },
      ),
    ).toEqual([
      { xUm: 0, yUm: 0, breiteUm: 330_000, hoeheUm: 487_000 },
      { xUm: 330_000, yUm: 0, breiteUm: 330_000, hoeheUm: 487_000 },
    ]);
  });

  it('3 gedruckt auf dem Rohbogen: 1 Druckbogen je Rohbogen, kein Vorschneiden', () => {
    const p = berechneAusschiessPlan(eingabe({ druckbogen: ROH, aufRohbogen: true }));
    expect(kurz(p)).toMatchObject({
      nutzenJeBogen: 100,
      druckbogen: 26,
      druckbogenJeRohbogen: 1,
      rohLage: null,
      rohbogen: 26,
      druckbogenAusRoh: 26,
      schnitteVorschneiden: { einzeln: 0, gestapelt: 0 },
      rohStuecke: 0,
    });
    // gleiches Format (gedreht) zählt auch als „auf dem Rohbogen“
    const gedreht = berechneAusschiessPlan(
      eingabe({ druckbogen: { breiteUm: 920_000, hoeheUm: 650_000 } }),
    );
    expect(gedreht.druckbogenJeRohbogen).toBe(1);
  });

  it('4 Nutzen von Hand: keine Lage, kein Endschnitt', () => {
    expect(kurz(berechneAusschiessPlan(eingabe({ nutzenVonHand: 8 })))).toMatchObject({
      nutzenJeBogen: 8,
      nutzenHerkunft: 'hand',
      nutzenLage: null,
      druckbogenNetto: 63,
      zuschuss: 22,
      druckbogen: 85,
      rohbogen: 22,
      schnitteEndschnitt: null,
      papierGenutztProzent: 25,
      slots: null,
    });
  });

  it('5 fehlende oder unpassende Formate', () => {
    const ohneDruck = berechneAusschiessPlan(eingabe({ druckbogen: null }));
    expect([ohneDruck.nutzenJeBogen, ohneDruck.nutzenFehler, ohneDruck.druckbogen]).toEqual([
      null,
      null,
      null,
    ]);
    const zuGross = berechneAusschiessPlan(
      eingabe({ nutzenFormat: { breiteUm: 400_000, hoeheUm: 500_000 } }),
    );
    expect(zuGross.nutzenFehler).toBe('Endformat passt nicht in den druckbaren Bereich');
    expect(zuGross.druckbogen).toBe(null);
    const rohZuKlein = berechneAusschiessPlan(
      eingabe({ rohbogen: { breiteUm: 300_000, hoeheUm: 300_000 } }),
    );
    expect([
      rohZuKlein.rohPasstNicht,
      rohZuKlein.druckbogenJeRohbogen,
      rohZuKlein.rohbogen,
    ]).toEqual([true, null, null]);
  });

  it('6 Zuschuss: kleine Gleitkomma-Reste werden nicht aufgerundet (7 % von 300 = 21)', () => {
    const p = berechneAusschiessPlan(
      eingabe({ nutzenVonHand: 1, exemplare: 300, zuschussFest: 0, zuschussProzent: 7 }),
    );
    expect([p.druckbogenNetto, p.zuschuss, p.druckbogen]).toEqual([300, 21, 321]);
  });

  it('7 Schema mit festem Raster ohne Steg: einfache Schnitte, Beschnitt aus dem Schema', () => {
    const p = berechneAusschiessPlan(
      eingabe({
        schema: {
          id: 'AS0001',
          name: 'VK 2 × 5',
          raster: { spalten: 2, zeilen: 5 },
          steg: { xUm: 0, yUm: 0 },
          beschnittUm: 0,
        },
      }),
    );
    expect(kurz(p)).toMatchObject({
      nutzenJeBogen: 10,
      nutzenLage: { spalten: 2, zeilen: 5, gedreht: false, anzahl: 10 },
      doppelschnitt: false,
      druckbogen: 72,
      schnitteEndschnitt: { einzeln: 15, gestapelt: 9 },
    });
  });

  it('8 Hilfen: beste Lage, Schnitte, Vorschneiden mit Rest', () => {
    const roh = { breiteUm: 700_000, hoeheUm: 1_000_000 };
    const druck = { breiteUm: 487_000, hoeheUm: 330_000 };
    const l = besteLage(roh, druck);
    expect(l).toEqual({ spalten: 2, zeilen: 2, gedreht: true, anzahl: 4 });
    expect(vorschnitte(roh, druck, l)).toEqual({ einzeln: 6, gestapelt: 4 });
    expect(besteLage({ breiteUm: 100_000, hoeheUm: 100_000 }, roh).anzahl).toBe(0);
    expect(
      schnitteFuerLage({ spalten: 2, zeilen: 2, gedreht: false, anzahl: 4 }, false, false),
    ).toEqual({ einzeln: 3, gestapelt: 2 });
    expect(
      schnitteFuerLage({ spalten: 0, zeilen: 0, gedreht: false, anzahl: 0 }, true, true),
    ).toEqual({ einzeln: 0, gestapelt: 0 });
  });

  it('9 Eigenschaften: Druckbogen im Rohbogen ohne Überlappung, Mengen reichen', () => {
    const flaeche = (min: number, max: number) =>
      fc.record({ breiteUm: fc.integer({ min, max }), hoeheUm: fc.integer({ min, max }) });
    fc.assert(
      fc.property(
        flaeche(100_000, 1_200_000),
        flaeche(50_000, 700_000),
        flaeche(20_000, 300_000),
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 0, max: 200 }),
        (roh, druck, nutzen, exemplare, fest) => {
          const p = berechneAusschiessPlan(
            eingabe({
              rohbogen: roh,
              druckbogen: druck,
              nutzenFormat: nutzen,
              exemplare,
              zuschussFest: fest,
            }),
          );
          const rohFlaeche = { xUm: 0, yUm: 0, ...roh };
          for (const r of p.rohPositionen) expect(liegtIn(r, rohFlaeche)).toBe(true);
          p.rohPositionen.forEach((a, i) =>
            p.rohPositionen.slice(i + 1).forEach((b) => expect(ueberlappen(a, b)).toBe(false)),
          );
          if (p.rohLage !== null) expect(p.rohPositionen).toHaveLength(p.rohLage.anzahl);
          if (p.druckbogen !== null && p.nutzenJeBogen !== null) {
            expect((p.druckbogenNetto ?? 0) * p.nutzenJeBogen >= exemplare).toBe(true);
            expect(p.druckbogen).toBe((p.druckbogenNetto ?? 0) + p.zuschuss);
          }
          if (p.rohbogen !== null && p.druckbogen !== null) {
            expect((p.druckbogenAusRoh ?? 0) >= p.druckbogen).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
