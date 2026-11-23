import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  rechneKalkulation,
  rechnePapierweg,
  type Material,
  type Teil,
} from './index';

/** Formate in mm (b × h). */
type Mm = { b: number; h: number };
type Fall = {
  roh: Mm;
  druck?: Mm;
  end: Mm;
  offen?: Mm;
  beschnitt?: number;
  hand?: number;
  rand?: number;
  fest?: number;
  prozent?: number;
  auflage: number;
  je: number;
};

const um = (m: Mm) => ({ breiteUm: m.b * 1000, hoeheUm: m.h * 1000 });

/**
 * 40 feste Fälle (zufällig erzeugt, Startwert 2026) mit den Zahlen, die `rechnePapierweg` VOR T89
 * geliefert hat: [Nutzen je Bogen, Druckbogen, Druckbogen je Rohbogen, Rohbogen, Schnitte
 * Vorschneiden einzeln, Schnitte Endschnitt einzeln, Papier genutzt %]. Nach T89 kommen sie aus
 * dem Ausschießplan und müssen gleich bleiben.
 */
const FAELLE: [Fall, (number | null)[]][] = [
  [
    {
      roh: { b: 445, h: 203 },
      druck: { b: 277, h: 177 },
      end: { b: 30, h: 146 },
      hand: 24,
      rand: 0,
      prozent: 3,
      auflage: 10,
      je: 6,
    },
    [24, 4, 1, 4, 2, null, 214],
  ],
  [
    {
      roh: { b: 839, h: 207 },
      druck: { b: 699, h: 286 },
      end: { b: 206, h: 31 },
      offen: { b: 44, h: 295 },
      hand: 23,
      fest: 0,
      prozent: 3,
      auflage: 19990,
      je: 1,
    },
    [23, 897, null, null, null, null, 149],
  ],
  [
    {
      roh: { b: 998, h: 763 },
      druck: { b: 205, h: 204 },
      end: { b: 38, h: 300 },
      beschnitt: 2000,
      rand: 5000,
      fest: 3,
      prozent: 1.5,
      auflage: 4176,
      je: 8,
    },
    [null, null, 12, null, 15, null, null],
  ],
  [
    {
      roh: { b: 319, h: 203 },
      druck: { b: 693, h: 395 },
      end: { b: 295, h: 292 },
      offen: { b: 417, h: 300 },
      beschnitt: 0,
      hand: 1,
      rand: 0,
      fest: 5,
      prozent: 7,
      auflage: 283,
      je: 3,
    },
    [1, 914, null, null, null, null, 46],
  ],
  [
    {
      roh: { b: 458, h: 205 },
      druck: { b: 152, h: 694 },
      end: { b: 32, h: 34 },
      offen: { b: 118, h: 279 },
      beschnitt: 2000,
      hand: 15,
      rand: 5000,
      fest: 1,
      auflage: 12655,
      je: 6,
    },
    [15, 5063, null, null, null, null, 468],
  ],
  [
    {
      roh: { b: 996, h: 515 },
      druck: { b: 531, h: 426 },
      end: { b: 33, h: 299 },
      offen: { b: 43, h: 251 },
      beschnitt: 5000,
      hand: 20,
      rand: 0,
      fest: 81,
      prozent: 1.5,
      auflage: 2004,
      je: 6,
    },
    [20, 693, 1, 693, 2, null, 95],
  ],
  [
    {
      roh: { b: 763, h: 202 },
      druck: { b: 154, h: 398 },
      end: { b: 92, h: 275 },
      offen: { b: 201, h: 346 },
      beschnitt: 0,
      hand: 22,
      rand: 5000,
      fest: 57,
      prozent: 1.5,
      auflage: 8955,
      je: 1,
    },
    [22, 472, 1, 472, 2, null, 2496],
  ],
  [
    {
      roh: { b: 564, h: 774 },
      druck: { b: 152, h: 158 },
      end: { b: 196, h: 292 },
      offen: { b: 374, h: 420 },
      beschnitt: 3000,
      hand: 2,
      rand: 0,
      fest: 42,
      prozent: 1.5,
      auflage: 2498,
      je: 2,
    },
    [2, 2578, 15, 172, 18, null, 1308],
  ],
  [
    {
      roh: { b: 994, h: 204 },
      druck: { b: 694, h: 700 },
      end: { b: 36, h: 81 },
      offen: { b: 242, h: 373 },
      beschnitt: 0,
      fest: 0,
      prozent: 3,
      auflage: 2394,
      je: 2,
    },
    [2, 2466, null, null, null, 5, 37],
  ],
  [
    {
      roh: { b: 477, h: 449 },
      druck: { b: 152, h: 197 },
      end: { b: 165, h: 31 },
      offen: { b: 132, h: 364 },
      beschnitt: 3000,
      hand: 1,
      fest: 99,
      prozent: 3,
      auflage: 19992,
      je: 7,
    },
    [1, 144242, 6, 24041, 8, null, 160],
  ],
  [
    {
      roh: { b: 209, h: 876 },
      druck: { b: 205, h: 694 },
      end: { b: 88, h: 292 },
      beschnitt: 3000,
      hand: 8,
      rand: 5000,
      fest: 46,
      prozent: 10,
      auflage: 12,
      je: 1,
    },
    [8, 49, 1, 49, 2, null, 144],
  ],
  [
    {
      roh: { b: 247, h: 930 },
      druck: { b: 216, h: 362 },
      end: { b: 174, h: 33 },
      offen: { b: 101, h: 73 },
      hand: 16,
      rand: 5000,
      fest: 6,
      prozent: 10,
      auflage: 8,
      je: 1,
    },
    [16, 8, 2, 4, 3, null, 151],
  ],
  [
    {
      roh: { b: 529, h: 993 },
      druck: { b: 566, h: 323 },
      end: { b: 100, h: 219 },
      offen: { b: 47, h: 73 },
      beschnitt: 3000,
      hand: 23,
      rand: 0,
      fest: 2,
      prozent: 7,
      auflage: 14,
      je: 3,
    },
    [23, 5, 1, 5, 2, null, 43],
  ],
  [
    {
      roh: { b: 203, h: 978 },
      druck: { b: 537, h: 152 },
      end: { b: 260, h: 63 },
      offen: { b: 312, h: 312 },
      beschnitt: 2000,
      hand: 11,
      rand: 0,
      fest: 94,
      prozent: 0,
      auflage: 11390,
      je: 6,
    },
    [11, 6307, 1, 6307, 2, null, 1312],
  ],
  [
    {
      roh: { b: 930, h: 889 },
      druck: { b: 690, h: 314 },
      end: { b: 296, h: 171 },
      offen: { b: 43, h: 418 },
      beschnitt: 5000,
      hand: 5,
      rand: 3000,
      fest: 88,
      prozent: 0,
      auflage: 7,
      je: 2,
    },
    [5, 91, 2, 46, 3, null, 41],
  ],
  [
    {
      roh: { b: 429, h: 208 },
      end: { b: 34, h: 246 },
      hand: 3,
      fest: 52,
      prozent: 0,
      auflage: 9388,
      je: 4,
    },
    [3, 12570, 1, 12570, 0, null, 28],
  ],
  [
    {
      roh: { b: 208, h: 1000 },
      end: { b: 83, h: 128 },
      offen: { b: 44, h: 415 },
      beschnitt: 3000,
      rand: 3000,
      fest: 48,
      auflage: 6533,
      je: 1,
    },
    [8, 865, 1, 865, 0, 20, 70],
  ],
  [
    {
      roh: { b: 207, h: 458 },
      druck: { b: 153, h: 151 },
      end: { b: 33, h: 116 },
      offen: { b: 60, h: 89 },
      hand: 1,
      rand: 0,
      prozent: 0,
      auflage: 16755,
      je: 3,
    },
    [1, 50265, 3, 16755, 4, null, 23],
  ],
  [
    {
      roh: { b: 204, h: 991 },
      druck: { b: 486, h: 159 },
      end: { b: 36, h: 34 },
      offen: { b: 419, h: 419 },
      beschnitt: 2000,
      hand: 2,
      rand: 5000,
      fest: 66,
      prozent: 0,
      auflage: 13,
      je: 7,
    },
    [2, 112, 2, 56, 3, null, 454],
  ],
  [
    {
      roh: { b: 223, h: 200 },
      druck: { b: 697, h: 521 },
      end: { b: 293, h: 38 },
      offen: { b: 231, h: 41 },
      beschnitt: 5000,
      rand: 5000,
      fest: 61,
      auflage: 19987,
      je: 8,
    },
    [26, 6211, null, null, null, 56, 68],
  ],
  [
    {
      roh: { b: 895, h: 340 },
      druck: { b: 399, h: 197 },
      end: { b: 269, h: 78 },
      offen: { b: 295, h: 76 },
      beschnitt: 5000,
      hand: 8,
      fest: 78,
      prozent: 0,
      auflage: 3034,
      je: 7,
    },
    [8, 2733, 2, 1367, 3, null, 228],
  ],
  [
    {
      roh: { b: 264, h: 863 },
      end: { b: 36, h: 300 },
      offen: { b: 44, h: 323 },
      beschnitt: 0,
      hand: 24,
      rand: 5000,
      fest: 100,
      prozent: 10,
      auflage: 19988,
      je: 6,
    },
    [24, 5597, 1, 5597, 0, null, 150],
  ],
  [
    {
      roh: { b: 367, h: 992 },
      druck: { b: 158, h: 646 },
      end: { b: 119, h: 234 },
      offen: { b: 261, h: 340 },
      beschnitt: 5000,
      hand: 21,
      rand: 5000,
      fest: 49,
      auflage: 14650,
      je: 8,
    },
    [21, 5630, 2, 2815, 3, null, 1826],
  ],
  [
    {
      roh: { b: 206, h: 201 },
      druck: { b: 443, h: 398 },
      end: { b: 33, h: 300 },
      offen: { b: 127, h: 412 },
      beschnitt: 0,
      auflage: 7,
      je: 5,
    },
    [3, 12, null, null, null, 6, 89],
  ],
  [
    {
      roh: { b: 238, h: 203 },
      druck: { b: 343, h: 151 },
      end: { b: 136, h: 37 },
      offen: { b: 40, h: 42 },
      beschnitt: 3000,
      hand: 20,
      fest: 41,
      prozent: 1.5,
      auflage: 3,
      je: 1,
    },
    [20, 43, null, null, null, null, 65],
  ],
  [
    {
      roh: { b: 231, h: 278 },
      druck: { b: 457, h: 157 },
      end: { b: 197, h: 299 },
      offen: { b: 414, h: 40 },
      beschnitt: 3000,
      rand: 5000,
      fest: 4,
      prozent: 0,
      auflage: 7253,
      je: 3,
    },
    [3, 7257, null, null, null, 8, 69],
  ],
  [
    {
      roh: { b: 352, h: 841 },
      end: { b: 38, h: 222 },
      offen: { b: 173, h: 41 },
      hand: 22,
      fest: 95,
      prozent: 3,
      auflage: 18106,
      je: 2,
    },
    [22, 1791, 1, 1791, 0, null, 53],
  ],
  [
    {
      roh: { b: 203, h: 200 },
      druck: { b: 154, h: 453 },
      end: { b: 71, h: 180 },
      offen: { b: 113, h: 43 },
      beschnitt: 5000,
      hand: 20,
      rand: 5000,
      prozent: 7,
      auflage: 10,
      je: 5,
    },
    [20, 4, null, null, null, null, 139],
  ],
  [
    {
      roh: { b: 329, h: 203 },
      end: { b: 32, h: 187 },
      beschnitt: 2000,
      hand: 4,
      rand: 3000,
      fest: 16,
      prozent: 0,
      auflage: 9,
      je: 1,
    },
    [4, 19, 1, 19, 0, null, 36],
  ],
  [
    {
      roh: { b: 917, h: 992 },
      druck: { b: 422, h: 275 },
      end: { b: 244, h: 275 },
      offen: { b: 379, h: 109 },
      beschnitt: 2000,
      hand: 2,
      rand: 3000,
      fest: 77,
      prozent: 3,
      auflage: 7,
      je: 7,
    },
    [2, 103, 6, 18, 8, null, 71],
  ],
  [
    {
      roh: { b: 201, h: 200 },
      druck: { b: 153, h: 182 },
      end: { b: 81, h: 31 },
      offen: { b: 47, h: 283 },
      beschnitt: 2000,
      hand: 1,
      rand: 3000,
      fest: 23,
      prozent: 1.5,
      auflage: 10929,
      je: 2,
    },
    [1, 22209, 1, 22209, 2, null, 48],
  ],
  [
    {
      roh: { b: 265, h: 787 },
      druck: { b: 446, h: 692 },
      end: { b: 226, h: 37 },
      offen: { b: 155, h: 43 },
      beschnitt: 2000,
      hand: 2,
      rand: 0,
      fest: 41,
      prozent: 10,
      auflage: 9405,
      je: 6,
    },
    [2, 31078, null, null, null, null, 4],
  ],
  [
    {
      roh: { b: 1000, h: 999 },
      end: { b: 37, h: 240 },
      offen: { b: 71, h: 386 },
      hand: 11,
      rand: 0,
      fest: 95,
      prozent: 3,
      auflage: 19198,
      je: 8,
    },
    [11, 14477, 1, 14477, 0, null, 30],
  ],
  [
    {
      roh: { b: 203, h: 704 },
      druck: { b: 699, h: 230 },
      end: { b: 150, h: 38 },
      beschnitt: 3000,
      rand: 0,
      fest: 76,
      auflage: 332,
      je: 7,
    },
    [20, 193, null, null, null, 48, 71],
  ],
  [
    {
      roh: { b: 717, h: 994 },
      druck: { b: 509, h: 666 },
      end: { b: 141, h: 262 },
      offen: { b: 280, h: 260 },
      beschnitt: 2000,
      fest: 4,
      prozent: 10,
      auflage: 1,
      je: 3,
    },
    [2, 7, 1, 7, 2, 6, 43],
  ],
  [
    {
      roh: { b: 204, h: 456 },
      druck: { b: 697, h: 462 },
      end: { b: 211, h: 38 },
      offen: { b: 103, h: 390 },
      hand: 21,
      rand: 0,
      fest: 4,
      auflage: 10585,
      je: 2,
    },
    [21, 1013, null, null, null, null, 262],
  ],
  [
    {
      roh: { b: 596, h: 474 },
      druck: { b: 428, h: 616 },
      end: { b: 297, h: 238 },
      beschnitt: 5000,
      hand: 2,
      rand: 3000,
      fest: 17,
      prozent: 7,
      auflage: 12826,
      je: 5,
    },
    [2, 34327, null, null, null, null, 54],
  ],
  [
    {
      roh: { b: 1000, h: 258 },
      druck: { b: 691, h: 537 },
      end: { b: 293, h: 221 },
      offen: { b: 45, h: 324 },
      beschnitt: 5000,
      hand: 24,
      rand: 0,
      fest: 0,
      prozent: 7,
      auflage: 2369,
      je: 6,
    },
    [24, 635, null, null, null, null, 94],
  ],
  [
    {
      roh: { b: 432, h: 209 },
      druck: { b: 665, h: 352 },
      end: { b: 41, h: 65 },
      offen: { b: 230, h: 359 },
      beschnitt: 3000,
      hand: 3,
      rand: 0,
      fest: 0,
      prozent: 3,
      auflage: 4809,
      je: 2,
    },
    [3, 3303, null, null, null, null, 106],
  ],
  [
    {
      roh: { b: 940, h: 729 },
      druck: { b: 159, h: 182 },
      end: { b: 31, h: 77 },
      offen: { b: 312, h: 416 },
      beschnitt: 0,
      hand: 2,
      rand: 3000,
      fest: 97,
      prozent: 7,
      auflage: 15389,
      je: 5,
    },
    [2, 41264, 20, 2064, 24, null, 897],
  ],
];

function rechne(f: Fall) {
  const teil: Teil = {
    id: 'T1',
    name: 'Teil',
    materialId: 'M1',
    endformat: um(f.end),
    jeProdukt: f.je,
    ...(f.druck ? { druckbogen: um(f.druck) } : {}),
    ...(f.offen ? { offenesFormat: um(f.offen) } : {}),
    ...(f.beschnitt !== undefined ? { beschnittUm: f.beschnitt } : {}),
    ...(f.hand !== undefined ? { nutzenJeBogen: f.hand } : {}),
  };
  const material: Material = {
    id: 'M1',
    sorte: 'Probe',
    form: 'Bogen',
    grammatur: 150,
    ...um(f.roh),
  };
  return rechnePapierweg(teil, material, f.auflage, {
    ...(f.rand !== undefined ? { randUm: f.rand } : {}),
    ...(f.fest !== undefined ? { zuschussFest: f.fest } : {}),
    ...(f.prozent !== undefined ? { zuschussProzent: f.prozent } : {}),
  });
}

describe('Papierweg liest den Ausschießplan (T89)', () => {
  it('1 der Plan steckt im Ergebnis und hat dieselben Zahlen', () => {
    const p = rechne({
      roh: { b: 650, h: 920 },
      druck: { b: 325, h: 460 },
      end: { b: 85, h: 55 },
      rand: 4000,
      fest: 10,
      prozent: 2,
      auflage: 500,
      je: 1,
    });
    expect(p.plan?.zustand).toBe('schema');
    expect([p.plan?.nutzenJeBogen, p.plan?.druckbogen, p.plan?.rohbogen]).toEqual([21, 35, 9]);
    expect([p.nutzenJeBogen, p.druckbogen, p.rohbogen]).toEqual([21, 35, 9]);
    expect(p.nutzenRaster).toEqual(p.plan?.nutzenLage);
    expect(p.rohRaster).toEqual(p.plan?.rohLage);
    expect(p.plan?.nutzenRaster?.slots).toHaveLength(21);
    expect(p.plan?.rohPositionen).toHaveLength(4);
  });

  it('2 Rolle: kein Ausschießplan (bleibt im Papierweg)', () => {
    const rolle: Material = {
      id: 'R1',
      sorte: 'Banner',
      grammatur: 510,
      form: 'Rolle',
      breiteUm: 1_600_000,
      laengeM: 50,
    };
    const teil: Teil = {
      id: 'T1',
      name: 'Banner',
      materialId: 'R1',
      endformat: { breiteUm: 1_000_000, hoeheUm: 500_000 },
      jeProdukt: 1,
    };
    expect(rechnePapierweg(teil, rolle, 10).plan).toBeUndefined();
  });

  it('3 die Kalkulation gibt den Plan je Teil weiter', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Karten',
      auflagen: [1000],
      einheit: 'Stueck',
      teile: [
        {
          id: 'T1',
          name: 'Karte',
          materialId: 'L4',
          endformat: { breiteUm: 105_000, hoeheUm: 148_000 },
          jeProdukt: 1,
          druckbogen: { breiteUm: 320_000, hoeheUm: 450_000 },
        },
      ],
      zeilen: [
        {
          id: 'Z1',
          art: 'material',
          materialId: 'L4',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('keine Kalkulation');
    const a = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-11-06').auflagen[0];
    const pw = a?.papierwege[0]?.papierweg;
    expect(pw?.plan?.zustand).toBe('schema');
    expect(pw?.plan?.druckbogen).toBe(pw?.druckbogen);
    expect(pw?.plan?.nutzenJeBogen).toBe(pw?.nutzenJeBogen);
  });

  it('4 gleiche Zahlen wie vor T89 in 40 festen Fällen', () => {
    for (const [fall, erwartet] of FAELLE) {
      const p = rechne(fall);
      expect([
        p.nutzenJeBogen,
        p.druckbogen,
        p.druckbogenJeRohbogen,
        p.rohbogen,
        p.schnitteVorschneiden?.einzeln ?? null,
        p.schnitteEndschnitt?.einzeln ?? null,
        p.papierGenutztProzent,
      ]).toEqual(erwartet);
    }
  });
});
