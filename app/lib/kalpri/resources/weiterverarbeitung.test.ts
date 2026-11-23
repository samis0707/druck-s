import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  kalkulationAusProdukt,
  kalkulationHinzufuegen,
  leereKalkulationen,
  neuesProduktTeil,
  rechneKalkulation,
  schrittImWeg,
  weiterverarbeitungen,
  type Artikel,
} from './index';

// T133: jede Tätigkeit als Weiterverarbeitung wählbar

const HEUTE = '2026-11-11';

describe('Weiterverarbeitung zum Auswählen (T133)', () => {
  it('1 Liste: Werte einzeln, Tätigkeit ohne „im Weg“ unter ihrem Namen, ohne Druck/Schneiden', () => {
    const texte = weiterverarbeitungen(BEISPIEL_PRODUKTION).map((w) => w.text);
    expect(texte).toContain('Stanzen');
    expect(texte).toContain('Falz: Wickel');
    expect(texte).toContain('Bindung: Rückstich');
    expect(texte).not.toContain('Digitaldruck');
    expect(texte).not.toContain('Schneiden');
    expect(texte).not.toContain('Datencheck');
    expect(new Set(texte).size).toBe(texte.length);
  });

  it('2 Ebene: Heften am ganzen Produkt, Stanzen am Teil', () => {
    const w = weiterverarbeitungen(BEISPIEL_PRODUKTION);
    expect(w.find((x) => x.text === 'Bindung: Rückstich')?.ebene).toBe('produkt');
    expect(w.find((x) => x.text === 'Stanzen')).toMatchObject({
      ebene: 'teil',
      merkmal: { name: 'Stanzen', wert: 'ja' },
    });
  });

  it('3 Tätigkeit mit Angabe bleibt, ohne Angabe: Merkmal mit ihrem Namen, Bogen → Druckbogen', () => {
    const mit = BEISPIEL_PRODUKTION.arbeitsschritte.find((s) => s.imWeg !== undefined);
    const ohne = BEISPIEL_PRODUKTION.arbeitsschritte.find((s) => s.id === 'S0009');
    if (!mit || !ohne) throw new Error('Schritte');
    expect(schrittImWeg(mit)).toBe(mit);
    expect(schrittImWeg(ohne)).toMatchObject({
      imWeg: { art: 'merkmal', name: 'Stanzen' },
      menge: { wert: 'druckbogen' },
    });
  });

  it('4 Ware vom Kunden, nur Stanzen: der Weg enthält Stanzen und rechnet je Bogen', () => {
    const produkt: Artikel = {
      id: 'PRODUKT',
      titel: 'Etiketten',
      einheit: 'Stueck',
      endformat: { zustand: 'fest', wert: { breiteUm: 210_000, hoeheUm: 297_000 } },
      teile: [
        {
          ...neuesProduktTeil(1),
          druck: { zustand: 'fest', wert: 'ohne' },
          wareGestellt: true,
          merkmale: [{ name: 'Stanzen', wert: { zustand: 'fest', wert: 'ja' } }],
        },
      ],
    };
    const v = kalkulationAusProdukt(produkt, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
      titel: 'Etiketten',
      auflagen: [500],
      erstelltAm: HEUTE,
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const i = k.zeilen.findIndex((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0009');
    expect(i >= 0).toBe(true);
    const e = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, HEUTE).auflagen[0];
    expect(e?.zeilen[i]?.menge).toBe(500);
    expect((e?.zeilen[i]?.kostenVoll?.zehntelcent ?? 0) > 0).toBe(true);
  });
});

describe('Zeit-Schritte werden kein Merkmal (T141)', () => {
  it('Stunde, Einsatz, Auftrag ohne „im Weg“ bleiben, wie sie sind', () => {
    for (const einheit of ['Stunde', 'Einsatz', 'Auftrag'] as const) {
      const s = { id: 'S9999', name: 'Daten bearbeiten', einheit };
      expect(schrittImWeg(s).imWeg).toBeUndefined();
    }
    expect(schrittImWeg({ id: 'S9999', name: 'Ösen', einheit: 'Stueck' }).imWeg).toMatchObject({
      art: 'merkmal',
      name: 'Ösen',
    });
  });
});

describe('Kein Endschnitt nötig (T148)', () => {
  const wegSchritte = (ohneEndschnitt: boolean) => {
    const produkt: Artikel = {
      id: 'PRODUKT',
      titel: 'Karte',
      einheit: 'Stueck',
      endformat: { zustand: 'fest', wert: { breiteUm: 85_000, hoeheUm: 55_000 } },
      teile: [
        {
          ...neuesProduktTeil(1),
          woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L1' } },
          merkmale: [{ name: 'Stanzen', wert: { zustand: 'fest', wert: 'ja' } }],
          ...(ohneEndschnitt ? { ohneEndschnitt: true } : {}),
        },
      ],
    };
    const v = kalkulationAusProdukt(produkt, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
      titel: 'Karte',
      auflagen: [500],
      erstelltAm: HEUTE,
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    return (r.wert.kalkulationen[0]?.zeilen ?? []).flatMap((z) =>
      z.art === 'arbeitsgang' ? [z.schrittId] : [],
    );
  };

  it('ohne Haken: Stanzen und Schneiden; mit Haken: Stanzen ohne Schneiden', () => {
    expect(wegSchritte(false)).toContain('S0006');
    expect(wegSchritte(false)).toContain('S0009');
    expect(wegSchritte(true)).not.toContain('S0006');
    expect(wegSchritte(true)).toContain('S0009');
  });
});
