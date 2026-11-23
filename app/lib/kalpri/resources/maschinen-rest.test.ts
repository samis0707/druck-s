import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  flaechenUmrechnung,
  kalkulationHinzufuegen,
  leereKalkulationen,
  plaetzeFuerSchritt,
  preisHinzufuegen,
  pruefeProduktion,
  rechenweg,
  rechneDruckProbe,
  rechneKalkulation,
  rechneProbe,
  type Arbeitsplatz,
  type Lager,
  type Produktion,
  type ZeilenErgebnis,
} from './index';

const MIN = 60_000;
const euro = (g: Geld | null | undefined) => (g ? formatEuro(g) : '–');
const STD = 60 * MIN;

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

/** Lager mit Ösen (Stück, 12,00 € je 1.000) und Folie als Rolle (L8: 0,33 × 500 m, 82,50 €). */
function lager(): Lager {
  const mitOese = wert(
    preisHinzufuegen(
      {
        ...BEISPIEL_LAGER,
        materialien: [
          ...BEISPIEL_LAGER.materialien,
          {
            id: 'OESE',
            form: 'Stueck',
            sorte: 'Öse 10 mm silber',
            breiteUm: 10_000,
            hoeheUm: 10_000,
          },
        ],
      },
      {
        materialId: 'OESE',
        lieferant: 'Beschläge Nord',
        gueltigAb: '2026-01-01',
        basis: 'je1000',
        betragZehntelcent: 12_000,
      },
    ),
  );
  return wert(
    preisHinzufuegen(mitOese, {
      materialId: 'L8',
      lieferant: 'Folien Süd',
      gueltigAb: '2026-01-01',
      basis: 'einheit',
      einheitName: 'Rolle',
      inhalt: 1,
      staffel: [{ ab: 1, betragZehntelcent: 82_500 }],
    }),
  );
}

/** Beispiel-Produktion, Plätze nach Bedarf geändert. */
function produktion(aendern: (p: Produktion) => void = () => {}): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  aendern(p);
  return wert(pruefeProduktion(p));
}

function platz(p: Produktion, id: string): Arbeitsplatz {
  const x = (p.arbeitsplaetze ?? []).find((a) => a.id === id);
  if (!x) throw new Error(`${id} fehlt`);
  return x;
}

function zeilen(
  p: Produktion,
  liste: Record<string, unknown>[],
  teile?: unknown[],
): ZeilenErgebnis[] {
  const k = wert(
    kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Test',
      auflagen: [1000],
      einheit: 'Stueck',
      ...(teile ? { teile } : {}),
      zeilen: liste,
    }),
  ).kalkulationen[0];
  if (!k) throw new Error('keine Kalkulation');
  return rechneKalkulation(k, p, lager(), '2026-10-29').auflagen[0]?.zeilen ?? [];
}

const hand = (id: string, platzId: string, schrittId: string, menge: number) => ({
  id,
  art: 'arbeitsgang',
  platzId,
  schrittId,
  menge: { art: 'hand', mengen: [menge] },
});

describe('Verbrauch je Schritt', () => {
  const mitOesen = () =>
    produktion((p) => {
      const ap = platz(p, 'AP-KLEIN');
      const oesen = ap.schritte.find((s) => s.schrittId === 'S0015');
      if (!oesen) throw new Error('S0015 fehlt');
      oesen.leistung = { menge: 600, dauerMs: STD };
      oesen.verbrauch = [{ materialId: 'OESE', menge: 1, je: 'Stueck' }];
    });

  it('Ösen: 1 je Stück × 1.000 Stück × 0,012 € = 12,00 € – in den Kosten der Zeile', () => {
    const [z] = zeilen(mitOesen(), [hand('Z1', 'AP-KLEIN', 'S0015', 1000)]);
    // Zeit 1.000 ÷ 600/h = 100 min × 48 €/h = 80,00 € + 12,00 € Ösen
    expect(z?.rechenweg).toContain(
      'Verbrauch Öse 10 mm silber (OESE): 1 je Stück × 1.000 = 1.000 Stück × 0,012 € (Beschläge Nord) = 12,00 €',
    );
    expect(z?.rechenweg).toContain('Vollkosten mit Verbrauch: 80,00 € + 12,00 € = 92,00 €');
    expect(euro(z?.kostenVoll)).toBe('92,00 €');
  });

  it('je Auftrag und je Stapel; fehlende Menge und fehlender Preis als Hinweis', () => {
    const p = produktion((x) => {
      const bohren = platz(x, 'AP-KLEIN').schritte.find((s) => s.schrittId === 'S0014');
      if (!bohren) throw new Error('S0014 fehlt');
      bohren.verbrauch = [
        { materialId: 'OESE', menge: 2, je: 'Auftrag' },
        { materialId: 'OESE', menge: 1, je: 'Stapel' },
        { materialId: 'L9', menge: 1, je: 'Auftrag' },
      ];
    });
    const [z] = zeilen(p, [hand('Z1', 'AP-KLEIN', 'S0014', 10)]);
    expect(z?.rechenweg.filter((t) => t.startsWith('Verbrauch'))).toEqual([
      'Verbrauch Öse 10 mm silber (OESE): 2 je Auftrag × 1 = 2 Stück × 0,012 € (Beschläge Nord) = 0,02 €',
    ]);
    expect(z?.hinweise).toContain('Verbrauch Öse 10 mm silber (OESE): Menge in Stapel fehlt');
    expect(z?.hinweise).toContain('Verbrauch: kein Preis für L9 zum 2026-10-29 – rechnet nicht');
  });

  it('Rolle rechnet je m² (Folie 82,50 € ÷ 165 m² = 0,50 €/m²)', () => {
    const p = produktion((x) => {
      const lfp = platz(x, 'AP-LFP').schritte[0];
      if (!lfp) throw new Error('LFP fehlt');
      lfp.verbrauch = [{ materialId: 'L8', menge: 1.1, je: 'm2' }];
    });
    const [z] = zeilen(p, [hand('Z1', 'AP-LFP', 'S0003', 10)]);
    expect(z?.rechenweg).toContain(
      'Verbrauch Haftpapier glänzend 80 g (L8): 1,1 je m² × 10 = 11 m² × 0,500 €/m² (Folien Süd) = 5,50 €',
    );
  });

  it('Ausprobieren ohne Lager meldet den Verbrauch, mit Lager rechnet es', () => {
    const p = mitOesen();
    const ohne = wert(
      rechneDruckProbe(
        p,
        { platzId: 'AP-KLEIN', schrittId: 'S0015', menge: 100 },
        undefined,
        undefined,
      ),
    );
    expect(ohne.hinweise).toContain('Verbrauch braucht das Materiallager – nicht gerechnet');
    const mit = wert(
      rechneDruckProbe(
        p,
        { platzId: 'AP-KLEIN', schrittId: 'S0015', menge: 100 },
        undefined,
        undefined,
        {
          lager: lager(),
          stichtag: '2026-10-29',
        },
      ),
    );
    expect(mit.rechenweg.at(-1)).toBe('Vollkosten mit Verbrauch: 8,00 € + 1,20 € = 9,20 €');
  });
});

describe('Schritte im selben Durchlauf', () => {
  /** Duplo: Heften (S0017) läuft mit Zusammentragen (S0013), Zusammentragen dabei −10 %. */
  const duplo = () =>
    produktion((p) => {
      const zus = platz(p, 'AP-ZUS');
      zus.schritte.push({
        schrittId: 'S0017',
        leistung: { menge: 1200, dauerMs: STD },
        ruesten: [{ name: 'Heftköpfe einstellen', dauerMs: 5 * MIN, je: 'Auftrag' }],
        laeuftMit: { schrittId: 'S0013', leistungProzent: -10 },
      });
    });

  it('beide in der Kalkulation: Heften nur Rüsten, Zusammentragen langsamer', () => {
    const [zus, heft] = zeilen(duplo(), [
      hand('Z1', 'AP-ZUS', 'S0013', 1000),
      hand('Z2', 'AP-ZUS', 'S0017', 1000),
    ]);
    expect(zus?.rechenweg[0]).toBe('Leistung: 1.500 Lagen/h → mit Heften −10 % = 1.350 Lagen/h');
    expect(heft?.rechenweg[2]).toBe('Lauf: läuft mit Zusammentragen – keine eigene Laufzeit');
    expect(heft?.rechenweg[3]).toBe('Rüsten: Heftköpfe einstellen 5 min = 5 min');
    expect(heft?.hinweise).toContain('Heften läuft mit Zusammentragen – nur Rüsten');
  });

  it('Heften allein läuft normal', () => {
    const [heft] = zeilen(duplo(), [hand('Z2', 'AP-ZUS', 'S0017', 1000)]);
    expect(heft?.rechenweg[2]).toBe('Lauf: 1.000 Exemplare ÷ 1.200/h = 50 min');
  });

  it('Schema: mit sich selbst oder mit einem fremden Schritt wird gemeldet', () => {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as {
      arbeitsplaetze: { id: string; schritte: Record<string, unknown>[] }[];
    };
    const i = p.arbeitsplaetze.findIndex((a) => a.id === 'AP-ZUS');
    const zus = p.arbeitsplaetze[i];
    if (!zus?.schritte[0]) throw new Error('AP-ZUS fehlt');
    zus.schritte[0]['laeuftMit'] = { schrittId: 'S0013' };
    zus.schritte.push({ schrittId: 'S0017', laeuftMit: { schrittId: 'S0009' } });
    const r = pruefeProduktion(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler).toEqual([
      {
        pfad: `arbeitsplaetze.${i}.schritte.0.laeuftMit.schrittId`,
        meldung: 'Ein Schritt kann nicht mit sich selbst laufen',
      },
      {
        pfad: `arbeitsplaetze.${i}.schritte.1.laeuftMit.schrittId`,
        meldung: 'Schritt S0009 ist an diesem Platz nicht möglich',
      },
    ]);
  });
});

describe('Mindestzeit und Abrechnungstakt', () => {
  const mitMindest = (mindest: number, takt?: number) =>
    produktion((p) => {
      const ap = platz(p, 'AP-KLEIN');
      ap.mindestzeitMs = mindest;
      if (takt !== undefined) ap.taktMs = takt;
    });

  it('kurzer Auftrag: mindestens 15 min', () => {
    const r = wert(
      rechneProbe(mitMindest(15 * MIN), { platzId: 'AP-KLEIN', schrittId: 'S0014', menge: 2 }),
    );
    // 2 Hübe × 0,875 min = 1,75 min + 5 min Rüsten = 6,75 min
    expect(rechenweg(r)[4]).toBe('Zeit: 6,75 min → mindestens 15 min = 15 min = 0,25 h');
    expect(rechenweg(r)[5]).toBe('Vollkosten: 0,25 h × 48,00 €/h = 12,00 €');
  });

  it('je angefangene 5 min', () => {
    const r = wert(
      rechneProbe(mitMindest(0, 5 * MIN), { platzId: 'AP-KLEIN', schrittId: 'S0014', menge: 14 }),
    );
    // 14 × 0,875 = 12,25 + 5 = 17,25 min → 20 min
    expect(rechenweg(r)[4]).toBe('Zeit: 17,25 min → je angefangene 5 min = 20 min = 0,33 h');
  });

  it('ohne Angaben bleibt die Zeit wie bisher', () => {
    const r = wert(
      rechneProbe(produktion(), { platzId: 'AP-KLEIN', schrittId: 'S0014', menge: 2 }),
    );
    expect(rechenweg(r)[4]).toBe('Zeit: 6,75 min = 0,11 h');
  });
});

describe('Personal: Lauf ohne Bediener', () => {
  it('Großformat: Rüsten mit Personal, Lauf nur Maschine (Besatzung 0)', () => {
    const p = produktion((x) => {
      const lfp = platz(x, 'AP-LFP');
      lfp.personalZehntelcent = 38_000;
      lfp.besatzungLauf = 0;
    });
    const r = wert(rechneProbe(p, { platzId: 'AP-LFP', schrittId: 'S0003', menge: 11 }));
    // Rüsten 15 min × 58 €/h = 14,50 €; Lauf 60 min × (58 − 38) = 20 €/h = 20,00 €
    expect(rechenweg(r)[5]).toBe(
      'Vollkosten: Rüsten 0,25 h × 58,00 €/h + Lauf 1 h × 20,00 €/h (Besatzung 0) = 34,50 €',
    );
  });

  it('Besatzung 0,25: Lauf mit einem Viertel Personal', () => {
    const p = produktion((x) => {
      const lfp = platz(x, 'AP-LFP');
      lfp.personalZehntelcent = 40_000;
      lfp.besatzungLauf = 0.25;
    });
    const r = wert(rechneProbe(p, { platzId: 'AP-LFP', schrittId: 'S0003', menge: 11 }));
    // Lauf-Satz 58 − 40 × 0,75 = 28 €/h
    expect(euro(r.kostenVoll)).toBe('42,50 €');
  });

  it('Schema: Personal größer als Satz, Besatzung ohne Personal', () => {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as {
      arbeitsplaetze: Record<string, unknown>[];
    };
    const i = p.arbeitsplaetze.findIndex((a) => a['id'] === 'AP-LFP');
    const lfp = p.arbeitsplaetze[i];
    if (!lfp) throw new Error('AP-LFP fehlt');
    lfp['personalZehntelcent'] = 60_000;
    let r = pruefeProduktion(p);
    expect(r.ok ? [] : r.fehler).toEqual([
      {
        pfad: `arbeitsplaetze.${i}.personalZehntelcent`,
        meldung: 'Personal ist größer als der Stundensatz',
      },
    ]);
    delete lfp['personalZehntelcent'];
    lfp['besatzungLauf'] = 0.5;
    r = pruefeProduktion(p);
    expect(r.ok ? [] : r.fehler).toEqual([
      {
        pfad: `arbeitsplaetze.${i}.personalZehntelcent`,
        meldung: 'Für die Besatzung beim Lauf den Anteil Personal angeben',
      },
    ]);
  });
});

describe('Schritte in m² und Laufmeter aus dem Papierweg', () => {
  it('Umrechnung: Fläche und längere Seite', () => {
    const sra3 = { breiteUm: 320_000, hoeheUm: 450_000 };
    expect(flaechenUmrechnung('m2', sra3)).toEqual({ je: 0.144, text: '0,144 m² (32 × 45 cm)' });
    expect(flaechenUmrechnung('Laufmeter', sra3)).toEqual({
      je: 0.45,
      text: '0,45 m (längere Seite)',
    });
    expect(flaechenUmrechnung('Bogen', sra3)).toBeNull();
    expect(flaechenUmrechnung('m2', undefined)).toBeNull();
  });

  it('Kaschieren je m²: Druckbogen × Fläche, Zuschuss zurück in Bogen', () => {
    const p = produktion((x) => {
      x.arbeitsschritte.push({ id: 'S9100', name: 'Kaschieren', einheit: 'm2' });
      platz(x, 'AP-KLEIN').schritte.push({
        schrittId: 'S9100',
        leistung: { menge: 60, dauerMs: STD },
        zuschuss: { fest: 1 },
      });
    });
    const [, kasch] = zeilen(
      p,
      [
        {
          id: 'Z1',
          art: 'material',
          materialId: 'L4',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
        },
        {
          id: 'Z2',
          art: 'arbeitsgang',
          platzId: 'AP-KLEIN',
          schrittId: 'S9100',
          menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
        },
      ],
      [
        {
          id: 'T1',
          name: 'Karte',
          materialId: 'L4',
          endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
          jeProdukt: 1,
          druckbogen: { breiteUm: 320_000, hoeheUm: 450_000 },
          nutzenJeBogen: 20,
        },
      ],
    );
    // 1.000 ÷ 20 = 50 Druckbogen × 0,144 m² = 7,2 m²; Zuschuss 1 m² → 8,2 m²
    expect(kasch?.rechenweg[0]).toBe(
      'Menge aus dem Papierweg: 50 Druckbogen × 0,144 m² (32 × 45 cm) = 7,2',
    );
    expect(kasch?.mengeGesamt).toBe(8.2);
  });
});

describe('Arbeitsplatz inaktiv', () => {
  const p = () =>
    produktion((x) => {
      platz(x, 'AP-KLEIN').inaktiv = true;
    });

  it('wird nicht mehr vorgeschlagen', () => {
    expect(plaetzeFuerSchritt(produktion(), 'S0014').map((x) => x.id)).toContain('AP-KLEIN');
    expect(plaetzeFuerSchritt(p(), 'S0014').map((x) => x.id)).not.toContain('AP-KLEIN');
  });

  it('rechnet weiter, mit Hinweis', () => {
    const [z] = zeilen(p(), [hand('Z1', 'AP-KLEIN', 'S0014', 10)]);
    expect(z?.kostenVoll).not.toBeNull();
    expect(z?.hinweise).toContain('Kleine Maschinen ist inaktiv (Ersatzgerät, gesperrt)');
  });
});
