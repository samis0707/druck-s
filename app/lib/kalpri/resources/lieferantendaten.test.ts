import { describe, expect, it } from 'vitest';
import {
  aktuellePreise,
  je100kg,
  leeresLager,
  lieferantendatenEinspielen,
  positionSchluessel,
  type EinspielErgebnis,
  type Lager,
} from './index';

// T174: Lieferantendaten einspielen (Austauschformat v1). Alle Werte erfunden.

const ok = (r: EinspielErgebnis) => {
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r;
};

const kopf = {
  art: 'kalpri-lieferantendaten',
  version: 1,
  lieferant: 'Musterpapier',
  quelle: 'https://shop.example.com',
  abgerufenAm: '2026-11-17T14:05:00+01:00',
  programm: 'test',
};

const artikel = (nr: string, g: number, b: number, h: number, lr: 'SB' | 'BB', preis?: number) => ({
  artikelnummer: nr,
  grammatur: g,
  breiteMm: b,
  hoeheMm: h,
  laufrichtung: lr,
  dickeUm: Math.round(g * 0.85),
  volumen: 0.85,
  ...(preis !== undefined ? { preis: { betragZehntelcent: preis, je: '100kg' } } : {}),
});

const katalog = (preis135 = 185000, preis250 = 185000) => ({
  ...kopf,
  sorten: [
    {
      name: 'Testmatt Art',
      hauspapierVorschlag: 'Bilderdruck halbmatt',
      oberflaeche: 'gestrichen',
      artikel: [
        artikel('T.135.700.1000', 135, 700, 1000, 'SB', preis135),
        artikel('T.135.1000.700', 135, 1000, 700, 'BB', preis135),
        artikel('T.250.700.1000', 250, 700, 1000, 'SB', preis250),
        artikel('T.250.1000.700', 250, 1000, 700, 'BB', preis250),
      ],
    },
  ],
});

describe('T174 Lieferantendaten einspielen', () => {
  it('1. leeres Lager + Katalog → 1 Sorte, 4 Materialien, 1 Sortenpreis', () => {
    const r = ok(lieferantendatenEinspielen(leeresLager(), katalog()));
    expect(r.lager.sorten).toHaveLength(1);
    expect(r.lager.sorten?.[0]).toMatchObject({
      papier: 'Bilderdruck halbmatt',
      name: 'Testmatt Art',
      lieferant: 'Musterpapier',
    });
    expect(r.lager.materialien).toHaveLength(4);
    expect(r.lager.materialien.every((m) => m.sorte === 'Bilderdruck halbmatt')).toBe(true);
    expect(r.lager.materialien[0]).toMatchObject({
      form: 'Bogen',
      grammatur: 135,
      breiteUm: 700000,
      hoeheUm: 1000000,
      laufrichtung: 'SB',
      dickeUm: 115,
      volumen: 0.85,
      oberflaeche: 'gestrichen',
    });
    expect(r.lager.sortenPreise).toHaveLength(1);
    expect(r.lager.sortenPreise?.[0]).toMatchObject({
      gueltigAb: '2026-11-17',
      je100kgZehntelcent: 185000,
    });
    expect(r.geaendert).toBe(true);
  });

  it('2. derselbe Katalog zweimal → nichts Neues', () => {
    const erst = ok(lieferantendatenEinspielen(leeresLager(), katalog()));
    const zwei = ok(lieferantendatenEinspielen(erst.lager, katalog()));
    expect(zwei.geaendert).toBe(false);
    expect(zwei.lager).toEqual(erst.lager);
  });

  it('3. Preis geändert → genau ein neuer Sortenpreis, der alte bleibt', () => {
    const erst = ok(lieferantendatenEinspielen(leeresLager(), katalog()));
    const neu = ok(
      lieferantendatenEinspielen(erst.lager, {
        ...katalog(192400, 192400),
        abgerufenAm: '2026-12-01',
      }),
    );
    expect(neu.lager.sortenPreise?.map((p) => p.je100kgZehntelcent)).toEqual([185000, 192400]);
    expect(neu.vorschau.neueSortenPreise[0]).toContain('bisher 185');
  });

  it('4. vorhandenes Material: leere Felder füllen, abweichende behalten mit Hinweis', () => {
    const lager: Lager = {
      ...leeresLager(),
      materialien: [
        {
          id: 'M0001',
          form: 'Bogen',
          sorte: 'Bilderdruck halbmatt',
          grammatur: 135,
          breiteUm: 700000,
          hoeheUm: 1000000,
          laufrichtung: 'SB',
        },
        {
          id: 'M0002',
          form: 'Bogen',
          sorte: 'Bilderdruck halbmatt',
          grammatur: 250,
          breiteUm: 700000,
          hoeheUm: 1000000,
          laufrichtung: 'SB',
          dickeUm: 205,
        },
      ],
    };
    const r = ok(lieferantendatenEinspielen(lager, katalog()));
    const m1 = r.lager.materialien.find((m) => m.id === 'M0001')!;
    const m2 = r.lager.materialien.find((m) => m.id === 'M0002')!;
    expect(m1.dickeUm).toBe(115);
    expect(m1.artikelnummern).toEqual([{ lieferant: 'Musterpapier', nummer: 'T.135.700.1000' }]);
    expect(m2.dickeUm).toBe(205);
    expect(r.vorschau.hinweise.some((h) => h.includes('M0002') && h.includes('213 µm'))).toBe(true);
    // die BB-Artikel werden neue Materialien
    expect(r.lager.materialien).toHaveLength(4);
  });

  it('5. Format gedreht gilt als gleich (Laufrichtung entscheidet)', () => {
    const lager: Lager = {
      ...leeresLager(),
      materialien: [
        {
          id: 'M0001',
          form: 'Bogen',
          sorte: 'Bilderdruck halbmatt',
          grammatur: 135,
          breiteUm: 700000,
          hoeheUm: 1000000,
          laufrichtung: 'BB',
        },
      ],
    };
    const r = ok(lieferantendatenEinspielen(lager, katalog()));
    const m1 = r.lager.materialien.find((m) => m.id === 'M0001')!;
    expect(m1.artikelnummern?.[0]?.nummer).toBe('T.135.1000.700');
  });

  it('6. je 1.000 Bogen umgerechnet; unterschiedliche Preise je Grammatur → zwei Sorten mit Bereich', () => {
    const umgerechnet = je100kg({
      grammatur: 135,
      breiteMm: 700,
      hoeheMm: 1000,
      preis: { betragZehntelcent: 174830, je: '1000Bogen' },
    });
    // 174,83 € je 1.000 Bogen 70 × 100, 135 g → 185,00 € je 100 kg (±1 Zehntelcent je Rundung)
    expect(Math.abs((umgerechnet ?? 0) - 185000) <= 6).toBe(true);
    const r = ok(lieferantendatenEinspielen(leeresLager(), katalog(185000, 199000)));
    expect(r.lager.sorten?.map((s) => [s.grammaturVon, s.grammaturBis])).toEqual([
      [135, 135],
      [250, 250],
    ]);
    expect(r.lager.sortenPreise?.map((p) => p.je100kgZehntelcent)).toEqual([185000, 199000]);
  });

  it('7. ohne Hauspapier → Sorte übersprungen; Zuordnung schlägt Vorschlag', () => {
    const leer = ok(
      lieferantendatenEinspielen(leeresLager(), katalog(), { hauspapier: { 'Testmatt Art': '' } }),
    );
    expect(leer.geaendert).toBe(false);
    expect(leer.vorschau.hinweise[0]).toContain('übersprungen');
    const anders = ok(
      lieferantendatenEinspielen(leeresLager(), katalog(), {
        hauspapier: { 'Testmatt Art': 'Hausmatt' },
      }),
    );
    expect(anders.lager.materialien.every((m) => m.sorte === 'Hausmatt')).toBe(true);
  });

  it('8. ungültige Datei → Fehler, nichts eingespielt', () => {
    const r = lieferantendatenEinspielen(leeresLager(), {
      ...katalog(),
      sorten: [{ name: 'X', artikel: [{ ...artikel('A', -5, 700, 1000, 'SB') }] }],
    });
    expect(r.ok).toBe(false);
    expect(lieferantendatenEinspielen(leeresLager(), { art: 'etwas anderes' }).ok).toBe(false);
  });

  const bestellung = (nummer: string, datum: string, summe: number, status = 'abgeschlossen') => ({
    nummer,
    datum,
    status,
    nebenkosten: [{ art: 'versand', betragZehntelcent: 1330 }],
    positionen: [
      {
        artikelnummer: 'T.135.700.1000',
        sorte: 'Testmatt Art',
        grammatur: 135,
        breiteMm: 700,
        hoeheMm: 1000,
        anzahl: 250,
        einheit: 'Bogen',
        zwischensummeZehntelcent: summe,
      },
    ],
  });

  it('9. Bestellungen: Preis = Zwischensumme ÷ Anzahl; gleicher Preis → kein neuer; storniert → nichts', () => {
    const basis = ok(lieferantendatenEinspielen(leeresLager(), katalog())).lager;
    const r = ok(
      lieferantendatenEinspielen(basis, {
        ...kopf,
        bestellungen: [
          bestellung('B3', '2026-10-01', 31250),
          bestellung('B1', '2026-08-01', 30000),
          bestellung('B2', '2026-09-01', 31250),
          bestellung('B4', '2026-11-01', 99990, 'storniert'),
        ],
      }),
    );
    const eigene = (r.lager.preise ?? []).filter((p) => p.materialId === 'M0001');
    expect(
      eigene.map((p) => [p.gueltigAb, p.basis, 'betragZehntelcent' in p ? p.betragZehntelcent : 0]),
    ).toEqual([
      ['2026-08-01', 'je1000', 120000],
      ['2026-09-01', 'je1000', 125000],
    ]);
    expect(r.vorschau.hinweise.some((h) => h.includes('storniert'))).toBe(true);
    expect(r.vorschau.hinweise.some((h) => h.includes('Nebenkosten') && h.includes('1,33'))).toBe(
      true,
    );
    // Fracht nicht im Preis; am 01.10. gilt der Preis vom 01.09.
    expect(
      aktuellePreise(r.lager, 'M0001', '2026-10-01').find((p) => p.basis === 'je1000'),
    ).toMatchObject({
      betragZehntelcent: 125000,
    });
  });

  it('10. Bestellung ohne Artikelnummer-Treffer, SB und BB möglich → Rückfrage; Antwort ordnet zu', () => {
    const lager: Lager = {
      ...leeresLager(),
      sorten: [
        {
          id: 'LS-0001',
          papier: 'Bilderdruck halbmatt',
          name: 'Testmatt Art',
          lieferant: 'Musterpapier',
        },
      ],
      materialien: [
        {
          id: 'M0001',
          form: 'Bogen',
          sorte: 'Bilderdruck halbmatt',
          grammatur: 170,
          breiteUm: 920000,
          hoeheUm: 650000,
          laufrichtung: 'BB',
        },
        {
          id: 'M0002',
          form: 'Bogen',
          sorte: 'Bilderdruck halbmatt',
          grammatur: 170,
          breiteUm: 650000,
          hoeheUm: 920000,
          laufrichtung: 'SB',
        },
      ],
    };
    const datei = {
      ...kopf,
      bestellungen: [
        {
          nummer: 'B9',
          datum: '2026-11-10',
          status: 'ausstehend',
          positionen: [
            {
              artikelnummer: 'T.170.0650.0920',
              sorte: 'Testmatt Art',
              grammatur: 170,
              breiteMm: 920,
              hoeheMm: 650,
              anzahl: 250,
              einheit: 'Bogen',
              zwischensummeZehntelcent: 30000,
            },
          ],
        },
      ],
    };
    const frage = ok(lieferantendatenEinspielen(lager, datei));
    expect(frage.vorschau.rueckfragen).toHaveLength(1);
    expect(frage.vorschau.rueckfragen[0]?.optionen.map((o) => o.materialId)).toEqual([
      'M0001',
      'M0002',
    ]);
    expect(frage.lager.preise ?? []).toHaveLength(0);
    const antwort = ok(
      lieferantendatenEinspielen(lager, datei, {
        positionen: { [positionSchluessel('B9', 0)]: 'M0001' },
      }),
    );
    expect(antwort.lager.preise).toHaveLength(1);
    expect(antwort.lager.preise?.[0]).toMatchObject({
      materialId: 'M0001',
      gueltigAb: '2026-11-10',
      basis: 'je1000',
      betragZehntelcent: 120000,
    });
    expect(antwort.lager.materialien[0]?.artikelnummern?.[0]?.nummer).toBe('T.170.0650.0920');
    expect(antwort.vorschau.hinweise.some((h) => h.includes('ausstehend'))).toBe(true);
  });

  it('11. Zugangsdaten in der Quelle werden abgelehnt', () => {
    const r = lieferantendatenEinspielen(leeresLager(), {
      ...katalog(),
      sorten: [
        {
          name: 'X',
          hauspapierVorschlag: 'Y',
          artikel: [
            { ...artikel('A', 100, 700, 1000, 'SB'), url: 'https://user:pw@shop.example.com/a' },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('12. Katalog ohne Preise → keine Lieferantensorte, Materialdaten trotzdem', () => {
    const voll = katalog();
    const ohne = {
      ...voll,
      sorten: voll.sorten.map((sorte) => ({
        ...sorte,
        artikel: sorte.artikel.map((a) => {
          const { preis, ...rest } = a;
          void preis;
          return rest;
        }),
      })),
    };
    const r = ok(lieferantendatenEinspielen(leeresLager(), ohne));
    expect(r.lager.sorten ?? []).toHaveLength(0);
    expect(r.lager.materialien).toHaveLength(4);
    expect(r.vorschau.hinweise.some((h) => h.includes('keine Preise'))).toBe(true);
  });
});
