import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  bestandSetzen,
  findeMaterialNachArtikelnummer,
  leeresLager,
  materialHinzufuegen,
  naechsteMaterialId,
  pruefeMaterial,
  verfuegbarkeit,
  verfuegbarkeitsMeldung,
  type Lager,
} from './index';

const ohneId = {
  form: 'Bogen',
  sorte: 'Test',
  grammatur: 135,
  breiteUm: 320000,
  hoeheUm: 450000,
  laufrichtung: 'SB',
} as const;

function wert(e: { ok: boolean; wert?: Lager }): Lager {
  if (!e.ok || !e.wert) throw new Error('Ergebnis nicht ok');
  return e.wert;
}

describe('automatische ID', () => {
  it('vergibt fortlaufende IDs', () => {
    expect(naechsteMaterialId(leeresLager())).toBe('M0001');
    expect(naechsteMaterialId(BEISPIEL_LAGER)).toBe('M0001');
    const l = wert(materialHinzufuegen(leeresLager(), { ...ohneId, id: 'M0007' }));
    expect(naechsteMaterialId(l)).toBe('M0008');
  });
  it('materialHinzufuegen vergibt die ID, wenn sie fehlt oder leer ist', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), ohneId));
    const l2 = wert(materialHinzufuegen(l1, { ...ohneId, id: '  ' }));
    expect(l2.materialien.map((m) => m.id)).toEqual(['M0001', 'M0002']);
  });
});

describe('Artikelnummern und GTIN', () => {
  it('akzeptiert Artikelnummern und GTIN', () => {
    const e = pruefeMaterial({
      ...ohneId,
      id: 'X1',
      gtin: '4006381333931',
      artikelnummern: [
        { lieferant: 'Papier Union', nummer: 'BD-135-SRA3', url: 'https://example.com/p/1' },
      ],
    });
    expect(e.ok).toBe(true);
  });
  it('prüft Artikelnummern und GTIN', () => {
    const f = (x: unknown) => {
      const e = pruefeMaterial(x);
      return e.ok ? [] : e.fehler;
    };
    expect(f({ ...ohneId, id: 'X1', gtin: '12345' })).toContainEqual({
      pfad: 'gtin',
      meldung: 'GTIN muss 8, 12, 13 oder 14 Ziffern haben',
    });
    expect(
      f({ ...ohneId, id: 'X1', artikelnummern: [{ lieferant: '', nummer: 'A1' }] }),
    ).toContainEqual({ pfad: 'artikelnummern.0.lieferant', meldung: 'Pflichtfeld' });
    expect(
      f({
        ...ohneId,
        id: 'X1',
        artikelnummern: [{ lieferant: 'L', nummer: 'A1', url: 'kein link' }],
      }),
    ).toContainEqual({ pfad: 'artikelnummern.0.url', meldung: 'muss eine Webadresse sein' });
  });
  it('findet Material über die Artikelnummer, ohne Groß- und Kleinschreibung', () => {
    const l = wert(
      materialHinzufuegen(leeresLager(), {
        ...ohneId,
        artikelnummern: [{ lieferant: 'Papier Union', nummer: 'BD-135-SRA3' }],
      }),
    );
    expect(findeMaterialNachArtikelnummer(l, ' bd-135-sra3 ').map((m) => m.id)).toEqual(['M0001']);
    expect(
      findeMaterialNachArtikelnummer(l, 'BD-135-SRA3', 'papier union').map((m) => m.id),
    ).toEqual(['M0001']);
    expect(findeMaterialNachArtikelnummer(l, 'BD-135-SRA3', 'Andere GmbH')).toEqual([]);
    expect(findeMaterialNachArtikelnummer(l, 'gibtsnicht')).toEqual([]);
    expect(findeMaterialNachArtikelnummer(l, '  ')).toEqual([]);
  });
});

describe('verfuegbarkeit', () => {
  it('unterscheidet nicht gelagert, nicht vorrätig, zu wenig und vorrätig', () => {
    const l1 = wert(materialHinzufuegen(leeresLager(), ohneId));
    expect(verfuegbarkeit(l1, 'M0001').status).toBe('nicht_gelagert');
    const l2 = wert(
      bestandSetzen(l1, {
        materialId: 'M0001',
        lagerort: 'A',
        menge: 100,
        einheit: 'Bogen',
        reserviert: 100,
      }),
    );
    expect(verfuegbarkeit(l2, 'M0001')).toEqual({
      status: 'nicht_vorraetig',
      frei: 0,
      einheit: 'Bogen',
    });
    const l3 = wert(
      bestandSetzen(l2, {
        materialId: 'M0001',
        lagerort: 'B',
        menge: 300,
        einheit: 'Bogen',
        reserviert: 0,
      }),
    );
    expect(verfuegbarkeit(l3, 'M0001', 500)).toEqual({
      status: 'zu_wenig',
      frei: 300,
      einheit: 'Bogen',
    });
    expect(verfuegbarkeit(l3, 'M0001', 200).status).toBe('vorraetig');
    expect(verfuegbarkeit(BEISPIEL_LAGER, 'L1')).toEqual({
      status: 'vorraetig',
      frei: 10000,
      einheit: 'Bogen',
    });
  });
  it('wirft bei unbekanntem Material', () => {
    expect(() => verfuegbarkeit(leeresLager(), 'X9')).toThrow('Material X9 nicht gefunden');
  });
  it('liefert deutsche Meldungen', () => {
    expect(verfuegbarkeitsMeldung({ status: 'nicht_gelagert', frei: 0, einheit: 'Bogen' })).toBe(
      'Nicht am Lager geführt – bei Bedarf bestellen',
    );
    expect(verfuegbarkeitsMeldung({ status: 'nicht_vorraetig', frei: 0, einheit: 'Bogen' })).toBe(
      'Nicht vorrätig',
    );
    expect(verfuegbarkeitsMeldung({ status: 'zu_wenig', frei: 300, einheit: 'Bogen' }, 500)).toBe(
      'Nur 300 Bogen frei, 500 benötigt',
    );
    expect(verfuegbarkeitsMeldung({ status: 'vorraetig', frei: 10000, einheit: 'Bogen' })).toBe(
      '10.000 Bogen frei',
    );
    expect(verfuegbarkeitsMeldung({ status: 'vorraetig', frei: 4, einheit: 'Rolle' })).toBe(
      '4 Rollen frei',
    );
    expect(verfuegbarkeitsMeldung({ status: 'vorraetig', frei: 1, einheit: 'Rolle' })).toBe(
      '1 Rolle frei',
    );
    expect(verfuegbarkeitsMeldung({ status: 'vorraetig', frei: 1000, einheit: 'Stueck' })).toBe(
      '1.000 Stück frei',
    );
  });
});
