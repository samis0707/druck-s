import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  materialAendern,
  materialStatus,
  preisHinzufuegen,
  pruefeMaterial,
  type Lager,
  type Material,
} from './index';

/** Prüft die Eingabe und wirft bei Prüffehlern mit Meldungen. */
function material(eingabe: unknown): Material {
  const e = pruefeMaterial(eingabe);
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

/** BEISPIEL_LAGER mit Preisen für L1 und L8, gültig ab 1.10.2026. */
function lagerMitPreis(): Lager {
  let l: Lager = BEISPIEL_LAGER;
  for (const materialId of ['L1', 'L8']) {
    const e = preisHinzufuegen(l, {
      materialId,
      lieferant: 'Muster',
      gueltigAb: '2026-10-01',
      basis: materialId === 'L8' ? 'je100kg' : 'je1000',
      betragZehntelcent: 100_000,
    });
    if (!e.ok) throw new Error(JSON.stringify(e.fehler));
    l = e.wert;
  }
  return l;
}

const L1 = BEISPIEL_LAGER.materialien.find((m) => m.id === 'L1');
if (!L1) throw new Error('Material L1 fehlt in den Beispieldaten');

describe('Status Material (T69)', () => {
  it('ok: gültiger Preis und Pflichtangaben komplett', () => {
    const l = lagerMitPreis();
    expect(materialStatus(l, L1, '2026-10-30')).toEqual({ stand: 'ok', gruende: [] });
  });

  it('fehler: kein gültiger Preis zum Stichtag, Begründung mit deutschem Datum', () => {
    const l = lagerMitPreis();
    expect(materialStatus(l, L1, '2026-01-01')).toEqual({
      stand: 'fehler',
      gruende: ['kein gültiger Preis ab 01.01.2026'],
    });
    // Beispieldaten ohne Preise: gleiches Ergebnis
    expect(materialStatus(BEISPIEL_LAGER, L1, '2026-10-30')).toEqual({
      stand: 'fehler',
      gruende: ['kein gültiger Preis ab 30.10.2026'],
    });
  });

  it('hinweis: Grammatur fehlt (Bogen, Preis vorhanden)', () => {
    const l = lagerMitPreis();
    const luecke = {
      form: 'Bogen',
      id: 'L1',
      sorte: 'Test',
      breiteUm: 320_000,
      hoeheUm: 450_000,
    };
    expect(materialStatus(l, luecke, '2026-10-30')).toEqual({
      stand: 'hinweis',
      gruende: ['Grammatur fehlt'],
    });
  });

  it('hinweis: fehlende Pflichtangaben je nach Form (Rolle: Grammatur, Breite, Länge)', () => {
    const l = lagerMitPreis();
    const luecke = { form: 'Rolle', id: 'L8', sorte: 'Rolle Test' };
    expect(materialStatus(l, luecke, '2026-10-30')).toEqual({
      stand: 'hinweis',
      gruende: ['Grammatur fehlt', 'Breite fehlt', 'Länge fehlt'],
    });
  });

  it('fehler schlägt hinweis (beides zugleich → fehler, beide Begründungen)', () => {
    const luecke = {
      form: 'Bogen',
      id: 'X3',
      sorte: 'Test',
      breiteUm: 320_000,
      hoeheUm: 450_000,
    };
    expect(materialStatus(BEISPIEL_LAGER, luecke, '2026-10-30')).toEqual({
      stand: 'fehler',
      gruende: ['kein gültiger Preis ab 30.10.2026', 'Grammatur fehlt'],
    });
  });

  it('folgt den bestehenden Validierungen: Stueck ohne Grammatur ist in Ordnung', () => {
    const m = material({
      form: 'Stueck',
      id: 'L9',
      sorte: 'Kuvert',
      breiteUm: 220_000,
      hoeheUm: 110_000,
    });
    // Der bestehenden Validierung zufolge ist Grammatur bei Stueck kein Pflichtfeld
    const geaendert = materialAendern(BEISPIEL_LAGER, m);
    if (!geaendert.ok) throw new Error(JSON.stringify(geaendert.fehler));
    const e = preisHinzufuegen(geaendert.wert, {
      materialId: 'L9',
      lieferant: 'Muster',
      gueltigAb: '2026-10-01',
      basis: 'je1000',
      betragZehntelcent: 50_000,
    });
    if (!e.ok) throw new Error(JSON.stringify(e.fehler));
    expect(materialStatus(e.wert, m, '2026-10-30')).toEqual({ stand: 'ok', gruende: [] });
  });
});
