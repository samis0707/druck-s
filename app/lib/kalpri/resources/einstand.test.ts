import { describe, expect, it } from 'vitest';
import {
  einstandBetrag,
  einstandText,
  LieferantSchema,
  preisVergleichswerte,
  PreisSchema,
  type Material,
  type Preis,
} from './index';

// T182: Einstandspreis (Liste − Rabatt − Skonto + Zuschläge + Bezugskosten ÷ Bestellmenge).

const draht = {
  id: 'M0900',
  form: 'Menge',
  sorte: 'Heftdraht Rolle 2 kg',
  einheit: 'm',
} as Material;

const rolle = (einstand?: Preis['einstand']): Preis => ({
  id: 'P0900',
  materialId: 'M0900',
  lieferant: 'Sprintis',
  gueltigAb: '2026-11-23',
  basis: 'einheit',
  einheitName: 'Rolle',
  inhalt: 1200,
  staffel: [{ ab: 1, betragZehntelcent: 15000 }],
  ...(einstand === undefined ? {} : { einstand }),
});

describe('T182 Einstand', () => {
  it('ohne Einstand unverändert', () => {
    expect(einstandBetrag(rolle(), 15000)).toBe(15000);
    expect(einstandText(rolle())).toBeNull();
    expect(preisVergleichswerte(draht, rolle()).je1000?.zehntelcent).toBe(12_500);
  });

  it('Versand 15 € je Bestellung ÷ 2 Rollen → 22,50 € je Rolle; je 1.000 m 18,75 €', () => {
    const p = rolle({ bezugskostenZehntelcent: 15000, bestellmenge: 2 });
    expect(einstandBetrag(p, 15000)).toBe(22500);
    const w = preisVergleichswerte(draht, p);
    expect(w.jeEinheit?.zehntelcent).toBe(22500);
    expect(w.je1000?.zehntelcent).toBe(18_750);
    expect(einstandText(p)).toBe('Liste 15,00 € + Versand 15,00 € ÷ 2 = 22,50 € je Rolle');
  });

  it('Rabatt und Skonto wirken nacheinander, Zuschlag je Gebinde kommt dazu', () => {
    const p = rolle({ rabattProzent: 10, skontoProzent: 3, zuschlagZehntelcent: 500 });
    // 15,00 × 0,9 × 0,97 = 13,095 + 0,50 = 13,595
    expect(einstandBetrag(p, 15000)).toBeCloseTo(13595, 6);
    expect(einstandText(p)).toBe(
      'Liste 15,00 € − 10 % Rabatt − 3 % Skonto + Zuschläge 0,50 € = 13,60 € je Rolle',
    );
  });

  it('je 1.000: Bezugskosten auf Stück verteilt', () => {
    const p: Preis = {
      id: 'P1',
      materialId: 'M1',
      lieferant: 'X',
      gueltigAb: '2026-11-23',
      basis: 'je1000',
      betragZehntelcent: 50000,
      einstand: { bezugskostenZehntelcent: 10000, bestellmenge: 5000 },
    };
    // 10 € ÷ 5.000 Bogen × 1.000 = 2 € je 1.000
    expect(einstandBetrag(p, 50000)).toBe(52000);
  });

  it('Schema: Bezugskosten ohne Bestellmenge abgelehnt; Partner mit Skonto/Rabatt gültig', () => {
    expect(PreisSchema.safeParse(rolle({ bezugskostenZehntelcent: 15000 })).success).toBe(false);
    expect(PreisSchema.safeParse(rolle({ skontoProzent: 120 })).success).toBe(false);
    expect(PreisSchema.safeParse(rolle({ skontoProzent: 3 })).success).toBe(true);
    expect(
      LieferantSchema.safeParse({ id: 'LF-0001', name: 'Ovol', skontoProzent: 3, rabattProzent: 0 })
        .success,
    ).toBe(true);
  });
});
