import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  arbeitsschrittStatus,
  leistungAmPlatz,
  plaetzeFuerSchritt,
  type Produktion,
} from './index';

// T146: Tätigkeit ohne eigene Leistung rechnet mit der Nettogeschwindigkeit der Maschine

function falz(leistungJeStunde: number | undefined): Produktion {
  return {
    ...BEISPIEL_PRODUKTION,
    arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
      p.id === 'AP-FALZ-A'
        ? {
            ...p,
            ...(leistungJeStunde === undefined ? {} : { leistungJeStunde }),
            schritte: [
              ...p.schritte.filter((s) => s.schrittId !== 'S0012'),
              { schrittId: 'S0012' },
            ],
          }
        : p,
    ),
  };
}

describe('Nettogeschwindigkeit der Maschine (T146)', () => {
  it('ohne Angabe: Tätigkeit ohne Leistung rechnet nicht', () => {
    const p = falz(undefined);
    expect(leistungAmPlatz(p, 'AP-FALZ-A', 'S0012')).toBeNull();
    expect(plaetzeFuerSchritt(p, 'S0012').find((x) => x.id === 'AP-FALZ-A')?.rechnet).toBe(false);
  });

  it('mit 8.000 je Stunde: Altarfalz rechnet mit 8.000 Nutzen je Stunde, Status ok', () => {
    const p = falz(8000);
    expect(leistungAmPlatz(p, 'AP-FALZ-A', 'S0012')).toMatchObject({
      menge: 8000,
      einheit: 'Nutzen',
    });
    const s = p.arbeitsschritte.find((x) => x.id === 'S0012');
    if (!s) throw new Error('S0012');
    expect(arbeitsschrittStatus(p, s).stand).toBe('ok');
  });

  it('eigene Leistung der Tätigkeit geht vor', () => {
    const eigene = leistungAmPlatz(BEISPIEL_PRODUKTION, 'AP-FALZ-A', 'S0011');
    expect(leistungAmPlatz(falz(8000), 'AP-FALZ-A', 'S0011')).toEqual(eigene);
  });
});
