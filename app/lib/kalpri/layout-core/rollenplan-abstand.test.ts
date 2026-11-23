import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { berechneRollenPlan, ueberlappen, type RollenPlanEingabe } from './index';

// T105: Abstand zwischen den Nutzen auf der Rolle (quer und längs)

/** Plakat A1 (59,4 × 84,1 cm) ohne Beschnitt, Rand 5 mm, 50 Stück. */
function a1(rolleMm: number, abstandUm?: number): RollenPlanEingabe {
  return {
    rollenbreiteUm: rolleMm * 1000,
    nutzenFormat: { breiteUm: 594_000, hoeheUm: 841_000 },
    beschnittUm: 0,
    randUm: 5000,
    exemplare: 50,
    ...(abstandUm === undefined ? {} : { abstandUm }),
  };
}

describe('T105 Rollenplan mit Abstand', () => {
  it('ohne Abstand bzw. Abstand 0: Ergebnis wie bisher', () => {
    expect(berechneRollenPlan(a1(1372, 0))).toEqual(berechneRollenPlan(a1(1372)));
  });

  it('A1 auf 137,2 cm, Abstand 10 mm: 2 hochkant, Abschnitt 85,1 cm, 25 Abschnitte', () => {
    const p = berechneRollenPlan(a1(1372, 10_000));
    expect(p.nutzenLage).toEqual({ spalten: 2, zeilen: 1, gedreht: false, anzahl: 2 });
    expect(p.abschnittFormat).toEqual({ breiteUm: 1_372_000, hoeheUm: 851_000 });
    expect(p.abschnitte).toBe(25);
    expect(p.laufmeter).toBe(21.275);
    expect(p.quadratmeter).toBe(29.189);
    expect(p.papierGenutztProzent).toBe(86);
    expect(p.nutzenPositionen.map((r) => r.xUm)).toEqual([5000, 609_000]);
  });

  it('A1 auf 91,4 cm, Abstand 10 mm: 1 gedreht (quer), Abschnitt 60,4 cm', () => {
    const p = berechneRollenPlan(a1(914, 10_000));
    expect(p.nutzenLage).toEqual({ spalten: 1, zeilen: 1, gedreht: true, anzahl: 1 });
    expect(p.abschnittFormat).toEqual({ breiteUm: 914_000, hoeheUm: 604_000 });
  });

  it('Abstand nimmt Platz: 3 × 50 cm passen auf 151,5 cm nur ohne Abstand', () => {
    const ohne = berechneRollenPlan({
      ...a1(1520),
      nutzenFormat: { breiteUm: 500_000, hoeheUm: 900_000 },
      randUm: 0,
    });
    const mit = berechneRollenPlan({
      ...a1(1515, 10_000),
      nutzenFormat: { breiteUm: 500_000, hoeheUm: 900_000 },
      randUm: 0,
    });
    expect(ohne.nutzenJeAbschnitt).toBe(3);
    expect(mit.nutzenJeAbschnitt).toBe(2);
  });

  it('Eigenschaft: Nutzen überlappen nicht, liegen in der Rolle, Lücke ≥ Abstand', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 600, max: 1600 }),
        fc.integer({ min: 100, max: 900 }),
        fc.integer({ min: 100, max: 1200 }),
        fc.integer({ min: 0, max: 30 }),
        (rolle, b, h, abstand) => {
          const p = berechneRollenPlan({
            rollenbreiteUm: rolle * 1000,
            nutzenFormat: { breiteUm: b * 1000, hoeheUm: h * 1000 },
            beschnittUm: 3000,
            randUm: 5000,
            abstandUm: abstand * 1000,
            exemplare: 10,
          });
          const n = p.nutzenPositionen;
          for (let i = 0; i < n.length; i++) {
            const r = n[i];
            if (!r) continue;
            expect(r.xUm + r.breiteUm + 3000 <= rolle * 1000 - 5000).toBe(true);
            const s = n[i + 1];
            if (s) {
              expect(ueberlappen(r, s)).toBe(false);
              expect(s.xUm - (r.xUm + r.breiteUm) >= 6000 + abstand * 1000).toBe(true);
            }
          }
        },
      ),
    );
  });
});
