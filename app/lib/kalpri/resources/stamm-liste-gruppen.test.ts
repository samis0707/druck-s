import { describe, expect, it } from 'vitest';
import { listenUntergruppen } from './index';

// T173: Untergruppen in Listen (z. B. Papiername), Reihenfolge des ersten Auftretens

describe('listenUntergruppen (T173)', () => {
  const e = [
    { n: 'Bilderdruck matt', g: 135 },
    { n: 'Offset', g: 90 },
    { n: 'bilderdruck MATT ', g: 300 },
  ];
  it('gleiche Namen (ohne Groß-/Kleinschreibung) zusammen; Einzelne ohne Kopf', () => {
    expect(listenUntergruppen(e, { untergruppe: (x) => x.n })).toEqual([
      { titel: 'Bilderdruck matt', eintraege: [e[0], e[2]] },
      { titel: null, eintraege: [e[1]] },
    ]);
  });
  it('ohne Untergruppe: eine Gruppe ohne Titel', () => {
    expect(listenUntergruppen(e, {})).toEqual([{ titel: null, eintraege: e }]);
  });
});
