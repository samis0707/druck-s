import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  bestesRaster,
  kalkulationHinzufuegen,
  leereKalkulationen,
  rechnePapierweg,
  rechnePapierwege,
  schnitteFuerRaster,
  type Kalkulation,
  type Lager,
  type Material,
  type Teil,
} from './index';

const JUWEL: Material = {
  id: 'M0002',
  sorte: 'Juwel Premium Card glatt',
  grammatur: 320,
  dickeUm: 380,
  form: 'Bogen',
  breiteUm: 650_000,
  hoeheUm: 920_000,
};

const GARDA_135: Material = {
  id: 'M0004',
  sorte: 'GardaMatt Art',
  grammatur: 135,
  form: 'Bogen',
  breiteUm: 630_000,
  hoeheUm: 880_000,
};

const GARDA_250_70: Material = {
  id: 'M0005',
  sorte: 'GardaMatt Art',
  grammatur: 250,
  form: 'Bogen',
  breiteUm: 700_000,
  hoeheUm: 1_000_000,
};

const ROLLE: Material = {
  id: 'R1',
  sorte: 'Banner',
  grammatur: 510,
  form: 'Rolle',
  breiteUm: 1_600_000,
  laengeM: 50,
};

/** Visitenkarten 85 × 55, Druckbogen 32,5 × 46, Rand 4 mm (Digitaldruck), Zuschuss 2 % + 10. */
const KARTE: Teil = {
  id: 'T1',
  name: 'Karte',
  materialId: 'M0002',
  endformat: { breiteUm: 85_000, hoeheUm: 55_000 },
  jeProdukt: 1,
  druckbogen: { breiteUm: 325_000, hoeheUm: 460_000 },
};

/** Digitaldruck: Rand 4 mm, Zuschuss 2 % + 10. */
const TONER = { randUm: 4000, zuschussFest: 10, zuschussProzent: 2 };

/** Broschüre, Inhalt 16 Seiten: offene A4-Doppelseite, 4 offene Bogen je Heft. */
const INHALT: Teil = {
  id: 'T2',
  name: 'Inhalt',
  materialId: 'M0004',
  endformat: { breiteUm: 210_000, hoeheUm: 297_000 },
  offenesFormat: { breiteUm: 420_000, hoeheUm: 297_000 },
  jeProdukt: 4,
  druckbogen: { breiteUm: 440_000, hoeheUm: 315_000 },
};

/** Register: Blatt A4 + Tab 222 × 297, ohne Beschnitt, 10 Blatt je Satz. */
const REGISTER: Teil = {
  id: 'T3',
  name: 'Registerblatt',
  materialId: 'M0005',
  endformat: { breiteUm: 222_000, hoeheUm: 297_000 },
  jeProdukt: 10,
  druckbogen: { breiteUm: 487_000, hoeheUm: 330_000 },
  beschnittUm: 0,
};

/** Zuschuss 2 % + 10 ohne Rand. */
const ZUSCHUSS = { zuschussFest: 10, zuschussProzent: 2 };

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : e.fehler;
}

describe('Raster und Schnitte', () => {
  it('bestes Raster probiert beide Lagen, bei Gleichstand ungedreht', () => {
    const roh = { breiteUm: 700_000, hoeheUm: 1_000_000 };
    expect(bestesRaster(roh, { breiteUm: 487_000, hoeheUm: 330_000 })).toEqual({
      spalten: 2,
      zeilen: 2,
      gedreht: true,
      anzahl: 4,
    });
    expect(
      bestesRaster(
        { breiteUm: 650_000, hoeheUm: 920_000 },
        { breiteUm: 325_000, hoeheUm: 460_000 },
      ),
    ).toEqual({ spalten: 2, zeilen: 2, gedreht: false, anzahl: 4 });
    expect(bestesRaster({ breiteUm: 100_000, hoeheUm: 100_000 }, roh).anzahl).toBe(0);
  });

  it('Vierteln: 3 Schnitte einzeln, 2 gestapelt; Dritteln 2', () => {
    expect(
      schnitteFuerRaster({ spalten: 2, zeilen: 2, gedreht: false, anzahl: 4 }, false, false),
    ).toEqual({ einzeln: 3, gestapelt: 2 });
    expect(
      schnitteFuerRaster({ spalten: 3, zeilen: 1, gedreht: false, anzahl: 3 }, false, false),
    ).toEqual({ einzeln: 2, gestapelt: 2 });
    expect(
      schnitteFuerRaster({ spalten: 0, zeilen: 0, gedreht: false, anzahl: 0 }, true, true),
    ).toEqual({ einzeln: 0, gestapelt: 0 });
  });

  it('Endschnitt 3 × 7 mit Beschnitt: 48 Schnitte einzeln, 20 mit Streifen aufeinander', () => {
    expect(
      schnitteFuerRaster({ spalten: 3, zeilen: 7, gedreht: false, anzahl: 21 }, true, true),
    ).toEqual({ einzeln: 48, gestapelt: 20 });
  });
});

describe('Papierweg eines Teils', () => {
  it('Visitenkarten 500 Stück: 21 Nutzen, 35 Druckbogen, 9 Rohbogen', () => {
    const p = rechnePapierweg(KARTE, JUWEL, 500, TONER);
    expect(p).toMatchObject({
      nutzenJeBogen: 21,
      nutzenHerkunft: 'berechnet',
      nutzenRaster: { spalten: 3, zeilen: 7, gedreht: false, anzahl: 21 },
      druckbogenNetto: 24,
      zuschuss: 11,
      druckbogen: 35,
      druckbogenJeRohbogen: 4,
      rohbogen: 9,
      druckbogenAusRoh: 36,
      schnitteVorschneiden: { einzeln: 3, gestapelt: 2 },
      schnitteEndschnitt: { einzeln: 48, gestapelt: 20 },
      dickeUm: 380,
      stapelhoeheUm: 13_300,
      papierGenutztProzent: 66,
      hinweise: [],
    });
    expect(p.rechenweg).toEqual([
      'Nutzen: 85 × 55 mm + 3 mm Beschnitt, Rand 4 mm auf 32,5 × 46 cm → 3 × 7 = 21',
      'Druckbogen: 500 × 1 ÷ 21 = 24 + Zuschuss 11 (2 % + 10) = 35',
      'Rohbogen 65 × 92 cm: 35 ÷ 4 = 9 → 36 Druckbogen, Vorschneiden 3 Schnitte (2 gestapelt)',
      'Endschnitt: 48 Schnitte je Stapel (20, wenn Streifen aufeinander)',
    ]);
  });

  it('Broschüre: offenes Format gibt 1 Nutzen statt 2 Seiten-Nutzen', () => {
    const p = rechnePapierweg(INHALT, GARDA_135, 100, ZUSCHUSS);
    expect(p).toMatchObject({
      nutzenJeBogen: 1,
      druckbogenNetto: 400,
      zuschuss: 18,
      druckbogen: 418,
      druckbogenJeRohbogen: 4,
      rohRaster: { spalten: 2, zeilen: 2, gedreht: true, anzahl: 4 },
      rohbogen: 105,
      druckbogenAusRoh: 420,
      papierGenutztProzent: 90,
    });
    expect(p.rechenweg[0]).toBe(
      'Nutzen: offen 420 × 297 mm + 3 mm Beschnitt auf 44 × 31,5 cm → 1 × 1 = 1',
    );
    const ohneOffen = rechnePapierweg(
      { ...INHALT, offenesFormat: undefined },
      GARDA_135,
      100,
      ZUSCHUSS,
    );
    expect(ohneOffen.nutzenJeBogen).toBe(2);
  });

  it('Register ohne Beschnitt: 2 Nutzen, 520 Druckbogen, 130 Rohbogen 70 × 100', () => {
    const p = rechnePapierweg(REGISTER, GARDA_250_70, 100, ZUSCHUSS);
    expect(p).toMatchObject({
      nutzenJeBogen: 2,
      druckbogen: 520,
      druckbogenJeRohbogen: 4,
      rohbogen: 130,
      schnitteEndschnitt: { einzeln: 5, gestapelt: 5 },
    });
    // ohne gemessene Dicke und ohne Oberfläche: Standardvolumen 1,0 → 250 µm
    expect(p.dickeUm).toBe(250);
  });

  it('Nutzen von Hand, ohne Druckbogen: gedruckt wird auf dem Rohbogen', () => {
    const teil: Teil = {
      id: 'T1',
      name: 'Plakat',
      materialId: 'M0005',
      endformat: { breiteUm: 680_000, hoeheUm: 980_000 },
      jeProdukt: 1,
      nutzenJeBogen: 1,
    };
    const p = rechnePapierweg(teil, GARDA_250_70, 50);
    expect(p).toMatchObject({
      nutzenHerkunft: 'hand',
      nutzenRaster: null,
      druckbogen: 50,
      druckbogenJeRohbogen: 1,
      rohbogen: 50,
      schnitteVorschneiden: { einzeln: 0, gestapelt: 0 },
      schnitteEndschnitt: null,
    });
    expect(p.rechenweg).toEqual([
      'Nutzen je Druckbogen: 1 (von Hand)',
      'Druckbogen: 50 × 1 ÷ 1 = 50',
      'Rohbogen 70 × 100 cm: 50 (gedruckt wird auf dem Rohbogen)',
    ]);
  });

  it('meldet fehlendes Material, Rolle, zu großen Druckbogen und zu großes Endformat', () => {
    expect(rechnePapierweg(KARTE, undefined, 100).hinweise).toEqual([
      'Material M0002 nicht im Lager',
    ]);
    expect(rechnePapierweg({ ...KARTE, druckbogen: undefined }, undefined, 100).hinweise).toEqual([
      'Material M0002 nicht im Lager',
      'Druckbogen-Format fehlt – Nutzen nicht berechnet',
    ]);
    expect(rechnePapierweg({ ...KARTE, materialId: 'R1' }, ROLLE, 100).hinweise).toEqual([
      'Druckbogen gilt nicht für Rollen – Abschnitte aus der Rollenbreite',
    ]);
    const gross = rechnePapierweg(
      { ...KARTE, druckbogen: { breiteUm: 700_000, hoeheUm: 1_000_000 } },
      JUWEL,
      100,
      TONER,
    );
    expect(gross.hinweise).toEqual([
      'Druckbogen 70 × 100 cm passt nicht in den Rohbogen 65 × 92 cm',
    ]);
    expect(gross.rohbogen).toBeNull();
    const zuGross = rechnePapierweg(
      { ...KARTE, endformat: { breiteUm: 400_000, hoeheUm: 500_000 } },
      JUWEL,
      100,
      TONER,
    );
    expect(zuGross.hinweise).toEqual([
      'Endformat 400 × 500 mm passt nicht auf den Druckbogen 32,5 × 46 cm',
    ]);
    expect(zuGross.druckbogen).toBeNull();
  });
});

describe('Teile an der Kalkulation', () => {
  const basis = {
    titel: 'Visitenkarten',
    auflagen: [100, 500],
    einheit: 'Stueck',
    zeilen: [],
  };

  it('alte Kalkulationen ohne Teile bleiben gültig, Teile werden geprüft', () => {
    expect(fehler(kalkulationHinzufuegen(leereKalkulationen(), basis))).toEqual([]);
    const nullJe = kalkulationHinzufuegen(leereKalkulationen(), {
      ...basis,
      teile: [KARTE, { ...KARTE, id: 'T2', jeProdukt: 0 }],
    });
    expect(fehler(nullJe)).toEqual([
      { pfad: 'teile.1.jeProdukt', meldung: 'muss größer als 0 sein' },
    ]);
    const gleicheId = kalkulationHinzufuegen(leereKalkulationen(), {
      ...basis,
      teile: [KARTE, { ...KARTE, name: 'Rückseite' }],
    });
    expect(fehler(gleicheId)).toEqual([{ pfad: 'teile.1.id', meldung: 'Teil doppelt: T1' }]);
  });

  it('rechnet die Papierwege aller Teile je Auflage mit dem Material aus dem Lager', () => {
    const lager: Lager = { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, JUWEL] };
    const k: Kalkulation = wert(
      kalkulationHinzufuegen(leereKalkulationen(), { ...basis, teile: [KARTE] }),
    ).kalkulationen[0] as Kalkulation;
    const wege = rechnePapierwege(k, lager, { T1: TONER });
    expect(wege).toHaveLength(1);
    expect(wege[0]?.auflagen.map((p) => [p.auflage, p.druckbogen, p.rohbogen])).toEqual([
      [100, 16, 4],
      [500, 35, 9],
    ]);
    // ohne Druckangaben: kein Rand (dann passen 25 Nutzen gedreht), kein Zuschuss
    const ohne = rechnePapierwege(k, lager);
    expect(ohne[0]?.auflagen.map((p) => [p.nutzenJeBogen, p.druckbogen])).toEqual([
      [25, 4],
      [25, 20],
    ]);
  });
});
