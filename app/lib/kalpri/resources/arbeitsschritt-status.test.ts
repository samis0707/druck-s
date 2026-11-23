import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  arbeitsschrittStatus,
  type Arbeitsschritt,
  type Produktion,
} from './index';

function schritt(id: string): Arbeitsschritt {
  const gefunden = BEISPIEL_PRODUKTION.arbeitsschritte.find((s) => s.id === id);
  if (!gefunden) throw new Error(`Schritt ${id} fehlt`);
  return gefunden;
}

describe('arbeitsschrittStatus', () => {
  it('S0014 Bohren: ok', () => {
    expect(arbeitsschrittStatus(BEISPIEL_PRODUKTION, schritt('S0014'))).toEqual({
      stand: 'ok',
      gruende: [],
    });
  });

  it('S0015 Ösen: Hinweis, weil kein Platz eine Leistung hat', () => {
    expect(arbeitsschrittStatus(BEISPIEL_PRODUKTION, schritt('S0015'))).toEqual({
      stand: 'hinweis',
      gruende: ['kein Arbeitsplatz mit Leistung – rechnet nicht'],
    });
  });

  it('S0022 Mailing falten: Fehler, weil kein Platz ihn kann', () => {
    expect(arbeitsschrittStatus(BEISPIEL_PRODUKTION, schritt('S0022'))).toEqual({
      stand: 'fehler',
      gruende: ['kein Arbeitsplatz kann ihn'],
    });
  });

  it('S0014 mit inaktivem AP-KLEIN: Fehler, weil kein aktiver Platz ihn kann', () => {
    const ohneKlein: Produktion = {
      ...BEISPIEL_PRODUKTION,
      arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
        p.id === 'AP-KLEIN' ? { ...p, inaktiv: true } : p,
      ),
    };
    expect(arbeitsschrittStatus(ohneKlein, schritt('S0014'))).toEqual({
      stand: 'fehler',
      gruende: ['kein Arbeitsplatz kann ihn'],
    });
  });
});
