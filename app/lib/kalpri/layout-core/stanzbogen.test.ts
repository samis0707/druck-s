import { describe, expect, it } from 'vitest';
import {
  berechneStanzbogen,
  besteAnordnung,
  liegtIn,
  type Stanzbogen,
  type StanzbogenEingabe,
} from './index';

const mm = (x: number) => Math.round(x * 1000);

/** Abnahmefall: SRA3, 2 × 2 Teilbogen, je 2 × 2 Nutzen 65 × 95 mm, Tiegel 260 × 380 mm. */
function eingabe(teil: Partial<StanzbogenEingabe> = {}): StanzbogenEingabe {
  return {
    bogen: { breiteUm: mm(320), hoeheUm: mm(450) },
    teilung: { spalten: 2, zeilen: 2, abfallUm: 0 },
    tiegel: { breiteUm: mm(260), hoeheUm: mm(380), greiferUm: mm(9) },
    seitenanlage: 'links',
    anordnung: {
      spalten: 2,
      zeilen: 2,
      endformat: { breiteUm: mm(65), hoeheUm: mm(95) },
      steg: { xUm: mm(6), yUm: mm(6) },
      abstand: { seitlichUm: mm(12), vorneUm: mm(15) },
      beschnittUm: mm(2),
    },
    nutzenJeForm: 4,
    ...teil,
  };
}

const ANORDNUNG = eingabe().anordnung;

function stanzbogen(e: unknown): Stanzbogen {
  const r = berechneStanzbogen(e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehler(e: unknown) {
  const r = berechneStanzbogen(e);
  return r.ok ? [] : r.fehler;
}

function alleImTeilbogen(s: Stanzbogen): boolean {
  return s.teilbogen.every((tb) => tb.nutzen.every((n) => liegtIn(n.endformat, tb.rechteck)));
}

/** Lage der Nutzen relativ zur linken unteren Ecke ihres Teilbogens. */
function relativeLage(s: Stanzbogen, index: number) {
  const tb = s.teilbogen[index];
  if (!tb) throw new Error('Teilbogen fehlt');
  return tb.nutzen.map((n) => [
    n.endformat.xUm - tb.rechteck.xUm,
    n.endformat.yUm - tb.rechteck.yUm,
  ]);
}

describe('berechneStanzbogen – Anlage-Ecke gleich für alle Teilbogen', () => {
  it('Abnahmefall SRA3 geviertelt: alle Teilbogen gleich, Greiferrand vorne, Seitenanlage links', () => {
    const s = stanzbogen(eingabe());
    expect([s.teilbogenJeBogen, s.nutzenJeTeilbogen, s.nutzenJeBogen, s.warnungen]).toEqual([
      4,
      4,
      16,
      [],
    ]);
    expect(s.seitenanlage).toBe('links');
    expect(s.teilbogenFormat).toEqual({ breiteUm: 160000, hoeheUm: 225000 });
    expect(s.teilbogen.map((tb) => [tb.anlage, tb.drehung])).toEqual([
      ['vorne', 0],
      ['vorne', 0],
      ['vorne', 0],
      ['vorne', 0],
    ]);
    expect(s.teilbogen[0]?.nutzen[0]?.endformat).toEqual({
      xUm: 12000,
      yUm: 15000,
      breiteUm: 65000,
      hoeheUm: 95000,
    });
    expect(s.teilbogen[2]?.nutzen[0]).toMatchObject({
      id: 'T3-N1',
      endformat: { xUm: 12000, yUm: 240000, breiteUm: 65000, hoeheUm: 95000 },
      beschnitt: { xUm: 10000, yUm: 238000, breiteUm: 69000, hoeheUm: 99000 },
    });
    for (const i of [1, 2, 3]) {
      expect(relativeLage(s, i)).toEqual(relativeLage(s, 0));
    }
    expect(alleImTeilbogen(s)).toBe(true);
  });

  it('Seitenanlage rechts: seitlicher Abstand zählt von rechts, Nutzen werden nicht gespiegelt', () => {
    const s = stanzbogen(eingabe({ seitenanlage: 'rechts' }));
    expect(s.teilbogen[0]?.nutzen.map((n) => [n.nutzenId, n.endformat.xUm])).toEqual([
      ['N1', 83000],
      ['N2', 12000],
      ['N3', 83000],
      ['N4', 12000],
    ]);
    expect(s.teilbogen[1]?.nutzen[0]?.endformat).toMatchObject({ xUm: 243000, yUm: 15000 });
    expect([s.seitenanlage, alleImTeilbogen(s)]).toEqual(['rechts', true]);
  });

  it('Doppelschnitt: gleich große Teilbogen, der Rest geht in den letzten Abfallstreifen', () => {
    const s = stanzbogen(
      eingabe({
        teilung: { spalten: 3, zeilen: 2, abfallUm: mm(5) },
        anordnung: { ...ANORDNUNG, spalten: 1 },
        nutzenJeForm: 2,
      }),
    );
    expect(s.teilbogenFormat).toEqual({ breiteUm: 103333, hoeheUm: 222500 });
    expect(s.schnittlinien.filter((l) => l.richtung === 'x').map((l) => l.posUm)).toEqual([
      103333, 108333, 211666, 216667,
    ]);
    expect(s.teilbogen.every((tb) => tb.rechteck.breiteUm === 103333)).toBe(true);
    expect([s.teilbogenJeBogen, s.nutzenJeBogen, s.warnungen]).toEqual([6, 12, []]);
    expect(alleImTeilbogen(s)).toBe(true);
  });

  it('zu breit für den Tiegel: alle Teilbogen gedreht, linke Kante am Greiferrand', () => {
    const s = stanzbogen(eingabe({ teilung: { spalten: 1, zeilen: 2, abfallUm: 0 } }));
    expect(s.teilbogenFormat).toEqual({ breiteUm: 320000, hoeheUm: 225000 });
    expect(s.stanzung.teilbogen).toEqual({ breiteUm: 225000, hoeheUm: 320000 });
    expect(s.teilbogen.map((tb) => [tb.anlage, tb.drehung])).toEqual([
      ['links', 90],
      ['links', 90],
    ]);
    expect(s.teilbogen[0]?.nutzen[0]?.endformat).toEqual({
      xUm: 15000,
      yUm: 148000,
      breiteUm: 95000,
      hoeheUm: 65000,
    });
    expect(s.teilbogen[1]?.nutzen[0]?.endformat).toMatchObject({ xUm: 15000, yUm: 373000 });
    expect([s.nutzenJeBogen, alleImTeilbogen(s)]).toEqual([8, true]);
  });

  it('Nutzen quer (gedreht): Visitenkarten 2 × 2 statt 1 × 3 je Teilbogen', () => {
    const s = stanzbogen(
      eingabe({
        anordnung: {
          ...ANORDNUNG,
          endformat: { breiteUm: mm(85), hoeheUm: mm(55) },
          gedreht: true,
          steg: { xUm: mm(4), yUm: mm(4) },
          abstand: { seitlichUm: mm(10), vorneUm: mm(12) },
        },
      }),
    );
    expect([s.nutzenJeTeilbogen, s.nutzenJeBogen]).toEqual([4, 16]);
    expect(s.teilbogen[0]?.nutzen[0]?.endformat).toEqual({
      xUm: 10000,
      yUm: 12000,
      breiteUm: 55000,
      hoeheUm: 85000,
    });
    expect(alleImTeilbogen(s)).toBe(true);
  });

  it('Warnung bei abweichender Nutzenzahl; Fehler mit Pfad', () => {
    expect(stanzbogen(eingabe({ nutzenJeForm: 6 })).warnungen).toEqual([
      'Nutzen je Teilbogen (4) weichen von der Stanzform ab (6)',
    ]);
    expect(fehler(eingabe({ teilung: { spalten: 2, zeilen: 1, abfallUm: mm(400) } }))).toEqual([
      { pfad: 'teilung.abfallUm', meldung: 'Abfall ist zu groß für diese Teilung' },
    ]);
    expect(fehler(eingabe({ anordnung: { ...ANORDNUNG, spalten: 0 } }))).toContainEqual({
      pfad: 'anordnung.spalten',
      meldung: 'muss größer als 0 sein',
    });
    expect(fehler(eingabe({ teilung: { spalten: 1, zeilen: 1, abfallUm: 0 } }))).toEqual([
      { pfad: 'stanzung.teilbogen', meldung: 'Teilbogen ist größer als der Tiegel' },
    ]);
    expect(fehler(eingabe({ anordnung: { ...ANORDNUNG, spalten: 3 } }))).toContainEqual({
      pfad: 'stanzung.stanzform.nutzen.2',
      meldung: 'Nutzen liegt nicht vollständig auf dem Teilbogen',
    });
    expect(
      fehler({ ...eingabe(), seitenanlage: 'oben' } as unknown as StanzbogenEingabe),
    ).toContainEqual({ pfad: 'seitenanlage', meldung: 'Seitenanlage muss links oder rechts sein' });
    const { bogen, teilung, tiegel, anordnung } = eingabe();
    expect(stanzbogen({ bogen, teilung, tiegel, anordnung }).seitenanlage).toBe('links');
  });
});

describe('besteAnordnung', () => {
  const basis = {
    teilbogen: { breiteUm: mm(160), hoeheUm: mm(225) },
    steg: { xUm: mm(4), yUm: mm(4) },
    abstand: { seitlichUm: mm(10), vorneUm: mm(12) },
  };

  it('wählt hochkant oder quer mit den meisten Nutzen, bei Gleichstand nicht gedreht', () => {
    expect(besteAnordnung({ ...basis, endformat: { breiteUm: mm(85), hoeheUm: mm(55) } })).toEqual({
      spalten: 2,
      zeilen: 2,
      gedreht: true,
    });
    expect(besteAnordnung({ ...basis, endformat: { breiteUm: mm(65), hoeheUm: mm(95) } })).toEqual({
      spalten: 2,
      zeilen: 2,
      gedreht: false,
    });
    expect(
      besteAnordnung({ ...basis, endformat: { breiteUm: mm(300), hoeheUm: mm(300) } }),
    ).toBeNull();
  });
});
