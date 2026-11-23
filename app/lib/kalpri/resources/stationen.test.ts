import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationAusProdukt,
  kalkulationHinzufuegen,
  leereKalkulationen,
  produktDerArt,
  rechneKalkulation,
  type Produktion,
} from './index';

// T143: Stationen zum Zusammentragen (Duplo: 20) gegen die Blatt je Exemplar

const HEUTE = '2026-11-11';

/** Beispieldaten: der Bookletmaker bekommt die Tätigkeit Heften (wie in der Praxis). */
const BASIS: Produktion = {
  ...BEISPIEL_PRODUKTION,
  arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
    p.id === 'AP-ZUS' && !p.schritte.some((s) => s.schrittId === 'S0017')
      ? {
          ...p,
          schritte: [
            ...p.schritte,
            { schrittId: 'S0017', leistung: { menge: 1500, dauerMs: 3_600_000 } },
          ],
        }
      : p,
  ),
};

function mitStationen(n: number): Produktion {
  return {
    ...BASIS,
    arbeitsplaetze: (BASIS.arbeitsplaetze ?? []).map((p) =>
      p.id === 'AP-ZUS' ? { ...p, grenzen: { ...p.grenzen, stationen: n } } : p,
    ),
  };
}

function heften(seitenInhalt: number, p: Produktion) {
  const a = produktDerArt('broschuere', { titel: 'Broschüre', einheit: 'Exemplar' }, p);
  if (!a) throw new Error('Vorlage');
  a.endformat = { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } };
  a.teile = a.teile.map((t) => ({
    ...t,
    woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L1' } },
    ...(t.liegtUm === undefined ? { seiten: { zustand: 'fest', wert: seitenInhalt } } : {}),
  })) as typeof a.teile;
  const v = kalkulationAusProdukt(a, p, BEISPIEL_LAGER, {
    titel: 'Broschüre',
    auflagen: [100],
    erstelltAm: HEUTE,
  });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const roh = r.wert.kalkulationen[0];
  if (!roh) throw new Error('k');
  // der Vorschlag nimmt die Kleine Maschine; hier zählt der Bookletmaker mit seinen Stationen
  const k = {
    ...roh,
    zeilen: roh.zeilen.map((z) =>
      z.art === 'arbeitsgang' && z.schrittId === 'S0017' ? { ...z, platzId: 'AP-ZUS' } : z,
    ),
  };
  const i = k.zeilen.findIndex((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0017');
  if (i < 0) throw new Error('Heften fehlt');
  const blatt = (k.teile ?? []).reduce((s, t) => s + t.jeProdukt, 0);
  const z = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE).auflagen[0]?.zeilen[i];
  return { blatt, menge: z?.menge, hinweise: z?.hinweise ?? [], rechenweg: z?.rechenweg ?? [] };
}

describe('Stationen zum Zusammentragen (T143)', () => {
  it('76 Seiten Inhalt + Umschlag = 20 Blatt: ein Durchgang bei 20 Stationen', () => {
    const e = heften(76, mitStationen(20));
    expect(e.blatt).toBe(20);
    expect(e.menge).toBe(100);
    expect(e.rechenweg.join(' ')).toContain('20 Blatt je Exemplar, 20 Stationen → 1 Durchgang');
    expect(e.hinweise.join(' ')).not.toContain('Durchgänge');
  });

  it('96 Seiten Inhalt + Umschlag = 25 Blatt: zwei Durchgänge, Menge doppelt, Hinweis', () => {
    const e = heften(96, mitStationen(20));
    expect(e.blatt).toBe(25);
    expect(e.menge).toBe(200);
    expect(e.hinweise.join(' ')).toContain(
      '25 Blatt je Exemplar, 20 Stationen: 2 Durchgänge – Teilsätze von Hand zusammenführen',
    );
  });

  it('ohne Angabe „Stationen“ bleibt alles wie bisher', () => {
    const e = heften(96, BASIS);
    expect(e.menge).toBe(100);
    expect(e.rechenweg.join(' ')).not.toContain('Stationen');
  });
});

describe('Fassung in Stück je Durchgang und Einflüsse (T144)', () => {
  it('Maschine mit „Stück je Durchgang“ geht dem Teiler der Tätigkeit vor', () => {
    // Heften ohne Teiler: 100 Exemplare; Fassung 30 je Durchgang → 4 Durchgänge
    const p: Produktion = {
      ...BASIS,
      arbeitsplaetze: (BASIS.arbeitsplaetze ?? []).map((x) =>
        x.id === 'AP-ZUS'
          ? {
              ...x,
              schritte: x.schritte.map((s) =>
                s.schrittId === 'S0017'
                  ? { ...s, grenzen: { ...s.grenzen, stueckJeDurchgang: 30 } }
                  : s,
              ),
            }
          : x,
      ),
    };
    const e = heften(8, p);
    expect(e.menge).toBe(4);
    expect(e.rechenweg.join(' ')).toContain('÷ 30 je Durchgang (Fassung der Maschine)');
  });

  it('Einfluss „belegte Stationen größer 20“ greift von selbst über die Blatt je Exemplar', () => {
    const mitEinfluss = (p: Produktion): Produktion => ({
      ...p,
      arbeitsplaetze: (p.arbeitsplaetze ?? []).map((x) =>
        x.id === 'AP-ZUS'
          ? {
              ...x,
              auspraegungen: [
                ...(x.auspraegungen ?? []),
                {
                  name: 'Mehr als 20 Blatt',
                  bedingungen: [{ merkmal: 'faecher', vergleich: 'groesser', wert: 20 }],
                  wirkung: { hinweis: 'Zwei Durchgänge nötig' },
                },
              ],
            }
          : x,
      ),
    });
    expect(heften(96, mitEinfluss(BASIS)).hinweise.join(' ')).toContain('Zwei Durchgänge nötig');
    expect(heften(8, mitEinfluss(BASIS)).hinweise.join(' ')).not.toContain('Zwei Durchgänge nötig');
  });
});

describe('Fächer der Druckmaschine (T144)', () => {
  function druckHinweise(faecher: number, umschlagMaterial: string): string {
    const p: Produktion = {
      ...BASIS,
      arbeitsplaetze: (BASIS.arbeitsplaetze ?? []).map((x) =>
        x.id === 'AP-TON5C' ? { ...x, grenzen: { ...x.grenzen, faecher } } : x,
      ),
    };
    const a = produktDerArt('broschuere', { titel: 'Broschüre', einheit: 'Exemplar' }, p);
    if (!a) throw new Error('Vorlage');
    a.endformat = { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } };
    a.teile = a.teile.map((t) => ({
      ...t,
      woraus: {
        zustand: 'fest',
        wert: { art: 'material', materialId: t.liegtUm === undefined ? 'L1' : umschlagMaterial },
      },
    })) as typeof a.teile;
    const v = kalkulationAusProdukt(a, p, BEISPIEL_LAGER, {
      titel: 'Broschüre',
      auflagen: [100],
      erstelltAm: HEUTE,
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const e = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE).auflagen[0];
    return (e?.zeilen ?? []).flatMap((z) => z.hinweise).join(' | ');
  }

  it('2 Papiere, 1 Fach: Hinweis; 2 Fächer oder 1 Papier: kein Hinweis', () => {
    expect(druckHinweise(1, 'L2')).toContain('2 Papiere, 1 Fach – zwischendurch umlegen');
    expect(druckHinweise(2, 'L2')).not.toContain('umlegen');
    expect(druckHinweise(1, 'L1')).not.toContain('umlegen');
  });
});

describe('Einfluss ändert die Fassung (T158)', () => {
  it('„mehr als 20 Blatt → nur 10 Stationen“: 25 Blatt rechnen 3 statt 2 Durchgänge', () => {
    const p: Produktion = {
      ...mitStationen(20),
      arbeitsplaetze: (mitStationen(20).arbeitsplaetze ?? []).map((x) =>
        x.id === 'AP-ZUS'
          ? {
              ...x,
              auspraegungen: [
                ...(x.auspraegungen ?? []),
                {
                  name: 'Dicker Satz',
                  bedingungen: [{ merkmal: 'faecher', vergleich: 'groesser', wert: 20 }],
                  wirkung: { fassung: { stationen: 10 } },
                },
              ],
            }
          : x,
      ),
    };
    expect(heften(96, mitStationen(20)).menge).toBe(200);
    const e = heften(96, p);
    expect(e.menge).toBe(300);
    expect(e.hinweise.join(' ')).toContain('25 Blatt je Exemplar, 10 Stationen: 3 Durchgänge');
    expect(heften(76, p).menge).toBe(100);
  });
});
