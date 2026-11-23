import { describe, expect, it } from 'vitest';
import { BEISPIEL_PRODUKTION, materialNutzung, type Produktion } from './index';

function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const platz = (id: string) => {
    const a = p.arbeitsplaetze?.find((x) => x.id === id);
    if (!a) throw new Error(`${id} fehlt`);
    return a;
  };
  const lfp = platz('AP-LFP');
  const druck = lfp.schritte[0];
  if (!druck) throw new Error('Schritt fehlt');
  druck.verbrauch = [
    { materialId: 'TI-C', menge: 1.5, je: 'm2' },
    { materialId: 'TI-K', menge: 1.5, je: 'm2' },
  ];
  const oesen = platz('AP-KLEIN').schritte.find((s) => s.schrittId === 'S0015');
  if (!oesen) throw new Error('Ösen fehlen');
  oesen.verbrauch = [{ materialId: 'OESE', menge: 1, je: 'Stueck' }];
  platz('AP-TIEGEL').auspraegungen = [
    {
      name: 'Digitalkarton',
      bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: ' L4 ' }],
      wirkung: { leistungProzent: -20 },
    },
    {
      name: 'Digitalkarton dick',
      bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: 'L4' }],
      wirkung: { zuschussFest: 10 },
    },
  ];
  // Tinte K auch am Inkjet
  const ink = platz('AP-INK4C').schritte[0];
  if (!ink) throw new Error('Inkjet fehlt');
  ink.verbrauch = [{ materialId: 'TI-K', menge: 0.5, je: 'Stueck' }];
  return p;
}

describe('Material nach Maschinen', () => {
  it('Verbrauch und Ausprägungen, je Platz einmal, in der Reihenfolge der Plätze', () => {
    const n = materialNutzung(produktion());
    expect(n.get('TI-C')).toEqual([
      {
        platzId: 'AP-LFP',
        platzName: 'Großformatdruck Latex',
        wofuer: ['Verbrauch Großformatdruck'],
      },
    ]);
    expect(n.get('TI-K')?.map((e) => e.platzId)).toEqual(['AP-INK4C', 'AP-LFP']);
    expect(n.get('OESE')).toEqual([
      { platzId: 'AP-KLEIN', platzName: 'Kleine Maschinen', wofuer: ['Verbrauch Ösen'] },
    ]);
    expect(n.get('L4')).toEqual([
      {
        platzId: 'AP-TIEGEL',
        platzName: 'Heidelberger Tiegel',
        wofuer: ['Ausprägung Digitalkarton', 'Ausprägung Digitalkarton dick'],
      },
    ]);
    expect(n.has('L1')).toBe(false);
  });

  it('ohne Plätze: leer', () => {
    expect(materialNutzung({ ...BEISPIEL_PRODUKTION, arbeitsplaetze: [] }).size).toBe(0);
  });
});
