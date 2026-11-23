import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  artikelAendern,
  artikelArchivieren,
  artikelBeschreibung,
  artikelHinzufuegen,
  artikelKopieren,
  artikelStand,
  artikelbestandAlsJson,
  artikelbestandAusJson,
  leererArtikelbestand,
  merkmalVorschlaege,
  naechsteArtikelId,
  sortenImLager,
  standText,
  sucheArtikel,
  type Artikelbestand,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

const A5 = { breiteUm: 148_000, hoeheUm: 210_000 };
const VIER_VIER = { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } };

/** Broschüre als Vorlage: nur Umschlag 4 Seiten und „im Haus“ festgelegt. */
const VORLAGE = {
  titel: 'Broschüre',
  einheit: 'Stueck',
  endformat: { zustand: 'offen' },
  teile: [
    {
      id: 'U',
      name: 'Umschlag',
      jeProdukt: 1,
      woraus: { zustand: 'offen' },
      druck: { zustand: 'offen' },
      seiten: { zustand: 'fest', wert: 4 },
      wer: { zustand: 'fest', wert: 'haus' },
    },
    {
      id: 'I',
      name: 'Inhalt',
      jeProdukt: 1,
      woraus: { zustand: 'offen' },
      druck: { zustand: 'offen' },
      seiten: { zustand: 'offen' },
      wer: { zustand: 'fest', wert: 'haus' },
    },
  ],
  merkmale: [{ name: 'Bindung', wert: { zustand: 'offen' } }],
};

/** Daraus: A5 geheftet, Papier und Farbigkeit wählbar, Inhaltsseiten offen. */
const GEHEFTET = {
  ...VORLAGE,
  titel: 'Broschüre A5 geheftet',
  endformat: { zustand: 'fest', wert: A5 },
  teile: [
    {
      ...VORLAGE.teile[0],
      woraus: {
        zustand: 'waehlbar',
        werte: [
          { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 250 },
          { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 300 },
        ],
      },
      druck: { zustand: 'fest', wert: VIER_VIER },
    },
    {
      ...VORLAGE.teile[1],
      woraus: {
        zustand: 'waehlbar',
        werte: [
          { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 115 },
          { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 135 },
        ],
      },
      druck: {
        zustand: 'waehlbar',
        werte: [{ vorne: { farbe: 'schwarz' }, hinten: { farbe: 'schwarz' } }, VIER_VIER],
      },
    },
  ],
  merkmale: [{ name: 'Bindung', wert: { zustand: 'fest', wert: 'Rückstich' } }],
};

/** Ganz festgelegt: Vereinsheft 32 Seiten. */
const VEREINSHEFT = {
  ...GEHEFTET,
  titel: 'Vereinsheft A5',
  kunde: 'TSV',
  teile: [
    {
      ...GEHEFTET.teile[0],
      woraus: { zustand: 'fest', wert: { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 300 } },
    },
    {
      ...GEHEFTET.teile[1],
      woraus: { zustand: 'fest', wert: { art: 'sorte', sorte: 'GardaMatt Art', grammatur: 135 } },
      druck: { zustand: 'fest', wert: VIER_VIER },
      seiten: { zustand: 'fest', wert: 32 },
    },
  ],
};

function mitDrei(): Artikelbestand {
  let b = wert(artikelHinzufuegen(leererArtikelbestand(), VORLAGE));
  b = wert(artikelHinzufuegen(b, { ...GEHEFTET, entstandenAus: 'A-0001' }));
  return wert(artikelHinzufuegen(b, { ...VEREINSHEFT, entstandenAus: 'A-0002' }));
}

describe('Artikel anlegen und prüfen', () => {
  it('vergibt A-0001, A-0002 …; Fehler ohne Präfix', () => {
    expect(naechsteArtikelId(leererArtikelbestand())).toBe('A-0001');
    const b = mitDrei();
    expect(b.artikel.map((a) => a.id)).toEqual(['A-0001', 'A-0002', 'A-0003']);
    expect(naechsteArtikelId(b)).toBe('A-0004');
    const falsch = artikelHinzufuegen(b, {
      ...VORLAGE,
      teile: [VORLAGE.teile[0], { ...VORLAGE.teile[1], id: 'U' }],
      merkmale: [
        { name: 'Bindung', wert: { zustand: 'offen' } },
        { name: 'bindung', wert: { zustand: 'offen' } },
      ],
    });
    expect(falsch.ok).toBe(false);
    if (falsch.ok) return;
    expect(falsch.fehler).toContainEqual({ pfad: 'teile.1.id', meldung: 'Teil-ID doppelt: U' });
    expect(falsch.fehler).toContainEqual({
      pfad: 'merkmale.1.name',
      meldung: 'Merkmal doppelt: bindung',
    });
  });

  it('wählbar braucht Werte; Seiten wählbar als Liste oder Bereich (von ≤ bis)', () => {
    const b = leererArtikelbestand();
    const leer = artikelHinzufuegen(b, {
      ...VORLAGE,
      endformat: { zustand: 'waehlbar', werte: [] },
    });
    expect(leer.ok).toBe(false);
    if (!leer.ok)
      expect(leer.fehler).toContainEqual({
        pfad: 'endformat.werte',
        meldung: 'mindestens ein Wert',
      });
    const teil = (seiten: unknown) => ({ ...VORLAGE, teile: [{ ...VORLAGE.teile[1], seiten }] });
    const ohne = artikelHinzufuegen(b, teil({ zustand: 'waehlbar' }));
    expect(ohne.ok).toBe(false);
    if (!ohne.ok) {
      expect(ohne.fehler).toContainEqual({
        pfad: 'teile.0.seiten.werte',
        meldung: 'Werte oder Bereich angeben',
      });
    }
    const verkehrt = artikelHinzufuegen(
      b,
      teil({ zustand: 'waehlbar', bereich: { von: 64, bis: 8 } }),
    );
    expect(verkehrt.ok).toBe(false);
    expect(
      artikelHinzufuegen(b, teil({ zustand: 'waehlbar', bereich: { von: 8, bis: 64, schritt: 4 } }))
        .ok,
    ).toBe(true);
  });

  it('ein Teil kann ein anderer Artikel sein – aber nicht der eigene, auch nicht über Umwege', () => {
    const b = mitDrei();
    const mitRegister = artikelHinzufuegen(b, {
      ...VORLAGE,
      titel: 'Mappe mit Vereinsheft',
      teile: [
        {
          ...VORLAGE.teile[0],
          woraus: { zustand: 'fest', wert: { art: 'artikel', artikelId: 'A-0003' } },
        },
      ],
    });
    expect(mitRegister.ok).toBe(true);
    const selbst = artikelAendern(b, {
      ...wert(artikelHinzufuegen(b, VORLAGE)).artikel[3],
      teile: [
        {
          ...VORLAGE.teile[0],
          woraus: { zustand: 'fest', wert: { art: 'artikel', artikelId: 'A-0004' } },
        },
      ],
    });
    expect(selbst.ok).toBe(false);
    const mit4 = wert(mitRegister);
    const kreis = artikelAendern(mit4, {
      ...mit4.artikel[2],
      teile: [
        {
          ...VEREINSHEFT.teile[0],
          woraus: { zustand: 'fest', wert: { art: 'artikel', artikelId: 'A-0004' } },
        },
      ],
    });
    expect(kreis.ok).toBe(false);
    if (!kreis.ok)
      expect(kreis.fehler.map((f) => f.meldung)).toContain(
        'A-0003 enthält sich über seine Teile selbst',
      );
  });
});

describe('Konkretisieren: Kopie, Stand, Beschreibung', () => {
  it('Kopie bekommt neue Nummer, „entstanden aus“, Titel mit (Kopie); Vorlage bleibt', () => {
    const b = wert(artikelArchivieren(mitDrei(), 'A-0002', true));
    const { bestand, id } = wert(artikelKopieren(b, 'A-0002'));
    expect(id).toBe('A-0004');
    const kopie = bestand.artikel.find((a) => a.id === 'A-0004');
    expect(kopie).toMatchObject({
      titel: 'Broschüre A5 geheftet (Kopie)',
      entstandenAus: 'A-0002',
    });
    expect(kopie?.archiviert).toBeUndefined();
    expect(bestand.artikel.find((a) => a.id === 'A-0002')?.archiviert).toBe(true);
    expect(artikelKopieren(b, 'A-0099').ok).toBe(false);
  });

  it('Stand zählt festgelegt / wählbar / offen und nennt die Fragen der Kalkulation', () => {
    const [vorlage, geheftet, heft] = mitDrei().artikel;
    if (!vorlage || !geheftet || !heft) throw new Error('Artikel fehlen');
    expect(standText(artikelStand(vorlage))).toBe('Stand: 3 festgelegt · 0 wählbar · 7 offen');
    expect(artikelStand(geheftet)).toEqual({
      festgelegt: 6,
      waehlbar: 3,
      offen: 1,
      fragen: [
        'Umschlag: Papier/Material',
        'Inhalt: Papier/Material',
        'Inhalt: Farbigkeit',
        'Inhalt: Seiten',
      ],
    });
    expect(standText(artikelStand(heft))).toBe('Stand: alles festgelegt');
    // unbedrucktes Teil: Seiten zählen nicht
    const ware = {
      ...VORLAGE.teile[0],
      druck: { zustand: 'fest', wert: 'ohne' },
      seiten: undefined,
    };
    const handel = wert(
      artikelHinzufuegen(leererArtikelbestand(), { ...VORLAGE, teile: [ware], merkmale: [] }),
    ).artikel[0];
    if (!handel) throw new Error('fehlt');
    expect(artikelStand(handel).fragen).toEqual(['Endformat', 'Umschlag: Papier/Material']);
  });

  it('Beschreibung aus Teilen und Merkmalen; Offenes und Wählbares sichtbar', () => {
    const [vorlage, geheftet, heft] = mitDrei().artikel;
    if (!vorlage || !geheftet || !heft) throw new Error('Artikel fehlen');
    expect(artikelBeschreibung(heft)).toBe(
      'Vereinsheft A5 · Format 148 × 210 mm · Umschlag: 4 Seiten, 4/4 auf GardaMatt Art 300 g · ' +
        'Inhalt: 32 Seiten, 4/4 auf GardaMatt Art 135 g · Bindung: Rückstich',
    );
    expect(artikelBeschreibung(geheftet)).toBe(
      'Broschüre A5 geheftet · Format 148 × 210 mm · Umschlag: 4 Seiten, 4/4, Material wählbar ' +
        '(GardaMatt Art 250 g · GardaMatt Art 300 g) · Inhalt: Seiten offen, Farbigkeit wählbar ' +
        '(1/1 · 4/4), Material wählbar (GardaMatt Art 115 g · GardaMatt Art 135 g) · Bindung: Rückstich',
    );
    expect(artikelBeschreibung(vorlage)).toBe(
      'Broschüre · Format offen · Umschlag: 4 Seiten, Farbigkeit offen, Material offen · ' +
        'Inhalt: Seiten offen, Farbigkeit offen, Material offen · Bindung: offen',
    );
    // Lagermaterial mit Namen und Format, Lieferant, Merkmal am Teil
    const l1 = BEISPIEL_LAGER.materialien[0];
    if (!l1) throw new Error('L1 fehlt');
    const karte = wert(
      artikelHinzufuegen(leererArtikelbestand(), {
        titel: 'Postkarte',
        einheit: 'Stueck',
        endformat: { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 105_000 } },
        teile: [
          {
            id: 'K',
            name: 'Karte',
            jeProdukt: 1,
            woraus: { zustand: 'fest', wert: { art: 'material', materialId: l1.id } },
            druck: { zustand: 'fest', wert: { vorne: { farbe: 'farbig', sonderfarben: 1 } } },
            seiten: { zustand: 'fest', wert: 2 },
            wer: { zustand: 'fest', wert: 'lieferant' },
            merkmale: [{ name: 'Veredelung', wert: { zustand: 'fest', wert: 'Softtouch' } }],
          },
        ],
      }),
    ).artikel[0];
    if (!karte) throw new Error('fehlt');
    expect(artikelBeschreibung(karte, BEISPIEL_LAGER)).toBe(
      'Postkarte · Format 148 × 105 mm · Karte: 2 Seiten, 4+1/0 auf Bilderdruck matt 135 g, 70 × 100 cm, ' +
        'vom Lieferanten, Veredelung: Softtouch',
    );
  });
});

describe('Suche, Archiv, Vorschläge, Sorten, JSON', () => {
  it('Suche über Titel, Kunde, Merkmale; Archivierte nur auf Wunsch', () => {
    const b = wert(artikelArchivieren(mitDrei(), 'A-0001', true));
    expect(sucheArtikel(b, '').map((a) => a.id)).toEqual(['A-0002', 'A-0003']);
    expect(sucheArtikel(b, 'rückstich tsv').map((a) => a.id)).toEqual(['A-0003']);
    expect(sucheArtikel(b, '', { archivierte: true }).map((a) => a.id)).toEqual(['A-0001']);
    const zurueck = wert(artikelArchivieren(b, 'A-0001', false));
    expect(zurueck.artikel[0]?.archiviert).toBeUndefined();
  });

  it('Merkmal-Vorschläge: Namen und benutzte Werte ohne Doppelte', () => {
    const b = wert(
      artikelHinzufuegen(mitDrei(), {
        ...VORLAGE,
        merkmale: [
          { name: 'bindung', wert: { zustand: 'waehlbar', werte: ['rückstich', 'Klebebindung'] } },
          { name: 'Ecken', wert: { zustand: 'fest', wert: 'gerundet R5' } },
        ],
      }),
    );
    expect(merkmalVorschlaege(b)).toEqual({
      namen: ['Bindung', 'Ecken'],
      werte: { Bindung: ['Klebebindung', 'Rückstich'], Ecken: ['gerundet R5'] },
    });
  });

  it('Sorten im Lager fassen gleiche Sorte und Grammatur über Formate zusammen', () => {
    const lager = {
      materialien: [
        ...BEISPIEL_LAGER.materialien,
        { ...BEISPIEL_LAGER.materialien[0], id: 'L1B', breiteUm: 500_000, hoeheUm: 700_000 },
      ],
    } as Parameters<typeof sortenImLager>[0];
    const bilderdruck = sortenImLager(lager).filter((s) => s.sorte === 'Bilderdruck matt');
    expect(bilderdruck.map((s) => [s.grammatur, s.materialIds])).toEqual([
      [135, ['L1', 'L1B']],
      [300, ['L2']],
    ]);
  });

  it('JSON hin und zurück', () => {
    const b = mitDrei();
    expect(wert(artikelbestandAusJson(artikelbestandAlsJson(b)))).toEqual(b);
    expect(artikelbestandAusJson('{kaputt').ok).toBe(false);
  });
});
