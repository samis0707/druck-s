import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { berechneRollenPlan, liegtIn, ueberlappen, type RollenPlanEingabe } from './index';

/** Banner 50 × 70 cm auf Rolle 160 cm, Rand 10 mm, 25 Stück, Zuschuss 1 + 5 %. */
function eingabe(teil: Partial<RollenPlanEingabe> = {}): RollenPlanEingabe {
  return {
    rollenbreiteUm: 1_600_000,
    nutzenFormat: { breiteUm: 500_000, hoeheUm: 700_000 },
    beschnittUm: 3000,
    randUm: 10_000,
    exemplare: 25,
    zuschussFest: 1,
    zuschussProzent: 5,
    ...teil,
  };
}

describe('Rollenplan (Zustand Schema) – T92', () => {
  it('1 Banner: 3 nebeneinander, 11 Abschnitte, Laufmeter und m²', () => {
    const p = berechneRollenPlan(eingabe());
    expect({ ...p, nutzenPositionen: p.nutzenPositionen.length }).toEqual({
      zustand: 'schema',
      art: 'rolle',
      rollenbreiteUm: 1_600_000,
      nutzbarUm: 1_580_000,
      abschnittFormat: { breiteUm: 1_600_000, hoeheUm: 706_000 },
      nutzenJeAbschnitt: 3,
      nutzenHerkunft: 'berechnet',
      nutzenLage: { spalten: 3, zeilen: 1, gedreht: false, anzahl: 3 },
      nutzenPositionen: 3,
      passtNicht: false,
      // 25 ÷ 3 = 9; Zuschuss aufrunden(9 × 5 %) + 1 = 2
      abschnitteNetto: 9,
      zuschuss: 2,
      abschnitte: 11,
      laufmeter: 7.766,
      quadratmeter: 12.426,
      papierGenutztProzent: 93,
    });
  });

  it('2 Lage der Nutzen: ab Rand + Beschnitt, Abstand Nutzen + 2 × Beschnitt', () => {
    expect(berechneRollenPlan(eingabe()).nutzenPositionen).toEqual([
      { xUm: 13_000, yUm: 3000, breiteUm: 500_000, hoeheUm: 700_000 },
      { xUm: 519_000, yUm: 3000, breiteUm: 500_000, hoeheUm: 700_000 },
      { xUm: 1_025_000, yUm: 3000, breiteUm: 500_000, hoeheUm: 700_000 },
    ]);
  });

  it('3 gedreht ist kürzer je Nutzen: 5 nebeneinander, hochkant', () => {
    const p = berechneRollenPlan(
      eingabe({ nutzenFormat: { breiteUm: 1_000_000, hoeheUm: 300_000 } }),
    );
    expect(p.nutzenLage).toEqual({ spalten: 5, zeilen: 1, gedreht: true, anzahl: 5 });
    expect(p.abschnittFormat).toEqual({ breiteUm: 1_600_000, hoeheUm: 1_006_000 });
    expect(p.nutzenPositionen[0]).toEqual({
      xUm: 13_000,
      yUm: 3000,
      breiteUm: 300_000,
      hoeheUm: 1_000_000,
    });
    expect([p.abschnitte, p.laufmeter]).toEqual([7, 7.042]);
  });

  it('4 Nutzen von Hand: keine Positionen', () => {
    const p = berechneRollenPlan(eingabe({ nutzenVonHand: 2 }));
    expect([p.nutzenHerkunft, p.nutzenJeAbschnitt, p.abschnitte, p.laufmeter]).toEqual([
      'hand',
      2,
      15,
      10.59,
    ]);
    expect(p.nutzenPositionen).toEqual([]);
  });

  it('5 passt nicht: nichts gerechnet', () => {
    const p = berechneRollenPlan(
      eingabe({ nutzenFormat: { breiteUm: 1_700_000, hoeheUm: 1_800_000 } }),
    );
    expect([p.passtNicht, p.abschnittFormat, p.abschnitte, p.laufmeter]).toEqual([
      true,
      null,
      null,
      null,
    ]);
  });

  it('6 Zuschuss ohne Gleitkomma-Rest (7 % von 300 = 21)', () => {
    const p = berechneRollenPlan(
      eingabe({
        exemplare: 900,
        nutzenFormat: { breiteUm: 500_000, hoeheUm: 500_000 },
        zuschussFest: 0,
        zuschussProzent: 7,
      }),
    );
    expect([p.abschnitteNetto, p.zuschuss, p.abschnitte]).toEqual([300, 21, 321]);
  });

  it('7 Eigenschaften: Nutzen im nutzbaren Bereich, ohne Überlappung, Mengen reichen', () => {
    const flaeche = (min: number, max: number) =>
      fc.record({ breiteUm: fc.integer({ min, max }), hoeheUm: fc.integer({ min, max }) });
    fc.assert(
      fc.property(
        fc.integer({ min: 300_000, max: 3_200_000 }),
        flaeche(20_000, 2_000_000),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 30_000 }),
        fc.integer({ min: 1, max: 5000 }),
        (rollenbreiteUm, nutzenFormat, beschnittUm, randUm, exemplare) => {
          const p = berechneRollenPlan(
            eingabe({ rollenbreiteUm, nutzenFormat, beschnittUm, randUm, exemplare }),
          );
          const nutzbar = {
            xUm: randUm,
            yUm: 0,
            breiteUm: rollenbreiteUm - 2 * randUm,
            hoeheUm: p.abschnittFormat?.hoeheUm ?? 0,
          };
          for (const r of p.nutzenPositionen) expect(liegtIn(r, nutzbar)).toBe(true);
          p.nutzenPositionen.forEach((a, i) =>
            p.nutzenPositionen.slice(i + 1).forEach((b) => expect(ueberlappen(a, b)).toBe(false)),
          );
          if (p.nutzenJeAbschnitt !== null) {
            expect(p.nutzenPositionen).toHaveLength(p.nutzenJeAbschnitt);
            expect((p.abschnitteNetto ?? 0) * p.nutzenJeAbschnitt >= exemplare).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
