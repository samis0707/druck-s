import { describe, expect, it } from 'vitest';
import { BEISPIEL_PRODUKTION, arbeitsplatzStatus, type Arbeitsplatz } from './index';

function platz(id: string): Arbeitsplatz {
  const gefunden = BEISPIEL_PRODUKTION.arbeitsplaetze?.find((p) => p.id === id);
  if (!gefunden) throw new Error(`Platz ${id} fehlt`);
  return gefunden;
}

describe('arbeitsplatzStatus', () => {
  it('AP-TON5C: Teilkosten und vorläufiger Satz sind Hinweise', () => {
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, platz('AP-TON5C'))).toEqual({
      stand: 'hinweis',
      gruende: ['Teilkosten nicht hinterlegt', 'Stundensatz vorläufig'],
    });
  });

  it('AP-KLEIN: fehlende Leistung ist ein Fehler', () => {
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, platz('AP-KLEIN'))).toEqual({
      stand: 'fehler',
      gruende: [
        'Teilkosten nicht hinterlegt',
        'Ösen: Leistung fehlt – rechnet nicht',
        'Heften: Leistung fehlt – rechnet nicht',
      ],
    });
  });

  it('ohne Satz und ohne Schritte: Fehler', () => {
    const neu: Arbeitsplatz = { id: 'AP-0001', name: 'Neu', schritte: [] };
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, neu)).toEqual({
      stand: 'fehler',
      gruende: ['Stundensatz fehlt – rechnet nicht', 'Keine Arbeitsschritte'],
    });
  });

  it('vollständiger Satz ohne vorläufig: ok', () => {
    const voll: Arbeitsplatz = {
      ...platz('AP-TON5C'),
      stundensatzTeilZehntelcent: 120_000,
      stundensatzVorlaeufig: undefined,
    };
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, voll)).toEqual({
      stand: 'ok',
      gruende: [],
    });
  });

  it('derselbe vollständige Platz inaktiv: Hinweis', () => {
    const inaktiv: Arbeitsplatz = {
      ...platz('AP-TON5C'),
      stundensatzTeilZehntelcent: 120_000,
      stundensatzVorlaeufig: undefined,
      inaktiv: true,
    };
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, inaktiv)).toEqual({
      stand: 'hinweis',
      gruende: ['inaktiv (Ersatzgerät, gesperrt)'],
    });
  });

  it('Fremdarbeit ohne Lieferant: Hinweis', () => {
    const fremd: Arbeitsplatz = { id: 'AP-X', name: 'X', schritte: [], fremdarbeit: {} };
    expect(arbeitsplatzStatus(BEISPIEL_PRODUKTION, fremd)).toEqual({
      stand: 'hinweis',
      gruende: ['Lieferant nicht hinterlegt'],
    });
  });
});
