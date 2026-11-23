import { describe, expect, it } from 'vitest';
import { BEISPIEL_LAGER, BEISPIEL_PRODUKTION, bereitschaftPruefen, type Produktion } from './index';

const STICHTAG = '2026-10-31';

function mitInaktivemKlein(): Produktion {
  return {
    ...BEISPIEL_PRODUKTION,
    arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
      p.id === 'AP-KLEIN' ? { ...p, inaktiv: true } : p,
    ),
  };
}

describe('bereitschaftPruefen', () => {
  it('1: Fehler und Hinweise', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    expect([r.fehler, r.hinweise]).toEqual([13, 16]);
  });

  it('2: erster Befund', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    expect(r.befunde[0]).toEqual({
      stand: 'fehler',
      bereich: 'Arbeitsplatz',
      id: 'AP-KLEIN',
      name: 'Kleine Maschinen',
      gruende: [
        'Teilkosten nicht hinterlegt',
        'Ösen: Leistung fehlt – rechnet nicht',
        'Heften: Leistung fehlt – rechnet nicht',
      ],
    });
  });

  it('3: IDs der Fehler in Reihenfolge', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    expect(r.befunde.filter((b) => b.stand === 'fehler').map((b) => b.id)).toEqual([
      'AP-KLEIN',
      'AP-HAND',
      'S0010',
      'S0022',
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'L6',
      'L7',
      'L8',
      'L9',
    ]);
  });

  it('4: Gründe von L1', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    const l1 = r.befunde.find((b) => b.id === 'L1');
    expect(l1?.gruende).toEqual(['kein gültiger Preis ab 31.10.2026']);
  });

  it('5: Hinweise im Bereich Arbeitsschritt', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    expect(
      r.befunde
        .filter((b) => b.stand === 'hinweis' && b.bereich === 'Arbeitsschritt')
        .map((b) => b.id),
    ).toEqual(['S0015', 'S0017', 'S0021']);
  });

  it('6: Sammelplätze', () => {
    const r = bereitschaftPruefen(BEISPIEL_PRODUKTION, BEISPIEL_LAGER, STICHTAG);
    expect(r.sammelplaetze.map((s) => s.id)).toEqual(['AP-VORSTUFE', 'AP-FALZ-A', 'AP-KLEIN']);
    expect(r.sammelplaetze.find((s) => s.id === 'AP-KLEIN')?.schritte).toEqual([
      'Bohren',
      'Ösen',
      'Ecken runden',
      'Heften',
    ]);
  });

  it('7: AP-KLEIN inaktiv', () => {
    const r = bereitschaftPruefen(mitInaktivemKlein(), BEISPIEL_LAGER, STICHTAG);
    expect(r.befunde.filter((b) => b.stand === 'fehler').map((b) => b.id)).toEqual([
      'AP-HAND',
      'S0010',
      'S0014',
      'S0015',
      'S0016',
      'S0017',
      'S0022',
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'L6',
      'L7',
      'L8',
      'L9',
    ]);
    expect([r.fehler, r.hinweise]).toEqual([16, 14]);
    expect(
      r.befunde
        .filter((b) => b.stand === 'hinweis' && b.bereich === 'Arbeitsschritt')
        .map((b) => b.id),
    ).toEqual(['S0021']);
    expect(r.sammelplaetze.map((s) => s.id)).toEqual(['AP-VORSTUFE', 'AP-FALZ-A']);
  });
});
