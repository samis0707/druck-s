import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  flaechenUmrechnung,
  preisHinzufuegen,
  rechneKalkulation,
  rechnePapierweg,
  type Kalkulation,
  type Lager,
  type Material,
  type Produktion,
  type Teil,
} from './index';

/** Orajet auf der Rolle 1.372 mm × 50 m, Rolle 82,89 € (= 1,208 €/m²; Nutzer 30.10.). */
const ORAJET: Material = {
  id: 'R-ORA',
  form: 'Rolle',
  kategorie: 'papier',
  sorte: 'Orajet 3164X',
  grammatur: 160,
  breiteUm: 1_372_000,
  laengeM: 50,
};

function lager(): Lager {
  const r = preisHinzufuegen(
    { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, ORAJET] },
    {
      materialId: 'R-ORA',
      lieferant: 'Complott',
      gueltigAb: '2026-01-01',
      basis: 'einheit',
      einheitName: 'Rolle',
      inhalt: 1,
      staffel: [{ ab: 1, betragZehntelcent: 82_890 }],
    },
  );
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

/** Latex: Rand 5 mm, Zuschuss 1 m² fest; dazu ein Laminator in Laufmetern. */
function produktion(): Produktion {
  const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as Produktion;
  const lfp = p.arbeitsplaetze?.find((a) => a.id === 'AP-LFP');
  const druck = lfp?.schritte[0];
  if (!lfp || !druck) throw new Error('AP-LFP fehlt');
  lfp.grenzen = { randUm: 5_000, formatMax: { breiteUm: 1_625_000, hoeheUm: 50_000_000 } };
  druck.zuschuss = { fest: 1 };
  p.arbeitsschritte.push({ id: 'S9100', name: 'Laminieren', einheit: 'Laufmeter' });
  lfp.schritte.push({ schrittId: 'S9100', leistung: { menge: 60, dauerMs: 3_600_000 } });
  return p;
}

const POSTER: Teil = {
  id: 'T1',
  name: 'Poster',
  materialId: 'R-ORA',
  endformat: { breiteUm: 500_000, hoeheUm: 700_000 },
  jeProdukt: 1,
};

function kalkulation(zeilen: Kalkulation['zeilen'], teil: Teil = POSTER): Kalkulation {
  return {
    id: 'K9001',
    titel: 'Poster',
    kunde: '',
    auflagen: [10],
    einheit: 'Stueck',
    gewinnProzent: 0,
    teile: [teil],
    zeilen,
  };
}

describe('Papierweg auf der Rolle', () => {
  it('Nutzen nebeneinander über die Rollenbreite, Abschnitt = eine Reihe; Laufmeter und m²', () => {
    const w = rechnePapierweg(POSTER, ORAJET, 10, { randUm: 5_000, zuschussFest: 1 });
    expect(w.rechenweg).toEqual([
      'Rolle 137,2 cm breit: 500 × 700 mm + 3 mm Beschnitt, Rand 5 mm → 2 nebeneinander, Abschnitt 70,6 cm lang',
      'Abschnitte: 10 × 1 ÷ 2 = 5 + Zuschuss 1 = 6 → 4,24 Laufmeter = 5,81 m²',
    ]);
    expect(w.druckbogenFormat).toEqual({ breiteUm: 1_372_000, hoeheUm: 706_000 });
    expect([w.nutzenJeBogen, w.druckbogen, w.rohbogen, w.schnitteEndschnitt]).toEqual([
      2,
      6,
      null,
      null,
    ]);
    expect(w.hinweise).toEqual([]);
  });

  it('gedreht, wenn es kürzer wird; Nutzen von Hand; zu breit', () => {
    // 900 × 400: ungedreht 1 nebeneinander je 40,6 cm, gedreht 3 nebeneinander je 90,6 cm (30,2 je Nutzen)
    const quer = { ...POSTER, endformat: { breiteUm: 900_000, hoeheUm: 400_000 } };
    expect(rechnePapierweg(quer, ORAJET, 9).rechenweg[0]).toBe(
      'Rolle 137,2 cm breit: 900 × 400 mm + 3 mm Beschnitt → 3 nebeneinander (gedreht), Abschnitt 90,6 cm lang',
    );
    expect(rechnePapierweg({ ...POSTER, nutzenJeBogen: 1 }, ORAJET, 10).rechenweg[0]).toBe(
      'Rolle 137,2 cm breit: 500 × 700 mm + 3 mm Beschnitt → 1 nebeneinander (von Hand), Abschnitt 70,6 cm lang',
    );
    const breit = { ...POSTER, endformat: { breiteUm: 1_500_000, hoeheUm: 1_500_000 } };
    expect(rechnePapierweg(breit, ORAJET, 1).hinweise).toEqual([
      'Endformat 1.500 × 1.500 mm passt nicht auf die Rolle (137,2 cm breit)',
    ]);
  });
});

describe('Kalkulation mit Rolle', () => {
  it('Material in m² aus dem Papierweg, Druck in m², Laminieren in Laufmetern (Abschnittslänge)', () => {
    const k = kalkulation([
      {
        art: 'material',
        id: 'Z1',
        materialId: 'R-ORA',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
      },
      {
        art: 'arbeitsgang',
        id: 'Z2',
        platzId: 'AP-LFP',
        schrittId: 'S0003',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
      },
      {
        art: 'arbeitsgang',
        id: 'Z3',
        platzId: 'AP-LFP',
        schrittId: 'S9100',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
      },
    ]);
    const a = rechneKalkulation(k, produktion(), lager(), '2026-10-30').auflagen[0];
    const [mat, druck, lam] = a?.zeilen ?? [];
    expect(mat?.einheit).toBe('m²');
    expect(mat?.rechenweg).toEqual([
      // Zuschuss 1 m² am Drucker = 1,03 Abschnitte → 2 Abschnitte
      'Menge aus dem Papierweg: 7 Abschnitte × 137,2 × 70,6 cm = 6,78 m² (brutto, Zuschuss 2 Abschnitte) = 6,78',
      'Material: 6,78 m² × 1,208 €/m² (Complott) = 8,19 €',
    ]);
    expect(druck?.rechenweg.slice(0, 3)).toEqual([
      'Menge aus dem Papierweg: 5 Abschnitte × 0,9686 m² (137,2 × 70,6 cm) = 4,843',
      'Leistung: 11 m²/h',
      'Zuschuss: 1 fest + 0 % = 1 → 5,84 m²',
    ]);
    expect(lam?.rechenweg[0]).toBe(
      'Menge aus dem Papierweg: 5 Abschnitte × 0,706 m (Abschnittslänge) = 3,53',
    );
  });

  it('Menge von Hand in m²; auf ganze Rollen; zu breite Rolle; Rohbogen-Schnitte gibt es nicht', () => {
    const k = kalkulation([
      { art: 'material', id: 'Z1', materialId: 'R-ORA', menge: { art: 'auflage', faktor: 0.48 } },
      {
        art: 'material',
        id: 'Z2',
        materialId: 'R-ORA',
        menge: { art: 'auflage', faktor: 0.48 },
        rundung: { art: 'packung' },
      },
      {
        art: 'arbeitsgang',
        id: 'Z3',
        platzId: 'AP-SCHN',
        schrittId: 'S0006',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'endschnitt' },
      },
    ]);
    const p = produktion();
    const lfp = p.arbeitsplaetze?.find((a) => a.id === 'AP-LFP');
    if (lfp?.grenzen?.formatMax)
      lfp.grenzen.formatMax = { breiteUm: 1_100_000, hoeheUm: 50_000_000 };
    const a = rechneKalkulation(
      {
        ...k,
        zeilen: [
          ...k.zeilen,
          {
            art: 'arbeitsgang',
            id: 'Z4',
            platzId: 'AP-LFP',
            schrittId: 'S0003',
            menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
          },
        ],
      },
      p,
      lager(),
      '2026-10-30',
    ).auflagen[0];
    const z = a?.zeilen;
    expect(z?.[0]?.rechenweg).toEqual(['Material: 4,8 m² × 1,208 €/m² (Complott) = 5,80 €']);
    expect(z?.[1]?.rechenweg).toEqual([
      'Benötigt 4,8 m² → einkalkuliert 68,6 (1 Rolle(n) à 68,6)',
      'Material: 1 Rolle × 82,89 € (Complott) = 82,89 €',
    ]);
    expect(z?.[2]?.hinweise).toContain(
      'Schnitte Endschnitt gibt es auf der Rolle nicht – Druckbogen (Abschnitte) wählen',
    );
    expect(a?.papierwege[0]?.papierweg.hinweise).toContain(
      'Rolle 1.372 mm breit – breiter als die Druckmaschine (höchstens 1.100 mm)',
    );
  });

  it('Laufmeter ohne Rolle weiter mit der längeren Seite', () => {
    const sra3 = { breiteUm: 320_000, hoeheUm: 450_000 };
    expect(flaechenUmrechnung('Laufmeter', sra3)?.text).toBe('0,45 m (längere Seite)');
    expect(flaechenUmrechnung('Laufmeter', sra3, 320_000)).toEqual({
      je: 0.32,
      text: '0,32 m (Abschnittslänge)',
    });
  });
});
