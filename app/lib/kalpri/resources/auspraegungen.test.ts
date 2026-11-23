import { describe, expect, it } from 'vitest';
import { formatLeistung } from '@druck/units';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  arbeitsplatzAendern,
  arbeitsplatzHinzufuegen,
  auspraegungenZuMaterial,
  bedingungTrifftZu,
  fehlendeMaterialien,
  greifendeAuspraegungen,
  merkmaleAusMaterial,
  profilLeistung,
  pruefeProduktion,
  stanzformHinzufuegen,
  leeresLager,
  vergleicheFuer,
  type Arbeitsplatz,
  type Bedingung,
  type Produktion,
  type PruefErgebnis,
} from './index';

function fehler<T>(e: PruefErgebnis<T>) {
  return e.ok ? [] : e.fehler;
}

function platz(id: string): Arbeitsplatz {
  const p = BEISPIEL_PRODUKTION.arbeitsplaetze?.find((a) => a.id === id);
  if (!p) throw new Error(`Platz ${id} fehlt`);
  return p;
}

function material(id: string) {
  const m = BEISPIEL_LAGER.materialien.find((x) => x.id === id);
  if (!m) throw new Error(`Material ${id} fehlt`);
  return m;
}

const b = (
  teil: Partial<Bedingung> & Pick<Bedingung, 'merkmal' | 'vergleich' | 'wert'>,
): Bedingung => teil;

/** Tiegel mit Stanzen und Ausprägungen für die Prüfung. */
function tiegelMit(auspraegungen: unknown[]): unknown {
  return { ...platz('AP-TIEGEL'), auspraegungen };
}

describe('Ausprägungen: Schema', () => {
  it('Beispiel-Produktion mit Ausprägungen und Profilen ist gültig; Vergleiche je Merkmal', () => {
    expect(pruefeProduktion(BEISPIEL_PRODUKTION).ok).toBe(true);
    expect(vergleicheFuer('grammatur')).toEqual(['gleich', 'groesser', 'kleiner', 'vonBis']);
    expect(vergleicheFuer('material')).toEqual(['ist', 'istNicht']);
    expect(vergleicheFuer('einstellung')).toEqual(['gesetzt', 'nichtGesetzt']);
  });

  it('Fehler am Feld: Merkmal, Vergleich, Wert, von–bis, keine Bedingung, keine Wirkung, Schritt', () => {
    const e = fehler(
      arbeitsplatzAendern(
        BEISPIEL_PRODUKTION,
        tiegelMit([
          {
            name: 'A',
            bedingungen: [
              { merkmal: 'farbe', vergleich: 'ist', wert: 'rot' },
              { merkmal: 'grammatur', vergleich: 'ist', wert: 300 },
              { merkmal: 'grammatur', vergleich: 'groesser', wert: 'viel' },
              { merkmal: 'faecher', vergleich: 'vonBis', wert: 17 },
              { merkmal: 'faecher', vergleich: 'vonBis', wert: 17, bis: 11 },
            ],
            wirkung: { leistungProzent: -95 },
          },
          { name: 'B', bedingungen: [], wirkung: {} },
        ]),
      ),
    );
    expect(e).toEqual([
      { pfad: 'auspraegungen.0.bedingungen.0.merkmal', meldung: 'Merkmal unbekannt' },
      {
        pfad: 'auspraegungen.0.bedingungen.1.vergleich',
        meldung: 'Vergleich passt nicht zum Merkmal',
      },
      { pfad: 'auspraegungen.0.bedingungen.2.wert', meldung: 'muss eine Zahl sein' },
      { pfad: 'auspraegungen.0.bedingungen.3.bis', meldung: 'Pflichtfeld' },
      {
        pfad: 'auspraegungen.0.bedingungen.4.bis',
        meldung: 'muss mindestens so groß sein wie von',
      },
      { pfad: 'auspraegungen.0.wirkung.leistungProzent', meldung: 'mindestens −90' },
      { pfad: 'auspraegungen.1.bedingungen', meldung: 'mindestens eine Bedingung' },
      { pfad: 'auspraegungen.1.wirkung', meldung: 'mindestens eine Wirkung' },
    ]);
    const fremderSchritt = {
      name: 'C',
      schrittId: 'S0014',
      bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: 'L4' }],
      wirkung: { leistungProzent: -20 },
    };
    expect(fehler(arbeitsplatzAendern(BEISPIEL_PRODUKTION, tiegelMit([fremderSchritt])))).toEqual([
      {
        pfad: 'auspraegungen.0.schrittId',
        meldung: 'Schritt S0014 ist an diesem Platz nicht möglich',
      },
    ]);
  });

  it('Leistungsprofile: Namen eindeutig, ganzzahlig bei ganzzahliger Einheit', () => {
    const katalog: Produktion = {
      version: 1,
      arbeitsschritte: [{ id: 'S0001', name: 'Bohren', einheit: 'Hub' }],
    };
    expect(
      fehler(
        arbeitsplatzHinzufuegen(katalog, {
          name: 'Bohren',
          schritte: [
            {
              schrittId: 'S0001',
              leistung: { menge: 1, dauerMs: 52_500 },
              profile: [
                { name: 'Dünn', menge: 2.5, dauerMs: 60_000 },
                { name: 'dünn', menge: 1, dauerMs: 60_000 },
              ],
            },
          ],
        }),
      ),
    ).toEqual([
      { pfad: 'schritte.0.profile.1.name', meldung: 'Ausführung doppelt: dünn' },
      { pfad: 'schritte.0.profile.0.menge', meldung: 'muss eine ganze Zahl sein' },
    ]);
    const sechs = profilLeistung(BEISPIEL_PRODUKTION, 'AP-LFP', 'S0003', '6 pass');
    expect(sechs && formatLeistung(sechs)).toBe('23 m²/h');
    expect(profilLeistung(BEISPIEL_PRODUKTION, 'AP-LFP', 'S0003', '7 Pass')).toBeNull();
  });

  it('Stanzform mit Leistungsänderung', () => {
    const lager = stanzformHinzufuegen(leeresLager(), {
      name: 'Anhänger fein',
      nutzen: 6,
      leistungsaenderung: { leistungProzent: -25, ruestenMs: 600_000 },
    });
    expect(lager.ok && lager.wert.stanzformen?.[0]?.leistungsaenderung).toEqual({
      leistungProzent: -25,
      ruestenMs: 600_000,
    });
    expect(
      fehler(
        stanzformHinzufuegen(leeresLager(), {
          name: 'X',
          nutzen: 1,
          leistungsaenderung: { leistungProzent: 600 },
        }),
      ),
    ).toEqual([{ pfad: 'leistungsaenderung.leistungProzent', meldung: 'höchstens 500' }]);
  });
});

describe('Ausprägungen: Auswertung', () => {
  it('Bedingungen: Zahl, Text, Material, Einstellung; Unbekanntes trifft nicht zu', () => {
    const karton = merkmaleAusMaterial(material('L4'));
    expect(karton).toEqual({
      materialId: 'L4',
      kategorie: 'papier',
      oberflaeche: 'gestrichen',
      grammatur: 350,
      dickeUm: 400,
      laufrichtung: 'SB',
      bogenbreiteUm: 320_000,
      bogenhoeheUm: 450_000,
    });
    expect(
      bedingungTrifftZu(b({ merkmal: 'grammatur', vergleich: 'groesser', wert: 300 }), karton),
    ).toBe(true);
    expect(
      bedingungTrifftZu(b({ merkmal: 'grammatur', vergleich: 'kleiner', wert: 300 }), karton),
    ).toBe(false);
    expect(
      bedingungTrifftZu(b({ merkmal: 'grammatur', vergleich: 'gleich', wert: 350 }), karton),
    ).toBe(true);
    expect(
      bedingungTrifftZu(
        b({ merkmal: 'oberflaeche', vergleich: 'ist', wert: ' Gestrichen ' }),
        karton,
      ),
    ).toBe(true);
    expect(
      bedingungTrifftZu(b({ merkmal: 'material', vergleich: 'istNicht', wert: 'L4' }), karton),
    ).toBe(false);
    expect(
      bedingungTrifftZu(b({ merkmal: 'material', vergleich: 'ist', wert: 'l4' }), karton),
    ).toBe(false);
    const duplo = { faecher: 18, einstellungen: ['Hand'] };
    expect(
      bedingungTrifftZu(b({ merkmal: 'faecher', vergleich: 'vonBis', wert: 17, bis: 20 }), duplo),
    ).toBe(true);
    expect(
      bedingungTrifftZu(b({ merkmal: 'faecher', vergleich: 'vonBis', wert: 11, bis: 16 }), duplo),
    ).toBe(false);
    expect(
      bedingungTrifftZu(b({ merkmal: 'einstellung', vergleich: 'gesetzt', wert: 'hand' }), duplo),
    ).toBe(true);
    expect(
      bedingungTrifftZu(b({ merkmal: 'einstellung', vergleich: 'nichtGesetzt', wert: 'Hand' }), {}),
    ).toBe(true);
    expect(
      bedingungTrifftZu(b({ merkmal: 'grammatur', vergleich: 'groesser', wert: 1 }), duplo),
    ).toBe(false);
    expect(
      bedingungTrifftZu(b({ merkmal: 'kategorie', vergleich: 'istNicht', wert: 'kuvert' }), duplo),
    ).toBe(false);
  });

  it('greifende Ausprägungen: alle Bedingungen, Schritt passend oder ohne Schritt', () => {
    const toner = platz('AP-TON5C');
    const breitDick = { bogenbreiteUm: 488_000, grammatur: 300 };
    expect(greifendeAuspraegungen(toner, 'S0001', breitDick).map((a) => a.wirkung.hinweis)).toEqual(
      ['Über 330 mm Bogenbreite nur bis 220 g/m²'],
    );
    expect(
      greifendeAuspraegungen(toner, 'S0001', { bogenbreiteUm: 488_000, grammatur: 200 }),
    ).toEqual([]);
    expect(greifendeAuspraegungen(toner, 'S0001', merkmaleAusMaterial(material('L4')))).toEqual([]);
    const falz = platz('AP-FALZ-A');
    const mitTasche = { einstellungen: ['Fensterfalztasche'] };
    expect(
      greifendeAuspraegungen(falz, 'S0012', mitTasche).map((a) => a.wirkung.ruestenMs),
    ).toEqual([300_000]);
    expect(greifendeAuspraegungen(falz, 'S0011', mitTasche)).toEqual([]);
  });

  it('Material × Arbeitsplatz: Ansicht am Material und fehlende Materialien', () => {
    const tiegel = {
      ...platz('AP-TIEGEL'),
      auspraegungen: [
        {
          name: 'Digitalkarton läuft schlecht',
          bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: 'L4' }],
          wirkung: { leistungProzent: -20, zuschussFest: 30 },
        },
        {
          name: 'Altes Papier',
          bedingungen: [{ merkmal: 'material', vergleich: 'ist', wert: 'M0999' }],
          wirkung: { nichtGeeignet: true },
        },
      ],
    };
    const e = arbeitsplatzAendern(BEISPIEL_PRODUKTION, tiegel);
    if (!e.ok) throw new Error(JSON.stringify(e.fehler));
    expect(
      auspraegungenZuMaterial(e.wert, 'L4').map((t) => [
        t.platzId,
        t.platzName,
        t.auspraegung.name,
      ]),
    ).toEqual([['AP-TIEGEL', 'Heidelberger Tiegel', 'Digitalkarton läuft schlecht']]);
    expect(auspraegungenZuMaterial(e.wert, 'L1')).toEqual([]);
    expect(fehlendeMaterialien(e.wert, BEISPIEL_LAGER)).toEqual([
      'Heidelberger Tiegel – Altes Papier: Material M0999 nicht im Lager',
    ]);
    expect(fehlendeMaterialien(BEISPIEL_PRODUKTION, BEISPIEL_LAGER)).toEqual([]);
  });
});
