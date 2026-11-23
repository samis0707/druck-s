import { describe, expect, it } from 'vitest';
import {
  pruefeStanzung,
  rasterStanzform,
  type RasterStanzform,
  type Stanzform,
  type Stanzung,
  type StanzungEingabe,
} from './index';

const mm = (x: number) => Math.round(x * 1000);

/** Tiegel 260 mm entlang der Greiferkante, 380 mm tief, Greiferrand 9 mm (vom Nutzer bestätigt). */
const TIEGEL = { breiteUm: mm(260), hoeheUm: mm(380), greiferUm: mm(9) };
/** Annahme: Viertel SRA3 = 160 × 225 mm (Anlagekante = 160 mm). */
const TEILBOGEN = { breiteUm: mm(160), hoeheUm: mm(225) };

/** Annahme: 2 × 2 Nutzen 65 × 95 mm, Steg 6 mm, 12 mm von links, 15 mm von der Anlagekante. */
function rasterEingabe(teil: Partial<RasterStanzform> = {}): RasterStanzform {
  return {
    name: 'Karte 65 × 95, 4-fach',
    spalten: 2,
    zeilen: 2,
    endformat: { breiteUm: mm(65), hoeheUm: mm(95) },
    steg: { xUm: mm(6), yUm: mm(6) },
    abstand: { linksUm: mm(12), vorneUm: mm(15) },
    beschnittUm: mm(2),
    ...teil,
  };
}

function form(teil: Partial<RasterStanzform> = {}): Stanzform {
  const r = rasterStanzform(rasterEingabe(teil));
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

/** Erster Nutzen einer Stanzform (für abgewandelte Testdaten). */
function erster(f: Stanzform) {
  const n = f.nutzen[0];
  if (!n) throw new Error('Nutzen fehlt');
  return n;
}

function eingabe(stanzform: Stanzform, teil: Partial<StanzungEingabe> = {}): StanzungEingabe {
  return { tiegel: TIEGEL, teilbogen: TEILBOGEN, stanzform, ...teil };
}

function stanzung(e: unknown): Stanzung {
  const r = pruefeStanzung(e);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function fehler(e: unknown) {
  const r = pruefeStanzung(e);
  return r.ok ? [] : r.fehler;
}

describe('rasterStanzform', () => {
  it('2 × 2 Nutzen: N1…N4 zeilenweise ab der Anlagekante, von links nach rechts', () => {
    expect(form()).toEqual({
      name: 'Karte 65 × 95, 4-fach',
      beschnittUm: 2000,
      nutzen: [
        { id: 'N1', xUm: 12000, yUm: 15000, breiteUm: 65000, hoeheUm: 95000 },
        { id: 'N2', xUm: 83000, yUm: 15000, breiteUm: 65000, hoeheUm: 95000 },
        { id: 'N3', xUm: 12000, yUm: 116000, breiteUm: 65000, hoeheUm: 95000 },
        { id: 'N4', xUm: 83000, yUm: 116000, breiteUm: 65000, hoeheUm: 95000 },
      ],
    });
  });

  it('prüft die Eingabe', () => {
    const r = rasterStanzform(rasterEingabe({ spalten: 0 }));
    expect(r.ok ? [] : r.fehler).toEqual([{ pfad: 'spalten', meldung: 'muss größer als 0 sein' }]);
  });
});

describe('pruefeStanzung', () => {
  it('Abnahmefall: 4 Nutzen auf dem Teilbogen 160 × 225 mm im Tiegel, ohne Warnung', () => {
    const s = stanzung(eingabe(form()));
    expect([s.anzahl, s.name, s.warnungen]).toEqual([4, 'Karte 65 × 95, 4-fach', []]);
    expect(s.nutzen[0]).toEqual({
      id: 'N1',
      endformat: { xUm: 12000, yUm: 15000, breiteUm: 65000, hoeheUm: 95000 },
      beschnitt: { xUm: 10000, yUm: 13000, breiteUm: 69000, hoeheUm: 99000 },
    });
    expect(s.teilbogen).toEqual(TEILBOGEN);
  });

  it('freie Nutzenpositionen: unterschiedliche Größen, Reihenfolge bleibt', () => {
    const frei: Stanzform = {
      name: 'Anhänger + Etikett',
      beschnittUm: 0,
      nutzen: [
        { id: 'A', xUm: mm(20), yUm: mm(30), breiteUm: mm(50), hoeheUm: mm(120) },
        { id: 'B', xUm: mm(80), yUm: mm(12), breiteUm: mm(60), hoeheUm: mm(40) },
        { id: 'C', xUm: mm(80), yUm: mm(60), breiteUm: mm(60), hoeheUm: mm(150) },
      ],
    };
    const s = stanzung(eingabe(frei));
    expect(s.nutzen.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(s.nutzen[2]?.beschnitt).toEqual(s.nutzen[2]?.endformat);
    expect(s.warnungen).toEqual([]);
  });

  it('Fehler: Teilbogen größer als der Tiegel, Nutzen außerhalb, Überlappung, doppelte ID', () => {
    expect(fehler(eingabe(form(), { teilbogen: { breiteUm: mm(270), hoeheUm: mm(300) } }))).toEqual(
      [{ pfad: 'teilbogen', meldung: 'Teilbogen ist größer als der Tiegel' }],
    );
    expect(fehler(eingabe(form({ abstand: { linksUm: mm(30), vorneUm: mm(15) } })))).toEqual([
      { pfad: 'stanzform.nutzen.1', meldung: 'Nutzen liegt nicht vollständig auf dem Teilbogen' },
      { pfad: 'stanzform.nutzen.3', meldung: 'Nutzen liegt nicht vollständig auf dem Teilbogen' },
    ]);
    const f = form();
    const ueber: Stanzform = {
      ...f,
      nutzen: [...f.nutzen.slice(0, 1), { ...erster(f), id: 'N1', xUm: mm(40) }],
    };
    expect(fehler(eingabe(ueber))).toEqual([
      { pfad: 'stanzform.nutzen.1.id', meldung: 'Nutzen-ID doppelt' },
      { pfad: 'stanzform.nutzen', meldung: 'Nutzen N1 und N1 überlappen' },
    ]);
    expect(fehler(eingabe({ ...f, nutzen: [] }))).toEqual([
      { pfad: 'stanzform.nutzen', meldung: 'Mindestens ein Nutzen' },
    ]);
  });

  it('Warnungen: Greiferrand des Tiegels, Beschnitt benachbarter Nutzen', () => {
    expect(
      stanzung(eingabe(form({ abstand: { linksUm: mm(12), vorneUm: mm(5) } }))).warnungen,
    ).toEqual(['Nutzen im Greiferrand des Tiegels: N1, N2']);
    expect(stanzung(eingabe(form({ steg: { xUm: mm(3), yUm: mm(6) } }))).warnungen).toEqual([
      'Beschnitt benachbarter Nutzen überlappt',
    ]);
    expect(stanzung(eingabe(form({ steg: { xUm: mm(4), yUm: mm(4) } }))).warnungen).toEqual([]);
  });

  it('prüft die Eingabe mit Pfad', () => {
    expect(fehler(eingabe(form(), { tiegel: { ...TIEGEL, greiferUm: -1 } }))).toContainEqual({
      pfad: 'tiegel.greiferUm',
      meldung: 'darf nicht negativ sein',
    });
    const f = form();
    expect(fehler(eingabe({ ...f, nutzen: [{ ...erster(f), breiteUm: 0 }] }))).toContainEqual({
      pfad: 'stanzform.nutzen.0.breiteUm',
      meldung: 'muss größer als 0 sein',
    });
    expect(fehler(eingabe({ ...f, name: '  ' }))).toContainEqual({
      pfad: 'stanzform.name',
      meldung: 'Pflichtfeld',
    });
  });
});
