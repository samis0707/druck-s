import { describe, expect, it } from 'vitest';
import {
  berechneTeilung,
  liegtIn,
  rasterStanzform,
  type Stanzform,
  type StanzungEingabe,
  type Teilung,
  type TeilungEingabe,
} from './index';

const mm = (x: number) => Math.round(x * 1000);

/** Tiegel 260 mm entlang der Greiferkante, 380 mm tief, Greiferrand 9 mm. */
const TIEGEL = { breiteUm: mm(260), hoeheUm: mm(380), greiferUm: mm(9) };

/** Annahme: 2 × 2 Nutzen 65 × 95 mm, Steg 6 mm, 12 mm von links, 15 mm von der Anlagekante. */
function form(): Stanzform {
  const r = rasterStanzform({
    name: 'Karte 65 × 95, 4-fach',
    spalten: 2,
    zeilen: 2,
    endformat: { breiteUm: mm(65), hoeheUm: mm(95) },
    steg: { xUm: mm(6), yUm: mm(6) },
    abstand: { linksUm: mm(12), vorneUm: mm(15) },
    beschnittUm: mm(2),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function stanzung(breiteMm = 160, hoeheMm = 225): StanzungEingabe {
  return {
    tiegel: TIEGEL,
    teilbogen: { breiteUm: mm(breiteMm), hoeheUm: mm(hoeheMm) },
    stanzform: form(),
  };
}

/** Abnahmefall: SRA3 320 × 450 mm, Einzelschnitt bei 160 und 225 mm → 4 Teilbogen 160 × 225. */
function eingabe(teil: Partial<TeilungEingabe> = {}): TeilungEingabe {
  return {
    bogen: { breiteUm: mm(320), hoeheUm: mm(450) },
    schnitte: { x: [{ posUm: mm(160), abfallUm: 0 }], y: [{ posUm: mm(225), abfallUm: 0 }] },
    stanzung: stanzung(),
    ...teil,
  };
}

function teilung(e: unknown): Teilung {
  const r = berechneTeilung(e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehler(e: unknown) {
  const r = berechneTeilung(e);
  return r.ok ? [] : r.fehler;
}

/** Jeder Nutzen liegt mit dem Endformat in seinem Teilbogen. */
function alleNutzenImTeilbogen(t: Teilung): boolean {
  return t.teilbogen.every((tb) => tb.nutzen.every((n) => liegtIn(n.endformat, tb.rechteck)));
}

describe('berechneTeilung', () => {
  it('Abnahmefall SRA3: 4 Teilbogen à 4 Nutzen, Anlage an der Originalkante', () => {
    const t = teilung(eingabe());
    expect([t.teilbogenJeBogen, t.nutzenJeBogen, t.warnungen, t.abfall]).toEqual([4, 16, [], []]);
    expect(t.schnittlinien).toEqual([
      { richtung: 'x', posUm: 160000 },
      { richtung: 'y', posUm: 225000 },
    ]);
    expect(t.teilbogen.map((tb) => [tb.id, tb.spalte, tb.zeile, tb.anlage, tb.drehung])).toEqual([
      ['T1', 1, 1, 'vorne', 0],
      ['T2', 2, 1, 'vorne', 0],
      ['T3', 1, 2, 'hinten', 180],
      ['T4', 2, 2, 'hinten', 180],
    ]);
    expect(t.teilbogen.every((tb) => tb.anlageOriginal)).toBe(true);
    expect(t.teilbogen[2]?.rechteck).toEqual({
      xUm: 0,
      yUm: 225000,
      breiteUm: 160000,
      hoeheUm: 225000,
    });
    expect(alleNutzenImTeilbogen(t)).toBe(true);
  });

  it('Nutzen auf dem Druckbogen: Gruppe = Teilbogen, an der Hinterkante um 180° gedreht', () => {
    const t = teilung(eingabe());
    expect(t.teilbogen[0]?.nutzen[0]).toEqual({
      id: 'T1-N1',
      gruppe: 'T1',
      nutzenId: 'N1',
      endformat: { xUm: 12000, yUm: 15000, breiteUm: 65000, hoeheUm: 95000 },
      beschnitt: { xUm: 10000, yUm: 13000, breiteUm: 69000, hoeheUm: 99000 },
    });
    expect(t.teilbogen[1]?.nutzen[0]?.endformat).toEqual({
      xUm: 172000,
      yUm: 15000,
      breiteUm: 65000,
      hoeheUm: 95000,
    });
    expect(t.teilbogen[2]?.nutzen[0]).toEqual({
      id: 'T3-N1',
      gruppe: 'T3',
      nutzenId: 'N1',
      endformat: { xUm: 83000, yUm: 340000, breiteUm: 65000, hoeheUm: 95000 },
      beschnitt: { xUm: 81000, yUm: 338000, breiteUm: 69000, hoeheUm: 99000 },
    });
    expect(t.teilbogen[3]?.nutzen.map((n) => n.id)).toEqual(['T4-N1', 'T4-N2', 'T4-N3', 'T4-N4']);
  });

  it('Doppelschnitt: Abfallstreifen 10 mm, zwei Schnittlinien je Schnitt', () => {
    const t = teilung(
      eingabe({
        schnitte: {
          x: [{ posUm: mm(155), abfallUm: mm(10) }],
          y: [{ posUm: mm(220), abfallUm: mm(10) }],
        },
        stanzung: stanzung(155, 220),
      }),
    );
    expect(t.schnittlinien).toEqual([
      { richtung: 'x', posUm: 155000 },
      { richtung: 'x', posUm: 165000 },
      { richtung: 'y', posUm: 220000 },
      { richtung: 'y', posUm: 230000 },
    ]);
    expect(t.abfall).toEqual([
      { xUm: 155000, yUm: 0, breiteUm: 10000, hoeheUm: 450000 },
      { xUm: 0, yUm: 220000, breiteUm: 320000, hoeheUm: 10000 },
    ]);
    expect(t.teilbogen[3]).toMatchObject({
      rechteck: { xUm: 165000, yUm: 230000, breiteUm: 155000, hoeheUm: 220000 },
      anlage: 'hinten',
    });
    expect([t.nutzenJeBogen, alleNutzenImTeilbogen(t)]).toEqual([16, true]);
  });

  it('Bogen quer: Anlage an der linken bzw. rechten Originalkante (90° / 270°)', () => {
    const t = teilung(
      eingabe({
        bogen: { breiteUm: mm(450), hoeheUm: mm(320) },
        schnitte: { x: [{ posUm: mm(225), abfallUm: 0 }], y: [{ posUm: mm(160), abfallUm: 0 }] },
      }),
    );
    expect(t.teilbogen.map((tb) => [tb.anlage, tb.drehung])).toEqual([
      ['links', 90],
      ['rechts', 270],
      ['links', 90],
      ['rechts', 270],
    ]);
    expect(t.teilbogen[0]?.nutzen[0]?.endformat).toEqual({
      xUm: 15000,
      yUm: 83000,
      breiteUm: 95000,
      hoeheUm: 65000,
    });
    expect(t.teilbogen[1]?.nutzen[0]?.endformat).toEqual({
      xUm: 340000,
      yUm: 12000,
      breiteUm: 95000,
      hoeheUm: 65000,
    });
    expect(alleNutzenImTeilbogen(t)).toBe(true);
  });

  it('ohne Originalkante: Anlage an der Schnittkante mit Warnung; ohne Schnitte ein Teilbogen', () => {
    const t = teilung(
      eingabe({
        bogen: { breiteUm: mm(160), hoeheUm: mm(675) },
        schnitte: {
          x: [],
          y: [
            { posUm: mm(225), abfallUm: 0 },
            { posUm: mm(450), abfallUm: 0 },
          ],
        },
      }),
    );
    expect(t.teilbogen.map((tb) => [tb.id, tb.anlage, tb.anlageOriginal])).toEqual([
      ['T1', 'vorne', true],
      ['T2', 'vorne', false],
      ['T3', 'hinten', true],
    ]);
    expect(t.warnungen).toEqual(['Anlage an einer Schnittkante: T2']);
    const eins = teilung(
      eingabe({ bogen: { breiteUm: mm(160), hoeheUm: mm(225) }, schnitte: { x: [], y: [] } }),
    );
    expect([eins.teilbogenJeBogen, eins.nutzenJeBogen, eins.schnittlinien]).toEqual([1, 4, []]);
  });

  it('Fehler: Teilbogen passt nicht zur Stanzform, Schnitte ungeordnet oder außerhalb', () => {
    expect(
      fehler(
        eingabe({
          schnitte: {
            x: [{ posUm: mm(160), abfallUm: mm(2) }],
            y: [{ posUm: mm(225), abfallUm: 0 }],
          },
        }),
      ),
    ).toEqual([
      {
        pfad: 'schnitte',
        meldung: 'Teilbogen T2 (158 × 225 mm) passt nicht zur Stanzform (160 × 225 mm)',
      },
      {
        pfad: 'schnitte',
        meldung: 'Teilbogen T4 (158 × 225 mm) passt nicht zur Stanzform (160 × 225 mm)',
      },
    ]);
    expect(
      fehler(
        eingabe({
          schnitte: {
            x: [
              { posUm: mm(200), abfallUm: 0 },
              { posUm: mm(150), abfallUm: 0 },
            ],
            y: [{ posUm: mm(450), abfallUm: 0 }],
          },
        }),
      ),
    ).toEqual([
      { pfad: 'schnitte.x', meldung: 'Schnitte müssen aufsteigend auf dem Bogen liegen' },
      { pfad: 'schnitte.y', meldung: 'Schnitte müssen aufsteigend auf dem Bogen liegen' },
    ]);
  });

  it('Fehler der Stanzung kommen mit Pfad unter stanzung an', () => {
    expect(
      fehler(eingabe({ stanzung: { ...stanzung(), tiegel: { ...TIEGEL, breiteUm: mm(150) } } })),
    ).toEqual([{ pfad: 'stanzung.teilbogen', meldung: 'Teilbogen ist größer als der Tiegel' }]);
    expect(
      fehler(eingabe({ stanzung: { ...stanzung(), tiegel: { ...TIEGEL, greiferUm: -1 } } })),
    ).toContainEqual({ pfad: 'stanzung.tiegel.greiferUm', meldung: 'darf nicht negativ sein' });
    expect(fehler(eingabe({ schnitte: { x: [{ posUm: 0, abfallUm: 0 }], y: [] } }))).toContainEqual(
      { pfad: 'schnitte.x.0.posUm', meldung: 'muss größer als 0 sein' },
    );
  });
});
