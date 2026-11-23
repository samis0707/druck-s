import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  bogenArten,
  bogenArtenText,
  bogenJeArt,
  felderVon,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeKalkulationen,
  rechneKalkulation,
  seitenJeNutzen,
  seitenzahlVon,
  type Druck,
  type Farbwerk,
  type Produktion,
  type Teil,
  type ZeilenErgebnis,
} from './index';

const A4 = { breiteUm: 210_000, hoeheUm: 297_000 };
const A4_DOPPEL = { breiteUm: 420_000, hoeheUm: 297_000 };

/** Inhalt einer A4-Broschüre, 16 Seiten: 4 Doppelseiten (offene Bogen) je Produkt. */
const INHALT: Teil = {
  id: 'T1',
  name: 'Inhalt',
  endformat: A4,
  offenesFormat: A4_DOPPEL,
  jeProdukt: 4,
  druckbogen: { breiteUm: 450_000, hoeheUm: 320_000 },
};

const VIER_WEISS: Druck = {
  vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] },
  hinten: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] },
};

describe('Seiten auf den Nutzen', () => {
  it('Felder und Seitenzahl aus offenem Format und Nutzen je Produkt', () => {
    expect([felderVon(INHALT), seitenzahlVon(INHALT, true)]).toEqual([2, 16]);
    expect(felderVon({ endformat: A4 })).toBe(1);
  });

  it('Rückstich: ineinandergesteckt, außen 16 · 1', () => {
    expect(seitenJeNutzen(INHALT, true).nutzen).toEqual([
      { vorne: [16, 1], hinten: [2, 15] },
      { vorne: [14, 3], hinten: [4, 13] },
      { vorne: [12, 5], hinten: [6, 11] },
      { vorne: [10, 7], hinten: [8, 9] },
    ]);
  });

  it('zusammengetragen: gefalzte Doppelbogen hintereinander', () => {
    const t: Teil = { ...INHALT, seitenfolge: 'zusammengetragen' };
    expect(seitenJeNutzen(t, true).nutzen.slice(0, 2)).toEqual([
      { vorne: [4, 1], hinten: [2, 3] },
      { vorne: [8, 5], hinten: [6, 7] },
    ]);
  });

  it('Einzelblatt: die Seiten der Reihe nach; Rückstich ohne Doppelseite gibt einen Hinweis', () => {
    const blatt: Teil = { id: 'T2', name: 'Blätter', endformat: A4, jeProdukt: 3 };
    expect(seitenJeNutzen(blatt, true).nutzen).toEqual([
      { vorne: [1], hinten: [2] },
      { vorne: [3], hinten: [4] },
      { vorne: [5], hinten: [6] },
    ]);
    const r = seitenJeNutzen({ ...blatt, seitenfolge: 'rueckstich' }, true);
    expect(r.hinweise).toEqual([
      'Rückstich und Zusammentragen brauchen Doppelseiten, beidseitig – Seiten der Reihe nach',
    ]);
  });
});

describe('Farben je Seite → Arten Druckbogen', () => {
  it('ohne Seitenfarben: eine Art, alle Nutzen wie der Druck', () => {
    expect(bogenArten(INHALT, VIER_WEISS)).toEqual({
      arten: [{ nutzen: [1, 2, 3, 4], druck: VIER_WEISS }],
      hinweise: [],
    });
  });

  it('Weiß nur auf Seite 5: nur Nutzen 3 vorne hat Weiß', () => {
    const { arten, hinweise } = bogenArten(
      { ...INHALT, seitenFarben: [{ farbe: 'Weiß', seiten: [5] }] },
      VIER_WEISS,
    );
    expect(hinweise).toEqual([]);
    expect(bogenArtenText(arten)).toBe('3 Bogen 4c / 4c · 1 Bogen 4c + Weiß / 4c');
    expect(arten.map((a) => a.nutzen)).toEqual([[1, 2, 4], [3]]);
    expect(arten[1]?.druck).toEqual({
      vorne: { farbe: 'farbig', sonder: [{ name: 'Weiß', lage: 'unter' }] },
      hinten: { farbe: 'farbig' },
    });
  });

  it('1c auf Seiten 9–16 im Rückstich: keine Bogenseite ist rein schwarz', () => {
    const vier: Druck = { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } };
    const t: Teil = {
      ...INHALT,
      seitenFarben: [{ farbe: '1c', seiten: [9, 10, 11, 12, 13, 14, 15, 16] }],
    };
    expect(bogenArtenText(bogenArten(t, vier).arten)).toBe('4 Bogen 4c / 4c');
  });

  it('1c auf Seiten 9–16 zusammengetragen: die hinteren zwei Bogen sind 1c', () => {
    const vier: Druck = { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } };
    const t: Teil = {
      ...INHALT,
      seitenfolge: 'zusammengetragen',
      seitenFarben: [{ farbe: '1c', seiten: [9, 10, 11, 12, 13, 14, 15, 16] }],
    };
    const { arten } = bogenArten(t, vier);
    expect(bogenArtenText(arten)).toBe('2 Bogen 4c / 4c · 2 Bogen 1c / 1c');
    expect(arten.map((a) => a.nutzen)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('Hinweise: Seite gibt es nicht, Farbe hat der Druck nicht', () => {
    const t: Teil = {
      ...INHALT,
      seitenFarben: [
        { farbe: 'Weiß', seiten: [5, 40] },
        { farbe: 'Gold', seiten: [2] },
      ],
    };
    expect(bogenArten(t, VIER_WEISS).hinweise).toEqual([
      'Weiß: Seite 40 gibt es nicht (16 Seiten)',
      'Gold ist keine Farbe dieses Drucks – Seitenangabe nicht gerechnet',
    ]);
  });

  it('Druckbogen gleich auf die Nutzen verteilt, Rest auf die ersten Arten', () => {
    const arten = bogenArten(
      { ...INHALT, seitenFarben: [{ farbe: 'Weiß', seiten: [5] }] },
      VIER_WEISS,
    ).arten;
    expect(bogenJeArt(arten, 228, 4)).toEqual([171, 57]);
    expect(bogenJeArt(arten, 230, 4)).toEqual([173, 57]);
  });

  it('Schema: Seitenfarben und Seitenfolge am Teil', () => {
    const k = (teil: Record<string, unknown>) =>
      pruefeKalkulationen({
        version: 1,
        kalkulationen: [
          {
            id: 'K0001',
            titel: 'Broschüre',
            auflagen: [50],
            einheit: 'Stueck',
            teile: [teil],
            zeilen: [],
          },
        ],
      });
    expect(
      k({
        ...INHALT,
        seitenFarben: [{ farbe: '1c', seiten: [9, 10] }],
        seitenfolge: 'zusammengetragen',
      }).ok,
    ).toBe(true);
    const r = k({ ...INHALT, seitenFarben: [{ farbe: 'Weiß', seiten: [] }], seitenfolge: 'quer' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler.map((f) => `${f.pfad}: ${f.meldung}`)).toEqual([
      'kalkulationen.0.teile.0.seitenFarben.0.seiten: mindestens eine Seite',
      'kalkulationen.0.teile.0.seitenfolge: Seitenfolge unbekannt',
    ]);
  });
});

describe('Kalkulation: Broschüre mit Weiß nur auf Seite 5', () => {
  const RICOH: Farbwerk = {
    farben: [
      { name: 'Cyan', art: 'cyan' },
      { name: 'Magenta', art: 'magenta' },
      { name: 'Gelb', art: 'gelb' },
      { name: 'Schwarz', art: 'schwarz' },
      { name: 'Weiß', art: 'sonder' },
    ],
    stationen: [
      { farbe: 'Cyan' },
      { farbe: 'Magenta' },
      { farbe: 'Gelb' },
      { farbe: 'Schwarz' },
      {},
    ],
    gruppen: [
      { name: '4c', farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'], klicks: [{ zehntelcent: 37 }] },
      { name: 'Weiß', farben: ['Weiß'], klicks: [{ zehntelcent: 16 }] },
    ],
    wechselMs: 20 * 60_000,
  };

  function zeile(seitenFarben?: Teil['seitenFarben']): ZeilenErgebnis {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
    const ton = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-TON5C');
    if (!ton) throw new Error('AP-TON5C fehlt');
    ton.farbwerk = RICOH;
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Broschüre',
      auflagen: [50],
      einheit: 'Stueck',
      teile: [{ ...INHALT, nutzenJeBogen: 1, ...(seitenFarben ? { seitenFarben } : {}) }],
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-TON5C',
          schrittId: 'S0001',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
          druck: VIER_WEISS,
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('keine Kalkulation');
    const z = rechneKalkulation(k, p, BEISPIEL_LAGER, '2026-10-28').auflagen[0]?.zeilen[0];
    if (!z) throw new Error('Zeile fehlt');
    return z;
  }

  it('ohne Seitenfarben: jede Bogenseite mit Weiß unterlegt – 4 Durchgänge, Weiß auf allen', () => {
    const z = zeile();
    // 50 × 4 = 200 Druckbogen; Zuschuss 10 + 2 % = 14, × 3 (2 Durchgänge mehr) = 42 → 242
    expect(z.mengeGesamt).toBe(242);
    expect(z.klicks?.jeKlickart.map((k) => `${k.name} ${k.anzahl}`)).toEqual([
      'Weiß 484',
      '4c 484',
    ]);
  });

  it('Weiß nur auf Seite 5: Weiß-Klicks und zweiter Durchgang nur für Nutzen 3 vorne', () => {
    const z = zeile([{ farbe: 'Weiß', seiten: [5] }]);
    // Zuschuss 14 × 2 (eine Art braucht 1 Durchgang mehr) = 28 → 228 Druckbogen
    expect(z.mengeGesamt).toBe(228);
    expect(z.rechenweg).toContain('Lauf: 228 Bogen × 2,25 Durchgänge ÷ 3.000/h = 10,26 min');
    expect(z.rechenweg).toContain('Druckbogen 4c / 4c: 171 (Nutzen 1, 2, 4)');
    expect(z.rechenweg).toContain('Druckbogen 4c + Weiß / 4c: 57 (Nutzen 3)');
    expect(z.rechenweg).toContain('Rüsten: Rüsten 5 min + Sonderfarbe wechseln 20 min = 25 min');
    // 171 × 2 Seiten + 57 × 2 Seiten = 456 × 4c; Weiß 57
    expect(z.klicks?.jeKlickart.map((k) => `${k.name} ${k.anzahl}`)).toEqual(['4c 456', 'Weiß 57']);
  });
});
