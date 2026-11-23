import { describe, expect, it } from 'vitest';
import { zehntelcent } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationHinzufuegen,
  leereKalkulationen,
  preisHinzufuegen,
  pruefeProduktion,
  rechneKalkulation,
  rolleUebernehmen,
  type Kalkulation,
  type Lager,
  type Material,
  type Produktion,
} from './index';

// T105: Rollen-Vorschlag, Abstand zwischen Nutzen, Mindest-Rollenbreite der Maschine

const HEUTE = '2026-11-09';
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** HP Latex: Rolle 60–160 cm, Rand 5 mm, 10 mm Abstand zwischen den Nutzen. */
function produktion(abstand = 10_000): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const lfp = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-LFP');
  if (!lfp) throw new Error('AP-LFP');
  lfp.grenzen = {
    ...lfp.grenzen,
    formatMin: mm(600, 100),
    formatMax: mm(1600, 50_000),
    randUm: 5000,
    abstandUm: abstand,
  };
  expect(pruefeProduktion(p).ok).toBe(true);
  return p;
}

const rolle = (id: string, breiteMm: number, sorte = 'Posterpapier matt', grammatur = 200) =>
  ({
    id,
    form: 'Rolle',
    sorte,
    kategorie: 'papier',
    grammatur,
    breiteUm: breiteMm * 1000,
    laengeM: 50,
    kernUm: 76_000,
  }) as Material;

/** Rollen 137,2 / 155 cm (Posterpapier 200 g), dazu zu schmal, zu breit, andere Sorte. */
function lager(mitPreisen = true): Lager {
  const rollen: [Material, number][] = [
    [rolle('M-P1372', 1372), 140_000],
    [rolle('M-P1550', 1550), 158_000],
    [rolle('M-P0105', 105), 20_000],
    [rolle('M-P1800', 1800), 180_000],
    [rolle('M-B1372', 1372, 'Blueback'), 120_000],
    [rolle('M-P1372-135', 1372, 'Posterpapier matt', 135), 100_000],
  ];
  let l: Lager = {
    ...BEISPIEL_LAGER,
    materialien: [...BEISPIEL_LAGER.materialien, ...rollen.map(([m]) => m)],
  };
  if (!mitPreisen) return l;
  for (const [m, betrag] of rollen) {
    const r = preisHinzufuegen(l, {
      materialId: m.id,
      lieferant: 'Großhandel',
      basis: 'einheit',
      einheitName: 'Rolle',
      inhalt: 1,
      staffel: [{ ab: 1, betragZehntelcent: betrag }],
      gueltigAb: '2026-01-01',
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    l = r.wert;
  }
  return l;
}

function plakat(materialId: string, auflagen = [50]): Kalkulation {
  const r = kalkulationHinzufuegen(leereKalkulationen(), {
    titel: 'Plakat A1',
    auflagen,
    einheit: 'Stueck',
    teile: [
      {
        id: 'T1',
        name: 'Plakat',
        endformat: mm(594, 841),
        jeProdukt: 1,
        materialId,
        beschnittUm: 0,
      },
    ],
    zeilen: [
      {
        id: 'Z1',
        art: 'material',
        materialId,
        menge: { art: 'papierweg', teilId: 'T1', wert: 'rohbogen' },
      },
      {
        id: 'Z2',
        art: 'arbeitsgang',
        platzId: 'AP-LFP',
        schrittId: 'S0003',
        menge: { art: 'papierweg', teilId: 'T1', wert: 'druckbogen' },
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert.kalkulationen[0] as Kalkulation;
}

const weg = (k: Kalkulation, p = produktion(), l = lager()) =>
  rechneKalkulation(k, p, l, HEUTE).auflagen[0]?.papierwege[0]?.papierweg;

describe('T105 Rollen-Vorschlag', () => {
  it('nur gleiche Sorte und Grammatur, Breite 60–160 cm, nach Breite sortiert', () => {
    const w = weg(plakat('M-P1550'));
    expect(w?.rollenVorschlag?.map((v) => [v.materialId, v.aktuell])).toEqual([
      ['M-P1372', false],
      ['M-P1550', true],
    ]);
  });

  it('50 × A1 auf 155 cm: Hinweis auf 137,2 cm (weniger m², günstiger)', () => {
    const w = weg(plakat('M-P1550'));
    expect(w?.hinweise).toContain(
      'Weniger Papier mit Rolle M-P1372 (137,2 cm): 29,189 m² statt 32,976 m², 59,58 € statt 67,24 € – 86 % statt 76 % genutzt',
    );
    const v = w?.rollenVorschlag?.find((x) => x.materialId === 'M-P1372');
    expect(v).toEqual({
      materialId: 'M-P1372',
      breiteUm: 1_372_000,
      nutzenQuer: 2,
      gedreht: false,
      laufmeter: 21.275,
      quadratmeter: 29.189,
      genutztProzent: 86,
      kosten: zehntelcent(59_575),
      aktuell: false,
    });
  });

  it('beste Rolle schon gewählt: kein Hinweis; ohne Preise zählen die m²', () => {
    expect(weg(plakat('M-P1372'))?.hinweise.some((h) => h.startsWith('Weniger Papier'))).toBe(
      false,
    );
    const ohnePreis = weg(plakat('M-P1550'), produktion(), lager(false));
    expect(ohnePreis?.hinweise).toContain(
      'Weniger Papier mit Rolle M-P1372 (137,2 cm): 29,189 m² statt 32,976 m² – 86 % statt 76 % genutzt',
    );
  });

  it('Rechenweg nennt den Abstand; ohne Abstand an der Maschine kein Abstand', () => {
    expect(weg(plakat('M-P1372'))?.rechenweg[0]).toBe(
      'Rolle 137,2 cm breit: 594 × 841 mm + 0 mm Beschnitt, Rand 5 mm, Abstand 10 mm → 2 nebeneinander, Abschnitt 85,1 cm lang',
    );
    expect(weg(plakat('M-P1372'), produktion(0))?.rechenweg[0]).toBe(
      'Rolle 137,2 cm breit: 594 × 841 mm + 0 mm Beschnitt, Rand 5 mm → 2 nebeneinander, Abschnitt 84,1 cm lang',
    );
  });

  it('Rolle schmaler als die Maschine: Hinweis', () => {
    expect(weg(plakat('M-P0105'))?.hinweise).toContain(
      'Rolle 105 mm breit – schmaler als die Druckmaschine (mindestens 600 mm)',
    );
  });
});

describe('T105 Rolle übernehmen', () => {
  it('Teil und Materialzeile auf die neue Rolle, sonst nichts', () => {
    const k = plakat('M-P1550');
    const neu = rolleUebernehmen(k, 'T1', 'M-P1372');
    expect(neu.teile?.[0]?.materialId).toBe('M-P1372');
    const z1 = neu.zeilen[0];
    expect(z1?.art === 'material' ? z1.materialId : null).toBe('M-P1372');
    expect(neu.zeilen[1]).toEqual(k.zeilen[1]);
    expect(rolleUebernehmen(k, 'T9', 'M-P1372')).toBe(k);
  });
});
