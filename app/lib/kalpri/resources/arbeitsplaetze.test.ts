import { describe, expect, it } from 'vitest';
import { beschreibeLeistung, formatLeistung } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplaetzeFuerSchritt,
  arbeitsplatzAendern,
  arbeitsplatzEntfernen,
  arbeitsplatzHinweise,
  arbeitsplatzHinzufuegen,
  arbeitsschrittEntfernen,
  leereProduktion,
  leistungAmPlatz,
  naechsteArbeitsplatzId,
  produktionAlsJson,
  produktionAusJson,
  pruefeProduktion,
  type Arbeitsplatz,
  type PruefErgebnis,
  type Produktion,
} from './index';

function wert(e: PruefErgebnis<Produktion>): Produktion {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: PruefErgebnis<Produktion>) {
  return e.ok ? [] : e.fehler;
}

function platz(id: string): Arbeitsplatz {
  const p = BEISPIEL_PRODUKTION.arbeitsplaetze?.find((a) => a.id === id);
  if (!p) throw new Error(`Platz ${id} fehlt`);
  return p;
}

/** Katalog mit zwei Schritten, ohne Plätze. */
const katalog: Produktion = {
  version: 1,
  arbeitsschritte: [
    { id: 'S0001', name: 'Bohren', einheit: 'Hub' },
    { id: 'S0002', name: 'Großformatdruck', einheit: 'm2' },
  ],
};

describe('Arbeitsplätze', () => {
  it('Beispiel-Produktion: 15 Plätze gültig, JSON verlustfrei; alte Datei ohne Plätze bleibt gültig', () => {
    expect(pruefeProduktion(BEISPIEL_PRODUKTION).ok).toBe(true);
    expect(BEISPIEL_PRODUKTION.arbeitsplaetze).toHaveLength(15);
    const text = produktionAlsJson(BEISPIEL_PRODUKTION);
    expect(produktionAlsJson(wert(produktionAusJson(text)))).toBe(text);
    expect(produktionAlsJson(katalog)).not.toContain('arbeitsplaetze');
    expect(pruefeProduktion(katalog).ok).toBe(true);
  });

  it('hinzufügen: Name und Schritte genügen, ID AP-0001; eigene IDs wie AP-SCHN bleiben', () => {
    expect(naechsteArbeitsplatzId(katalog)).toBe('AP-0001');
    expect(naechsteArbeitsplatzId(BEISPIEL_PRODUKTION)).toBe('AP-0001');
    const p1 = wert(arbeitsplatzHinzufuegen(katalog, { name: ' Kleine Maschinen ', schritte: [] }));
    expect(p1.arbeitsplaetze).toEqual([{ id: 'AP-0001', name: 'Kleine Maschinen', schritte: [] }]);
    const p2 = wert(
      arbeitsplatzHinzufuegen(p1, {
        id: 'AP-BOHR',
        name: 'Bohren',
        stundensatzVollZehntelcent: 48_000,
        schritte: [{ schrittId: 'S0001', leistung: { menge: 1, dauerMs: 52_500 } }],
      }),
    );
    expect(p2.arbeitsplaetze?.map((p) => p.id)).toEqual(['AP-0001', 'AP-BOHR']);
    expect(naechsteArbeitsplatzId(p2)).toBe('AP-0002');
  });

  it('Fehler am Feld: Pflicht, unbekannter Schritt, doppelter Schritt, Leistung, Teilkosten, Grenzen', () => {
    expect(fehler(arbeitsplatzHinzufuegen(katalog, {}))).toEqual([
      { pfad: 'name', meldung: 'Pflichtfeld' },
      { pfad: 'schritte', meldung: 'Pflichtfeld' },
    ]);
    expect(
      fehler(
        arbeitsplatzHinzufuegen(katalog, {
          name: 'X',
          schritte: [
            { schrittId: 'S0099' },
            { schrittId: 'S0001', leistung: { menge: 1.5, dauerMs: 1000 } },
          ],
        }),
      ),
    ).toEqual([
      { pfad: 'schritte.0.schrittId', meldung: 'Arbeitsschritt S0099 nicht gefunden' },
      { pfad: 'schritte.1.leistung.menge', meldung: 'muss eine ganze Zahl sein' },
    ]);
    expect(
      fehler(
        arbeitsplatzHinzufuegen(katalog, {
          name: 'LFP',
          schritte: [{ schrittId: 'S0002', leistung: { menge: 11.5, dauerMs: 3_600_000 } }],
        }),
      ),
    ).toEqual([]);
    expect(
      fehler(
        arbeitsplatzHinzufuegen(katalog, {
          name: 'X',
          stundensatzVollZehntelcent: 40_000,
          stundensatzTeilZehntelcent: 50_000,
          grenzen: {
            formatMin: { breiteUm: 400_000, hoeheUm: 100_000 },
            formatMax: { breiteUm: 300_000, hoeheUm: 200_000 },
            grammaturMin: 300,
            grammaturMax: 100,
          },
          schritte: [
            { schrittId: 'S0001' },
            { schrittId: 'S0001', leistung: { menge: 1, dauerMs: 0 } },
          ],
        }),
      ),
    ).toEqual([
      { pfad: 'grenzen.formatMin', meldung: 'Mindestformat ist größer als das Höchstformat' },
      {
        pfad: 'grenzen.grammaturMin',
        meldung: 'Mindestgrammatur ist größer als die Höchstgrammatur',
      },
      { pfad: 'schritte.1.leistung.dauerMs', meldung: 'muss größer als 0 sein' },
      { pfad: 'stundensatzTeilZehntelcent', meldung: 'Teilkosten sind größer als Vollkosten' },
      { pfad: 'schritte.1.schrittId', meldung: 'Schritt doppelt: S0001' },
    ]);
    expect(
      fehler(arbeitsplatzHinzufuegen(BEISPIEL_PRODUKTION, { name: 'handarbeit', schritte: [] })),
    ).toEqual([{ pfad: 'name', meldung: 'Name doppelt: handarbeit' }]);
    expect(
      fehler(
        arbeitsplatzHinzufuegen(katalog, {
          name: 'X',
          ruesten: [{ name: 'Rüsten', dauerMs: 60_000, je: 'Palette', alle: 0 }],
          schritte: [],
        }),
      ),
    ).toEqual([
      { pfad: 'ruesten.0.je', meldung: 'Einheit unbekannt' },
      { pfad: 'ruesten.0.alle', meldung: 'muss größer als 0 sein' },
    ]);
  });

  it('ändern, entfernen; Schritt im Gebrauch lässt sich nicht entfernen; Eingabe bleibt unverändert', () => {
    const vorher = JSON.stringify(BEISPIEL_PRODUKTION);
    const geaendert = wert(
      arbeitsplatzAendern(BEISPIEL_PRODUKTION, {
        ...platz('AP-HAND'),
        stundensatzTeilZehntelcent: 30_000,
      }),
    );
    expect(
      geaendert.arbeitsplaetze?.find((p) => p.id === 'AP-HAND')?.stundensatzTeilZehntelcent,
    ).toBe(30_000);
    expect(
      fehler(arbeitsplatzAendern(BEISPIEL_PRODUKTION, { id: 'AP-XX', name: 'X', schritte: [] })),
    ).toEqual([{ pfad: 'id', meldung: 'Arbeitsplatz AP-XX nicht gefunden' }]);
    expect(wert(arbeitsplatzEntfernen(BEISPIEL_PRODUKTION, 'AP-PACK')).arbeitsplaetze).toHaveLength(
      14,
    );
    expect(fehler(arbeitsplatzEntfernen(BEISPIEL_PRODUKTION, 'AP-XX'))).toEqual([
      { pfad: 'id', meldung: 'Arbeitsplatz AP-XX nicht gefunden' },
    ]);
    expect(fehler(arbeitsschrittEntfernen(BEISPIEL_PRODUKTION, 'S0007'))).toEqual([
      { pfad: 'id', meldung: 'Arbeitsschritt S0007 wird genutzt von: AP-AEROCUT' },
    ]);
    expect(
      wert(arbeitsschrittEntfernen(BEISPIEL_PRODUKTION, 'S0010')).arbeitsschritte,
    ).toHaveLength(21);
    expect(JSON.stringify(BEISPIEL_PRODUKTION)).toBe(vorher);
    expect(leereProduktion().arbeitsplaetze).toBeUndefined();
  });

  it('Leistung am Platz in der Einheit des Schritts; Plätze je Schritt; Hinweise', () => {
    const bohren = leistungAmPlatz(BEISPIEL_PRODUKTION, 'AP-KLEIN', 'S0014');
    expect(bohren && beschreibeLeistung(bohren)).toBe('1 Hub in 52,5 s = 68,57 Hübe/h');
    const lfp = leistungAmPlatz(BEISPIEL_PRODUKTION, 'AP-LFP', 'S0003');
    expect(lfp && formatLeistung(lfp)).toBe('11 m²/h');
    expect(leistungAmPlatz(BEISPIEL_PRODUKTION, 'AP-KLEIN', 'S0015')).toBeNull();
    expect(leistungAmPlatz(BEISPIEL_PRODUKTION, 'AP-XX', 'S0014')).toBeNull();
    expect(arbeitsplaetzeFuerSchritt(BEISPIEL_PRODUKTION, 'S0014').map((p) => p.id)).toEqual([
      'AP-KLEIN',
    ]);
    expect(arbeitsplaetzeFuerSchritt(BEISPIEL_PRODUKTION, 'S0022')).toEqual([]);
    expect(arbeitsplatzHinweise(BEISPIEL_PRODUKTION, platz('AP-KLEIN'))).toEqual([
      'Teilkosten nicht hinterlegt',
      'Ösen: Leistung fehlt – rechnet nicht',
      'Heften: Leistung fehlt – rechnet nicht',
    ]);
    expect(arbeitsplatzHinweise(BEISPIEL_PRODUKTION, platz('AP-TON5C'))).toEqual([
      'Teilkosten nicht hinterlegt',
      'Stundensatz vorläufig',
    ]);
    expect(arbeitsplatzHinweise(katalog, { id: 'AP-0001', name: 'Neu', schritte: [] })).toEqual([
      'Stundensatz fehlt – rechnet nicht',
      'Keine Arbeitsschritte',
    ]);
  });
});
