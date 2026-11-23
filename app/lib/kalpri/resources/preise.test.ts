import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  aktuellePreise,
  lagerAlsJson,
  lagerAusJson,
  materialHinzufuegen,
  naechstePreisId,
  preisHinzufuegen,
  preisHistorie,
  preisVergleichswerte,
  pruefeLager,
  type Lager,
  type Material,
  type Preis,
} from './index';

function wert(e: { ok: boolean; wert?: Lager }): Lager {
  if (!e.ok || !e.wert) throw new Error('Ergebnis nicht ok');
  return e.wert;
}
function material(l: Lager, id: string): Material {
  const m = l.materialien.find((x) => x.id === id);
  if (!m) throw new Error(`Material ${id} fehlt`);
  return m;
}
function preis(l: Lager, id: string): Preis {
  const p = (l.preise ?? []).find((x) => x.id === id);
  if (!p) throw new Error(`Preis ${id} fehlt`);
  return p;
}
function fehler(e: { ok: boolean; fehler?: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : (e.fehler ?? []);
}

const paketL4 = {
  materialId: 'L4',
  lieferant: 'Papier Union',
  artikelnummer: 'DK-350-SRA3',
  gueltigAb: '2026-09-01',
  basis: 'einheit',
  einheitName: 'Paket',
  inhalt: 125,
  staffel: [
    { ab: 1, betragZehntelcent: 18900 },
    { ab: 10, betragZehntelcent: 17500 },
  ],
};

describe('Preise anlegen', () => {
  it('Beispiel-Lager ohne Preise bleibt gültig', () => {
    expect(BEISPIEL_LAGER.preise).toBeUndefined();
    expect(pruefeLager(BEISPIEL_LAGER).ok).toBe(true);
  });

  it('vergibt Preis-IDs automatisch und hängt nur an', () => {
    expect(naechstePreisId(BEISPIEL_LAGER)).toBe('P0001');
    const l1 = wert(preisHinzufuegen(BEISPIEL_LAGER, paketL4));
    const l2 = wert(
      preisHinzufuegen(l1, {
        ...paketL4,
        gueltigAb: '2026-11-01',
        staffel: [{ ab: 1, betragZehntelcent: 19900 }],
      }),
    );
    expect((l2.preise ?? []).map((p) => p.id)).toEqual(['P0001', 'P0002']);
    expect(BEISPIEL_LAGER.preise).toBeUndefined();
    expect(l1.preise).toHaveLength(1);
  });

  it('meldet Fehler mit Pfad innerhalb des Preises', () => {
    expect(
      fehler(preisHinzufuegen(BEISPIEL_LAGER, { ...paketL4, materialId: 'L99' })),
    ).toContainEqual({ pfad: 'materialId', meldung: 'Material L99 nicht gefunden' });
    expect(
      fehler(preisHinzufuegen(BEISPIEL_LAGER, { ...paketL4, gueltigAb: '01.09.2026' })),
    ).toContainEqual({ pfad: 'gueltigAb', meldung: 'Datum im Format JJJJ-MM-TT' });
    expect(
      fehler(preisHinzufuegen(BEISPIEL_LAGER, { ...paketL4, gueltigAb: '2026-02-30' })),
    ).toContainEqual({ pfad: 'gueltigAb', meldung: 'Datum im Format JJJJ-MM-TT' });
    expect(
      fehler(
        preisHinzufuegen(BEISPIEL_LAGER, {
          ...paketL4,
          staffel: [{ ab: 10, betragZehntelcent: 1 }],
        }),
      ),
    ).toContainEqual({
      pfad: 'staffel',
      meldung: 'Staffel muss bei 1 beginnen und aufsteigend sein',
    });
    expect(fehler(preisHinzufuegen(BEISPIEL_LAGER, { ...paketL4, inhalt: 0 }))).toContainEqual({
      pfad: 'inhalt',
      meldung: 'muss größer als 0 sein',
    });
    expect(
      fehler(
        preisHinzufuegen(BEISPIEL_LAGER, {
          materialId: 'L9',
          lieferant: 'X',
          gueltigAb: '2026-01-01',
          basis: 'je100kg',
          betragZehntelcent: 1000,
        }),
      ),
    ).toContainEqual({ pfad: 'basis', meldung: 'je 100 kg nur bei Bogen und Rolle' });
    expect(
      fehler(
        preisHinzufuegen(BEISPIEL_LAGER, {
          materialId: 'L8',
          lieferant: 'X',
          gueltigAb: '2026-01-01',
          basis: 'je1000',
          betragZehntelcent: 1000,
        }),
      ),
    ).toContainEqual({ pfad: 'basis', meldung: 'je 1000 nur bei Bogen und Stück' });
    expect(
      fehler(preisHinzufuegen(BEISPIEL_LAGER, { ...paketL4, basis: 'jeKilo' })),
    ).toContainEqual({ pfad: 'basis', meldung: 'Basis muss einheit, je100kg oder je1000 sein' });
  });
});

describe('Preishistorie', () => {
  it('liefert die Historie und den am Stichtag gültigen Preis je Lieferant', () => {
    let l = wert(preisHinzufuegen(BEISPIEL_LAGER, paketL4));
    l = wert(
      preisHinzufuegen(l, {
        ...paketL4,
        gueltigAb: '2026-11-01',
        staffel: [{ ab: 1, betragZehntelcent: 19900 }],
      }),
    );
    l = wert(
      preisHinzufuegen(l, {
        materialId: 'L4',
        lieferant: 'Igepa',
        gueltigAb: '2026-10-01',
        basis: 'je100kg',
        betragZehntelcent: 290000,
      }),
    );
    expect(preisHistorie(l, 'L4').map((p) => p.id)).toEqual(['P0001', 'P0003', 'P0002']);
    expect(aktuellePreise(l, 'L4', '2026-10-15').map((p) => p.id)).toEqual(['P0003', 'P0001']);
    expect(aktuellePreise(l, 'L4', '2026-11-01').map((p) => p.id)).toEqual(['P0003', 'P0002']);
    expect(aktuellePreise(l, 'L4', '2026-08-31')).toEqual([]);
  });

  it('JSON mit Preisen bleibt verlustfrei', () => {
    const l = wert(preisHinzufuegen(BEISPIEL_LAGER, paketL4));
    const text = lagerAlsJson(l);
    expect(lagerAlsJson(wert(lagerAusJson(text)))).toBe(text);
  });
});

describe('preisVergleichswerte', () => {
  it('Bogen mit Preis je Paket und Staffel', () => {
    const l = wert(preisHinzufuegen(BEISPIEL_LAGER, paketL4));
    const v1 = preisVergleichswerte(material(l, 'L4'), preis(l, 'P0001'));
    expect(v1.jeEinheit?.zehntelcent).toBe(18900);
    expect(v1.je1000?.zehntelcent).toBe(151200);
    expect(v1.je100kg?.zehntelcent).toBe(300000);
    expect(preisVergleichswerte(material(l, 'L4'), preis(l, 'P0001'), 10).je1000?.zehntelcent).toBe(
      140000,
    );
  });

  it('Bogen mit Preis je 100 kg', () => {
    const l = wert(
      preisHinzufuegen(BEISPIEL_LAGER, {
        materialId: 'L1',
        lieferant: 'Igepa',
        gueltigAb: '2026-01-01',
        basis: 'je100kg',
        betragZehntelcent: 180000,
      }),
    );
    const v = preisVergleichswerte(material(l, 'L1'), preis(l, 'P0001'));
    expect(v.je1000?.zehntelcent).toBe(170100);
    expect(v.je100kg?.zehntelcent).toBe(180000);
    expect(v.jeEinheit).toBeUndefined();
  });

  it('Rolle mit Preis je Rolle', () => {
    let l = wert(
      materialHinzufuegen(BEISPIEL_LAGER, {
        form: 'Rolle',
        sorte: 'LFP Papier matt',
        grammatur: 200,
        breiteUm: 1370000,
        laengeM: 30,
      }),
    );
    l = wert(
      preisHinzufuegen(l, {
        materialId: 'M0001',
        lieferant: 'Antalis',
        gueltigAb: '2026-01-01',
        basis: 'einheit',
        einheitName: 'Rolle',
        inhalt: 1,
        staffel: [{ ab: 1, betragZehntelcent: 120000 }],
      }),
    );
    const v = preisVergleichswerte(material(l, 'M0001'), preis(l, 'P0001'));
    expect(v.jeRolle?.zehntelcent).toBe(120000);
    expect(v.jeLaufmeter?.zehntelcent).toBe(4000);
    expect(v.jeM2?.zehntelcent).toBe(2920);
    expect(v.je100kg?.zehntelcent).toBe(1459854);
    expect(v.je1000).toBeUndefined();
  });

  it('Stückware mit Preis je 1000', () => {
    const l = wert(
      preisHinzufuegen(BEISPIEL_LAGER, {
        materialId: 'L9',
        lieferant: 'Mayer-Kuvert',
        gueltigAb: '2026-01-01',
        basis: 'je1000',
        betragZehntelcent: 45000,
      }),
    );
    const v = preisVergleichswerte(material(l, 'L9'), preis(l, 'P0001'));
    expect(v.je1000?.zehntelcent).toBe(45000);
    expect(v.je100kg).toBeUndefined();
  });

  it('wirft, wenn Preis und Material nicht zusammenpassen', () => {
    const l = wert(preisHinzufuegen(BEISPIEL_LAGER, paketL4));
    expect(() => preisVergleichswerte(material(l, 'L1'), preis(l, 'P0001'))).toThrow(
      'Preis P0001 gehört nicht zu Material L1',
    );
  });
});
