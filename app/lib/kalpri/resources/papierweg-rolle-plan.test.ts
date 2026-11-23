import { describe, expect, it } from 'vitest';
import { rechnePapierweg, type Material, type Teil } from './index';

/** Formate in mm (b × h), Rollenbreite in mm. */
type Mm = { b: number; h: number };
type Fall = {
  rolle: number;
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
 * 30 feste Fälle (zufällig erzeugt, Startwert 2026) mit den Werten, die `rechnePapierweg` für
 * Rollen VOR T92 geliefert hat: [Nutzen nebeneinander, Abschnittslänge µm, Abschnitte,
 * Laufmeter (Text), m² (Text), Material genutzt %]. Nach T92 kommen sie aus dem Rollenplan.
 */
const FAELLE: [Fall, (number | string | null)[]][] = [
  [
    {
      rolle: 2500,
      end: { b: 1791, h: 1261 },
      offen: { b: 82, h: 88 },
      beschnitt: 0,
      rand: 5000,
      fest: 7,
      auflage: 2999,
      je: 1,
    },
    [28, 82000, 115, '9,43', '23,58', 99],
  ],
  [
    {
      rolle: 1067,
      end: { b: 529, h: 1798 },
      offen: { b: 90, h: 83 },
      beschnitt: 0,
      hand: 3,
      fest: 8,
      auflage: 2795,
      je: 4,
    },
    [3, 83000, 3735, '310,01', '330,78', 25],
  ],
  [
    {
      rolle: 610,
      end: { b: 54, h: 1798 },
      offen: { b: 1269, h: 81 },
      beschnitt: 5000,
      hand: 1,
      rand: 0,
      fest: 0,
      prozent: 7.5,
      auflage: 12,
      je: 4,
    },
    [1, 91000, 52, '4,73', '2,89', 185],
  ],
  [
    {
      rolle: 3200,
      end: { b: 1263, h: 169 },
      offen: { b: 1992, h: 1610 },
      beschnitt: 5000,
      hand: 4,
      rand: 10000,
      prozent: 0,
      auflage: 1281,
      je: 4,
    },
    [4, 1620000, 1281, '2.075,22', '6.640,7', 247],
  ],
  [
    {
      rolle: 1067,
      end: { b: 1793, h: 888 },
      offen: { b: 1751, h: 1995 },
      beschnitt: 5000,
      hand: 2,
      rand: 5000,
      fest: 2,
      prozent: 5,
      auflage: 1,
      je: 1,
    },
    [2, 2005000, 4, '8,02', '8,56', 327],
  ],
  [
    {
      rolle: 1370,
      end: { b: 1082, h: 1610 },
      offen: { b: 1904, h: 771 },
      hand: 1,
      fest: 4,
      prozent: 7.5,
      auflage: 545,
      je: 1,
    },
    [1, 777000, 590, '458,43', '628,05', 138],
  ],
  [
    {
      rolle: 1370,
      end: { b: 1319, h: 1731 },
      offen: { b: 89, h: 551 },
      beschnitt: 10000,
      hand: 2,
      rand: 20000,
      fest: 6,
      prozent: 0,
      auflage: 2190,
      je: 1,
    },
    [2, 571000, 1101, '628,67', '861,28', 13],
  ],
  [
    {
      rolle: 2500,
      end: { b: 1029, h: 1687 },
      offen: { b: 1578, h: 84 },
      beschnitt: 5000,
      rand: 0,
      fest: 9,
      prozent: 7.5,
      auflage: 4,
      je: 3,
    },
    [26, 1588000, 11, '17,47', '43,67', 87],
  ],
  [
    {
      rolle: 3200,
      end: { b: 832, h: 55 },
      offen: { b: 1992, h: 2000 },
      beschnitt: 10000,
      hand: 3,
      fest: 1,
      prozent: 7.5,
      auflage: 124,
      je: 4,
    },
    [3, 2020000, 180, '363,6', '1.163,52', 185],
  ],
  [
    {
      rolle: 1600,
      end: { b: 343, h: 53 },
      beschnitt: 3000,
      rand: 5000,
      fest: 7,
      prozent: 5,
      auflage: 264,
      je: 1,
    },
    [26, 349000, 19, '6,63', '10,61', 85],
  ],
  [
    {
      rolle: 1370,
      end: { b: 51, h: 1665 },
      offen: { b: 1478, h: 160 },
      beschnitt: 0,
      hand: 1,
      rand: 10000,
      fest: 1,
      auflage: 995,
      je: 4,
    },
    [1, 160000, 3981, '636,96', '872,64', 108],
  ],
  [
    {
      rolle: 3200,
      end: { b: 189, h: 1512 },
      offen: { b: 86, h: 1318 },
      hand: 3,
      rand: 20000,
      prozent: 2,
      auflage: 1896,
      je: 2,
    },
    [3, 1324000, 1290, '1.707,96', '5.465,47', 8],
  ],
  [
    {
      rolle: 3200,
      end: { b: 520, h: 1090 },
      offen: { b: 835, h: 1925 },
      beschnitt: 3000,
      hand: 4,
      rand: 10000,
      fest: 0,
      auflage: 5,
      je: 2,
    },
    [4, 1931000, 3, '5,79', '18,54', 104],
  ],
  [
    {
      rolle: 1067,
      end: { b: 1673, h: 690 },
      offen: { b: 1809, h: 612 },
      beschnitt: 3000,
      hand: 2,
      rand: 5000,
      fest: 9,
      prozent: 2,
      auflage: 1578,
      je: 3,
    },
    [2, 618000, 2424, '1.498,03', '1.598,4', 336],
  ],
  [
    {
      rolle: 2500,
      end: { b: 429, h: 821 },
      offen: { b: 1420, h: 83 },
      beschnitt: 3000,
      hand: 1,
      rand: 20000,
      fest: 0,
      auflage: 7,
      je: 4,
    },
    [1, 89000, 28, '2,49', '6,23', 53],
  ],
  [
    {
      rolle: 914,
      end: { b: 878, h: 54 },
      hand: 5,
      rand: 20000,
      fest: 3,
      prozent: 7.5,
      auflage: 4,
      je: 1,
    },
    [5, 60000, 5, '0,3', '0,27', 432],
  ],
  [
    {
      rolle: 1370,
      end: { b: 1250, h: 544 },
      beschnitt: 0,
      hand: 5,
      rand: 10000,
      prozent: 0,
      auflage: 8,
      je: 4,
    },
    [5, 544000, 7, '3,81', '5,22', 456],
  ],
  [
    {
      rolle: 1370,
      end: { b: 544, h: 755 },
      offen: { b: 85, h: 167 },
      beschnitt: 3000,
      hand: 4,
      rand: 0,
      fest: 3,
      prozent: 5,
      auflage: 2418,
      je: 4,
    },
    [4, 173000, 2542, '439,77', '602,48', 24],
  ],
  [
    {
      rolle: 914,
      end: { b: 1800, h: 1085 },
      offen: { b: 553, h: 81 },
      hand: 1,
      rand: 5000,
      fest: 5,
      prozent: 7.5,
      auflage: 1341,
      je: 4,
    },
    [1, 87000, 5772, '502,16', '458,98', 56],
  ],
  [
    {
      rolle: 2500,
      end: { b: 1136, h: 1797 },
      beschnitt: 5000,
      hand: 1,
      rand: 0,
      fest: 0,
      prozent: 7.5,
      auflage: 1196,
      je: 1,
    },
    [1, 1807000, 1286, '2.323,8', '5.809,51', 45],
  ],
  [
    {
      rolle: 610,
      end: { b: 873, h: 269 },
      offen: { b: 1435, h: 89 },
      beschnitt: 5000,
      hand: 4,
      rand: 5000,
      fest: 6,
      prozent: 5,
      auflage: 1747,
      je: 4,
    },
    [4, 99000, 1841, '182,26', '111,18', 846],
  ],
  [
    {
      rolle: 914,
      end: { b: 651, h: 52 },
      offen: { b: 80, h: 84 },
      beschnitt: 3000,
      hand: 3,
      rand: 5000,
      fest: 4,
      auflage: 3000,
      je: 3,
    },
    [3, 90000, 3004, '270,36', '247,11', 25],
  ],
  [
    {
      rolle: 2500,
      end: { b: 697, h: 936 },
      offen: { b: 89, h: 665 },
      beschnitt: 3000,
      hand: 2,
      rand: 5000,
      fest: 4,
      prozent: 7.5,
      auflage: 1356,
      je: 2,
    },
    [2, 671000, 1462, '981', '2.452,51', 7],
  ],
  [
    {
      rolle: 1370,
      end: { b: 1034, h: 51 },
      offen: { b: 1642, h: 375 },
      hand: 3,
      rand: 10000,
      fest: 5,
      auflage: 251,
      je: 2,
    },
    [3, 381000, 173, '65,91', '90,3', 354],
  ],
  [
    {
      rolle: 2500,
      end: { b: 1434, h: 233 },
      offen: { b: 111, h: 80 },
      beschnitt: 5000,
      hand: 5,
      rand: 10000,
      fest: 7,
      auflage: 1504,
      je: 1,
    },
    [5, 90000, 308, '27,72', '69,3', 20],
  ],
  [
    {
      rolle: 1067,
      end: { b: 1278, h: 51 },
      offen: { b: 85, h: 103 },
      hand: 2,
      rand: 10000,
      prozent: 0,
      auflage: 2997,
      je: 2,
    },
    [2, 109000, 2997, '326,67', '348,56', 15],
  ],
  [
    {
      rolle: 914,
      end: { b: 313, h: 679 },
      offen: { b: 1995, h: 1526 },
      beschnitt: 0,
      rand: 20000,
      fest: 7,
      auflage: 2504,
      je: 1,
    },
    [null, null, null, null, null, null],
  ],
  [
    {
      rolle: 3200,
      end: { b: 55, h: 1795 },
      offen: { b: 543, h: 733 },
      beschnitt: 10000,
      hand: 2,
      rand: 5000,
      fest: 10,
      prozent: 2,
      auflage: 2206,
      je: 2,
    },
    [2, 753000, 2261, '1.702,53', '5.448,11', 33],
  ],
  [
    {
      rolle: 914,
      end: { b: 59, h: 427 },
      offen: { b: 1992, h: 738 },
      beschnitt: 3000,
      hand: 3,
      rand: 20000,
      fest: 0,
      prozent: 0,
      auflage: 9,
      je: 1,
    },
    [3, 744000, 3, '2,23', '2,04', 649],
  ],
  [
    {
      rolle: 1067,
      end: { b: 59, h: 1118 },
      offen: { b: 1334, h: 1037 },
      beschnitt: 10000,
      hand: 3,
      rand: 0,
      auflage: 4,
      je: 2,
    },
    [3, 1057000, 3, '3,17', '3,38', 368],
  ],
];

function rechne(f: Fall) {
  const teil: Teil = {
    id: 'T1',
    name: 'Banner',
    materialId: 'R1',
    endformat: um(f.end),
    jeProdukt: f.je,
    ...(f.offen ? { offenesFormat: um(f.offen) } : {}),
    ...(f.beschnitt !== undefined ? { beschnittUm: f.beschnitt } : {}),
    ...(f.hand !== undefined ? { nutzenJeBogen: f.hand } : {}),
  };
  const rolle: Material = {
    id: 'R1',
    sorte: 'Banner',
    form: 'Rolle',
    grammatur: 510,
    breiteUm: f.rolle * 1000,
    laengeM: 50,
  };
  return rechnePapierweg(teil, rolle, f.auflage, {
    ...(f.rand !== undefined ? { randUm: f.rand } : {}),
    ...(f.fest !== undefined ? { zuschussFest: f.fest } : {}),
    ...(f.prozent !== undefined ? { zuschussProzent: f.prozent } : {}),
  });
}

describe('Papierweg Rolle liest den Rollenplan (T92)', () => {
  it('1 der Rollenplan steckt im Ergebnis und hat dieselben Zahlen', () => {
    const p = rechne({
      rolle: 1600,
      end: { b: 500, h: 700 },
      rand: 10_000,
      fest: 1,
      prozent: 5,
      auflage: 25,
      je: 1,
    });
    expect(p.rollenPlan?.art).toBe('rolle');
    expect([
      p.rollenPlan?.nutzenJeAbschnitt,
      p.rollenPlan?.abschnitte,
      p.rollenPlan?.laufmeter,
    ]).toEqual([3, 11, 7.766]);
    expect([p.nutzenJeBogen, p.druckbogen]).toEqual([3, 11]);
    expect(p.nutzenRaster).toEqual(p.rollenPlan?.nutzenLage);
    expect(p.druckbogenFormat).toEqual(p.rollenPlan?.abschnittFormat);
    expect(p.rollenPlan?.nutzenPositionen).toHaveLength(3);
    expect(p.plan).toBeUndefined();
  });

  it('2 Bogen: kein Rollenplan', () => {
    const teil: Teil = {
      id: 'T1',
      name: 'Karte',
      materialId: 'M1',
      endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
      jeProdukt: 1,
    };
    const bogen: Material = {
      id: 'M1',
      sorte: 'Karton',
      form: 'Bogen',
      grammatur: 300,
      breiteUm: 320_000,
      hoeheUm: 450_000,
    };
    expect(rechnePapierweg(teil, bogen, 100).rollenPlan).toBeUndefined();
  });

  it('3 gleiche Werte wie vor T92 in 30 festen Fällen', () => {
    for (const [fall, erwartet] of FAELLE) {
      const p = rechne(fall);
      const text = p.rechenweg.find((r) => r.startsWith('Abschnitte:')) ?? '';
      const lfm = /→ (.*) Laufmeter = (.*) m²/.exec(text);
      expect([
        p.nutzenJeBogen,
        p.druckbogenFormat?.hoeheUm ?? null,
        p.druckbogen,
        lfm?.[1] ?? null,
        lfm?.[2] ?? null,
        p.papierGenutztProzent,
      ]).toEqual(erwartet);
    }
  });
});
