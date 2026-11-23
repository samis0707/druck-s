import { describe, expect, it } from 'vitest';
import {
  STANDARD_FORMATE,
  berechneRaster,
  findeFormat,
  formatName,
  leereAusschiessVorlagen,
  naechsteVorlagenId,
  pruefeAusschiessVorlagen,
  rasterEingabe,
  schemaText,
} from './index';

const SRA3 = { breiteUm: 330_000, hoeheUm: 487_000 };
const A5_OFFEN = { breiteUm: 296_000, hoeheUm: 210_000 };

describe('Formate und Ausschießschemas', () => {
  it('leer = Standardformate, gültig; IDs und Namen eindeutig', () => {
    const leer = leereAusschiessVorlagen();
    expect(leer.formate.map((f) => f.name)).toEqual([
      'A3',
      'A4',
      'A5',
      'A6',
      'DIN lang',
      'Visitenkarte',
      'SRA3',
    ]);
    expect(pruefeAusschiessVorlagen(leer).ok).toBe(true);
    const doppelt = pruefeAusschiessVorlagen({
      version: 1,
      formate: [...STANDARD_FORMATE, { id: 'F-0001', name: ' a5 ', breiteUm: 1, hoeheUm: 1 }],
      schemas: [
        { id: 'AS-0001', name: 'Broschüre A5' },
        { id: 'AS-0001', name: 'Flyer' },
      ],
    });
    expect(doppelt.ok ? [] : doppelt.fehler).toEqual([
      { pfad: 'formate.2.name', meldung: 'Name doppelt: A5' },
      { pfad: 'formate.7.name', meldung: 'Name doppelt: a5' },
      { pfad: 'schemas.0.id', meldung: 'ID doppelt: AS-0001' },
      { pfad: 'schemas.1.id', meldung: 'ID doppelt: AS-0001' },
    ]);
  });

  it('nächste ID, Format nach Name oder Maß finden', () => {
    expect(naechsteVorlagenId([{ id: 'AS-0002' }, { id: 'eigen' }], 'AS')).toBe('AS-0003');
    expect(naechsteVorlagenId(STANDARD_FORMATE, 'F')).toBe('F-0001');
    expect(findeFormat(' a5', STANDARD_FORMATE)?.breiteUm).toBe(148_000);
    expect(findeFormat('B5', STANDARD_FORMATE)).toBeNull();
    expect(formatName({ breiteUm: 210_000, hoeheUm: 148_000 }, STANDARD_FORMATE)).toBe('A5');
    expect(formatName({ breiteUm: 170_000, hoeheUm: 240_000 }, STANDARD_FORMATE)).toBeNull();
  });

  it('ohne Schema: Steg 2 × Beschnitt, Drehung erlaubt, Rand der Maschine rundum', () => {
    expect(
      rasterEingabe({ bogen: SRA3, endformat: A5_OFFEN, beschnittUm: 3000, randUm: 4000 }),
    ).toEqual({
      bogen: SRA3,
      raender: { greiferUm: 4000, hintenUm: 4000, linksUm: 4000, rechtsUm: 4000 },
      endformat: A5_OFFEN,
      beschnittUm: 3000,
      steg: { xUm: 6000, yUm: 6000 },
      drehungErlaubt: true,
    });
    const r = berechneRaster(
      rasterEingabe({ bogen: SRA3, endformat: A5_OFFEN, beschnittUm: 3000, randUm: 4000 }),
    );
    expect(r.ok && r.wert.nutzen).toBe(2);
  });

  it('Schema gibt Beschnitt, Steg, Raster, größere Ränder vor; Kurzbeschreibung', () => {
    const schema = {
      id: 'AS-0001',
      name: 'Visitenkarte ohne Beschnitt',
      beschnittUm: 0,
      steg: { xUm: 0, yUm: 0 },
      raster: { spalten: 3, zeilen: 8 },
      raender: { greiferUm: 10_000, hintenUm: 0, linksUm: 0, rechtsUm: 0 },
      endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
    };
    const e = rasterEingabe({
      bogen: SRA3,
      endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
      beschnittUm: 3000,
      randUm: 4000,
      schema,
    });
    expect(e.raender).toEqual({ greiferUm: 10_000, hintenUm: 4000, linksUm: 4000, rechtsUm: 4000 });
    expect(e).toMatchObject({
      beschnittUm: 0,
      steg: { xUm: 0, yUm: 0 },
      raster: { spalten: 3, zeilen: 8 },
    });
    const r = berechneRaster(e);
    expect(r.ok && r.wert.nutzen).toBe(24);
    expect(schemaText(schema)).toBe(
      'für 85 × 55 mm · Raster 3 × 8 · Beschnitt 0 mm · Steg 0 mm · Greiferrand 10 mm',
    );
    expect(schemaText({ id: 'AS-0002', name: 'leer' })).toBe('wie automatisch');
  });
});
