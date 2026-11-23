import { describe, expect, it } from 'vitest';
import { BEISPIEL_LAGER, BEISPIEL_PRODUKTION, materialArt, materialVerwendung } from './index';

// T122: Bedruckstoff oder Verbrauchsmaterial, und wo es verbraucht wird

describe('Materialart (T122)', () => {
  it('1 Papier, Kuvert: Bedruckstoff; sonstiges und Menge: Verbrauch', () => {
    expect(materialArt({ form: 'Bogen', kategorie: 'papier' })).toBe('bedruckstoff');
    expect(materialArt({ form: 'Stueck', kategorie: 'kuvert' })).toBe('bedruckstoff');
    expect(materialArt({ form: 'Rolle', kategorie: 'sonstiges' })).toBe('verbrauch');
    expect(materialArt({ form: 'Bogen', kategorie: 'sonstiges' })).toBe('verbrauch');
    expect(materialArt({ form: 'Menge', kategorie: 'sonstiges' })).toBe('verbrauch');
  });

  it('2 Beispiel-Lager: alles Bedruckstoff', () => {
    expect(BEISPIEL_LAGER.materialien.every((m) => materialArt(m) === 'bedruckstoff')).toBe(true);
  });

  it('3 Verwendung an der Maschine und am Schritt', () => {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as typeof BEISPIEL_PRODUKTION;
    const platz = p.arbeitsplaetze?.[0];
    const schritt = platz?.schritte[0];
    if (!platz || !schritt) throw new Error('Platz');
    platz.verbrauchsmaterial = [
      { id: 'V1', gruppe: 'Folie', materialId: 'M9', menge: 1, je: 'Bogen', standard: true },
    ];
    schritt.verbrauch = [{ materialId: 'M9', menge: 1, je: 'Bogen' }];
    const name = p.arbeitsschritte.find((s) => s.id === schritt.schrittId)?.name;
    expect(materialVerwendung(p, 'M9')).toEqual([
      `${platz.name} · Folie`,
      `${platz.name} · ${name}`,
    ]);
    expect(materialVerwendung(p, 'L1')).toEqual([]);
  });
});
