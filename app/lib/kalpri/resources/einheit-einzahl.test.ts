import { describe, expect, it } from 'vitest';
import { BEISPIEL_LAGER, BEISPIEL_PRODUKTION, rechneKalkulation, type Kalkulation } from './index';

// T113: Menge 1 in der Einzahl („1 Auftrag“ statt „1 Aufträge“)

describe('T113 Einheit in der Einzahl', () => {
  it('Datencheck einmal je Auftrag: „Auftrag“', () => {
    const k: Kalkulation = {
      id: 'K-0001',
      titel: 'X',
      auflagen: [100],
      einheit: 'Stueck',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-VORSTUFE',
          schrittId: 'S0004',
          menge: { art: 'auftrag' },
        },
      ],
    };
    const z = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-11-10').auflagen[0]
      ?.zeilen[0];
    expect(z?.menge).toBe(1);
    expect(z?.einheit).toBe('Auftrag');
  });
});
