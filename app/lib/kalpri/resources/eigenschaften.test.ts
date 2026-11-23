import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  dickeHinweis,
  dickeText,
  effektiveDicke,
  filterMaterialien,
  kategorieVon,
  laufrichtungHinweis,
  pruefeLager,
  pruefeMaterial,
  type Material,
} from './index';

const bogen = {
  id: 'X1',
  form: 'Bogen',
  sorte: 'Test',
  grammatur: 100,
  breiteUm: 320000,
  hoeheUm: 450000,
  laufrichtung: 'SB',
} as const;

function ohneLaufrichtung(): Record<string, unknown> {
  const o: Record<string, unknown> = { ...bogen };
  delete o['laufrichtung'];
  return o;
}

function material(eingabe: unknown): Material {
  const e = pruefeMaterial(eingabe);
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(eingabe: unknown) {
  const e = pruefeMaterial(eingabe);
  return e.ok ? [] : e.fehler;
}

describe('neue Felder', () => {
  it('Laufrichtung ist bei Bogen optional, falsche Werte bleiben Fehler', () => {
    expect(pruefeMaterial(ohneLaufrichtung()).ok).toBe(true);
    expect(fehler({ ...bogen, laufrichtung: 'XY' })).toContainEqual({
      pfad: 'laufrichtung',
      meldung: 'Laufrichtung muss SB oder BB sein',
    });
  });

  it('prüft Kategorie, Oberfläche und Volumen', () => {
    expect(
      pruefeMaterial({ ...bogen, kategorie: 'kuvert', oberflaeche: 'gestrichen', volumen: 1.15 })
        .ok,
    ).toBe(true);
    expect(fehler({ ...bogen, kategorie: 'karton' })).toContainEqual({
      pfad: 'kategorie',
      meldung: 'Kategorie muss papier, kuvert, tuete, verpackung oder sonstiges sein',
    });
    expect(fehler({ ...bogen, oberflaeche: 'matt' })).toContainEqual({
      pfad: 'oberflaeche',
      meldung: 'Oberfläche muss ungestrichen, gestrichen oder beschichtet sein',
    });
    expect(fehler({ ...bogen, volumen: 0 })).toContainEqual({
      pfad: 'volumen',
      meldung: 'muss größer als 0 sein',
    });
    expect(fehler({ ...bogen, volumen: 6 })).toContainEqual({
      pfad: 'volumen',
      meldung: 'höchstens 5',
    });
    expect(fehler({ ...bogen, volumen: 1.234 })).toContainEqual({
      pfad: 'volumen',
      meldung: 'höchstens 2 Nachkommastellen',
    });
  });

  it('Beispiel-Lager hat Kategorie und Oberfläche und bleibt gültig', () => {
    expect(pruefeLager(BEISPIEL_LAGER).ok).toBe(true);
    const l9 = BEISPIEL_LAGER.materialien.find((m) => m.id === 'L9');
    expect(l9?.kategorie).toBe('kuvert');
    expect(BEISPIEL_LAGER.materialien.filter((m) => m.kategorie === 'papier')).toHaveLength(8);
  });
});

describe('effektiveDicke', () => {
  it('gemessen vor Volumen vor Standard', () => {
    expect(effektiveDicke(material({ ...bogen, dickeUm: 130, volumen: 1.2 }))).toEqual({
      um: 130,
      herkunft: 'gemessen',
    });
    expect(effektiveDicke(material({ ...bogen, volumen: 1.15 }))).toEqual({
      um: 115,
      herkunft: 'volumen',
      volumen: 1.15,
    });
    expect(effektiveDicke(material({ ...bogen, oberflaeche: 'gestrichen' }))).toEqual({
      um: 90,
      herkunft: 'geschaetzt',
      volumen: 0.9,
    });
    expect(effektiveDicke(material({ ...bogen, oberflaeche: 'ungestrichen' }))).toEqual({
      um: 120,
      herkunft: 'geschaetzt',
      volumen: 1.2,
    });
    expect(effektiveDicke(material(bogen))).toEqual({
      um: 100,
      herkunft: 'geschaetzt',
      volumen: 1,
    });
  });

  it('keine Annahme bei beschichtet oder ohne Grammatur', () => {
    expect(effektiveDicke(material({ ...bogen, oberflaeche: 'beschichtet' }))).toBeUndefined();
    expect(
      effektiveDicke(
        material({ id: 'S1', form: 'Stueck', sorte: 'Tüte', breiteUm: 1, hoeheUm: 1 }),
      ),
    ).toBeUndefined();
  });

  it('eigene Standardwerte und Rundung auf ganze µm', () => {
    expect(
      effektiveDicke(material({ ...bogen, grammatur: 135, oberflaeche: 'gestrichen' }), {
        gestrichen: 0.85,
        ungestrichen: 1.3,
        ohne: 1,
      }),
    ).toEqual({ um: 115, herkunft: 'geschaetzt', volumen: 0.85 });
  });
});

describe('Texte und Hinweise', () => {
  it('zeigt die Herkunft der Dicke', () => {
    expect(dickeText({ um: 130, herkunft: 'gemessen' })).toBe('130 µm (gemessen)');
    expect(dickeText({ um: 115, herkunft: 'volumen', volumen: 1.15 })).toBe(
      '≈ 115 µm aus Volumen 1,15',
    );
    expect(dickeText({ um: 90, herkunft: 'geschaetzt', volumen: 0.9 })).toBe(
      '≈ 90 µm (geschätzt, Standardvolumen 0,9)',
    );
    expect(dickeText(undefined)).toBe('Dicke unbekannt');
  });

  it('meldet mehr als 10 % Abweichung zwischen Dicke und Volumen', () => {
    expect(dickeHinweis(material({ ...bogen, dickeUm: 110, volumen: 1 }))).toBeNull();
    expect(dickeHinweis(material({ ...bogen, dickeUm: 111, volumen: 1 }))).toBe(
      'Dicke 111 µm passt nicht zu Volumen 1,0 (erwartet 100 µm)',
    );
    expect(dickeHinweis(material({ ...bogen, dickeUm: 111 }))).toBeNull();
  });

  it('Hinweis bei Bogen ohne Laufrichtung', () => {
    expect(laufrichtungHinweis(material(ohneLaufrichtung()))).toBe(
      'Laufrichtung unbekannt, bitte prüfen',
    );
    expect(laufrichtungHinweis(material(bogen))).toBeNull();
    expect(
      laufrichtungHinweis(
        material({ id: 'S1', form: 'Stueck', sorte: 'Kuvert', breiteUm: 1, hoeheUm: 1 }),
      ),
    ).toBeNull();
  });
});

describe('filterMaterialien', () => {
  it('Kategorie ohne Angabe: Stück → sonstiges, sonst papier', () => {
    expect(kategorieVon(material(bogen))).toBe('papier');
    expect(
      kategorieVon(material({ id: 'S1', form: 'Stueck', sorte: 'X', breiteUm: 1, hoeheUm: 1 })),
    ).toBe('sonstiges');
  });

  it('filtert nach Kategorie, Form und Artikelnummer, kombinierbar', () => {
    const ids = (f: Parameters<typeof filterMaterialien>[1]) =>
      filterMaterialien(BEISPIEL_LAGER, f).map((m) => m.id);
    expect(ids({})).toHaveLength(9);
    expect(ids({ kategorie: 'alle' })).toHaveLength(9);
    expect(ids({ kategorie: 'kuvert' })).toEqual(['L9']);
    expect(ids({ kategorie: 'papier', form: 'Rolle' })).toEqual(['L8']);
    expect(ids({ kategorie: 'tuete' })).toEqual([]);
    expect(ids({ kategorie: 'papier', artikelnummer: '   ' })).toHaveLength(8);
  });
});
