import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplatzAendern,
  arbeitsplatzHinzufuegen,
  kostenstelleHinzufuegen,
  platzAufteilen,
  rechenweg,
  rechneProbe,
  type Arbeitsplatz,
  type Produktion,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : e.fehler;
}

function euro(g: Geld | null): string {
  return g === null ? '–' : formatEuro(g);
}

function platz(p: Produktion, id: string): Arbeitsplatz {
  const gefunden = p.arbeitsplaetze?.find((a) => a.id === id);
  if (!gefunden) throw new Error(`Platz ${id} fehlt`);
  return gefunden;
}

const VIER = [
  { name: 'Bohrmaschine', schrittIds: ['S0014'] },
  { name: 'Ösmaschine', schrittIds: ['S0015'] },
  { name: 'Eckenrunder', schrittIds: ['S0016'] },
  { name: 'Heftmaschine', schrittIds: ['S0017'] },
];

describe('Sammelplatz in einzelne Geräte aufteilen', () => {
  it('Kleine Maschinen → vier Geräte mit gemeinsamer Kostenstelle; alter Platz inaktiv', () => {
    const klein = platz(BEISPIEL_PRODUKTION, 'AP-KLEIN');
    const p = wert(platzAufteilen(BEISPIEL_PRODUKTION, 'AP-KLEIN', VIER));
    expect(p.kostenstellen).toEqual([
      { id: 'KST-0001', name: 'Kleine Maschinen', stundensatzVollZehntelcent: 48_000 },
    ]);
    expect(platz(p, 'AP-0001')).toEqual({
      id: 'AP-0001',
      name: 'Bohrmaschine',
      bereich: 'Verarbeitung',
      standort: 'Halle 2',
      kostenstelleId: 'KST-0001',
      schritte: [klein.schritte[0]],
    });
    expect(
      ['AP-0001', 'AP-0002', 'AP-0003', 'AP-0004'].map((id) => [
        platz(p, id).name,
        platz(p, id).schritte.map((s) => s.schrittId),
      ]),
    ).toEqual([
      ['Bohrmaschine', ['S0014']],
      ['Ösmaschine', ['S0015']],
      ['Eckenrunder', ['S0016']],
      ['Heftmaschine', ['S0017']],
    ]);
    expect(platz(p, 'AP-KLEIN')).toEqual({ ...klein, inaktiv: true });

    const r = wert(rechneProbe(p, { platzId: 'AP-0001', schrittId: 'S0014', menge: 20 }));
    expect(euro(r.kostenVoll)).toBe('18,00 €');
    expect(rechenweg(r)[5]).toBe(
      'Vollkosten: 0,38 h × 48,00 €/h (Kostenstelle Kleine Maschinen) = 18,00 €',
    );
  });

  it('Schritte gruppieren; Sonderfälle: eigene nur am Gerät, allgemeine an jedem', () => {
    const mitSonderfaellen = wert(
      arbeitsplatzAendern(BEISPIEL_PRODUKTION, {
        ...platz(BEISPIEL_PRODUKTION, 'AP-KLEIN'),
        auspraegungen: [
          {
            name: 'Kuvert',
            bedingungen: [{ merkmal: 'kategorie', vergleich: 'ist', wert: 'Kuvert' }],
            wirkung: { ruestenMs: 600_000 },
          },
          {
            name: 'Dicker Stapel',
            schrittId: 'S0016',
            bedingungen: [{ merkmal: 'dickeUm', vergleich: 'groesser', wert: 1000 }],
            wirkung: { leistungProzent: -30 },
          },
        ],
      }),
    );
    const p = wert(
      platzAufteilen(mitSonderfaellen, 'AP-KLEIN', [
        { name: 'Ösen und Heften', schrittIds: ['S0017', 'S0015'] },
        { name: 'Bohren und Ecken', schrittIds: ['S0016', 'S0014'] },
      ]),
    );
    const oesen = platz(p, 'AP-0001');
    const ecken = platz(p, 'AP-0002');
    expect(oesen.schritte.map((s) => s.schrittId)).toEqual(['S0015', 'S0017']);
    expect(ecken.schritte.map((s) => s.schrittId)).toEqual(['S0014', 'S0016']);
    expect(oesen.auspraegungen?.map((a) => a.name)).toEqual(['Kuvert']);
    expect(ecken.auspraegungen?.map((a) => a.name)).toEqual(['Kuvert', 'Dicker Stapel']);
  });

  it('vorhandene Kostenstelle wird weiter genutzt', () => {
    const mitKs = wert(
      kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
        name: 'Verarbeitung klein',
        stundensatzVollZehntelcent: 50_000,
      }),
    );
    const klein: Record<string, unknown> = {
      ...platz(mitKs, 'AP-KLEIN'),
      kostenstelleId: 'KST-0001',
    };
    delete klein['stundensatzVollZehntelcent'];
    const p = wert(platzAufteilen(wert(arbeitsplatzAendern(mitKs, klein)), 'AP-KLEIN', VIER));
    expect(p.kostenstellen?.map((k) => k.id)).toEqual(['KST-0001']);
    expect(platz(p, 'AP-0004').kostenstelleId).toBe('KST-0001');
  });

  it('Fehler: Platz, Zuordnung, gemeinsamer Lauf, Name', () => {
    const p = BEISPIEL_PRODUKTION;
    expect(fehler(platzAufteilen(p, 'AP-XX', VIER))).toEqual([
      { pfad: 'platzId', meldung: 'Arbeitsplatz AP-XX nicht gefunden' },
    ]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'Alles', schrittIds: ['S0014', 'S0015', 'S0016', 'S0017'] },
        ]),
      ),
    ).toEqual([{ pfad: 'geraete', meldung: 'mindestens zwei Geräte' }]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'Bohrmaschine', schrittIds: ['S0014'] },
          { name: 'Rest', schrittIds: ['S0015', 'S0016'] },
        ]),
      ),
    ).toEqual([{ pfad: 'geraete', meldung: 'Schritt Heften keinem Gerät zugeordnet' }]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'A', schrittIds: ['S0014', 'S0015'] },
          { name: 'B', schrittIds: ['S0014', 'S0016', 'S0017'] },
        ]),
      ),
    ).toEqual([{ pfad: 'geraete', meldung: 'Schritt Bohren mehrfach zugeordnet' }]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'A', schrittIds: ['S0014', 'S0015', 'S0016', 'S0017'] },
          { name: 'B', schrittIds: ['S0001'] },
        ]),
      ),
    ).toEqual([
      { pfad: 'geraete', meldung: 'Schritt Digitaldruck ist an diesem Platz nicht möglich' },
    ]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'A', schrittIds: [] },
          { name: 'B', schrittIds: ['S0014', 'S0015', 'S0016', 'S0017'] },
        ]),
      ),
    ).toEqual([{ pfad: 'geraete.0.schrittIds', meldung: 'mindestens ein Schritt' }]);
    expect(
      fehler(
        platzAufteilen(p, 'AP-KLEIN', [
          { name: 'Vorstufe', schrittIds: ['S0014'] },
          ...VIER.slice(1),
        ]),
      ),
    ).toEqual([{ pfad: 'geraete.0.name', meldung: 'Name doppelt: Vorstufe' }]);

    const klein = platz(p, 'AP-KLEIN');
    const mitLauf = wert(
      arbeitsplatzAendern(p, {
        ...klein,
        schritte: klein.schritte.map((s) =>
          s.schrittId === 'S0017' ? { ...s, laeuftMit: { schrittId: 'S0014' } } : s,
        ),
      }),
    );
    expect(fehler(platzAufteilen(mitLauf, 'AP-KLEIN', VIER))).toEqual([
      { pfad: 'geraete', meldung: 'Heften läuft mit Bohren – beide müssen auf dasselbe Gerät' },
    ]);

    const fremd = wert(
      arbeitsplatzHinzufuegen(p, {
        id: 'AP-FREMD',
        name: 'Offset extern',
        schritte: [],
        fremdarbeit: {},
      }),
    );
    expect(fehler(platzAufteilen(fremd, 'AP-FREMD', VIER))).toEqual([
      { pfad: 'platzId', meldung: 'Fremdarbeit lässt sich nicht aufteilen' },
    ]);
  });
});
