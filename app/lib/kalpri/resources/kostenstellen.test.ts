import { describe, expect, it } from 'vitest';
import { formatEuro, type Geld } from '@druck/units';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplaetzeDerKostenstelle,
  arbeitsplatzAendern,
  arbeitsplatzHinweise,
  arbeitsplatzHinzufuegen,
  kostenstelleAendern,
  kostenstelleEntfernen,
  kostenstelleHinzufuegen,
  naechsteKostenstelleId,
  produktionAlsJson,
  produktionAusJson,
  rechenweg,
  rechneProbe,
  stundensatzDesPlatzes,
  type Arbeitsplatz,
  type ProbeErgebnis,
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

function bohren(p: Produktion): ProbeErgebnis {
  return wert(rechneProbe(p, { platzId: 'AP-KLEIN', schrittId: 'S0014', menge: 20 }));
}

/** Kostenstelle KST-0001 „Kleine Maschinen“ (48 €/h, Teilkosten 30 €/h, vorläufig);
 *  AP-KLEIN ohne eigenen Satz, verweist auf die Kostenstelle. */
function mitKostenstelle(): Produktion {
  const p = wert(
    kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
      name: 'Kleine Maschinen',
      nummer: 'KS-450',
      stundensatzVollZehntelcent: 48_000,
      stundensatzTeilZehntelcent: 30_000,
      stundensatzVorlaeufig: true,
    }),
  );
  const klein: Record<string, unknown> = { ...platz(p, 'AP-KLEIN'), kostenstelleId: 'KST-0001' };
  delete klein['stundensatzVollZehntelcent'];
  return wert(arbeitsplatzAendern(p, klein));
}

describe('Kostenstellen', () => {
  it('anlegen mit automatischer ID, ändern, Fehler am Feld', () => {
    expect(naechsteKostenstelleId(BEISPIEL_PRODUKTION)).toBe('KST-0001');
    const p = mitKostenstelle();
    expect(p.kostenstellen).toEqual([
      {
        id: 'KST-0001',
        name: 'Kleine Maschinen',
        nummer: 'KS-450',
        stundensatzVollZehntelcent: 48_000,
        stundensatzTeilZehntelcent: 30_000,
        stundensatzVorlaeufig: true,
      },
    ]);
    expect(naechsteKostenstelleId(p)).toBe('KST-0002');
    expect(fehler(kostenstelleHinzufuegen(p, { name: 'Ohne Satz' }))).toEqual([
      { pfad: 'stundensatzVollZehntelcent', meldung: 'Pflichtfeld' },
    ]);
    expect(
      fehler(
        kostenstelleHinzufuegen(p, {
          name: 'Teuer',
          stundensatzVollZehntelcent: 40_000,
          stundensatzTeilZehntelcent: 50_000,
        }),
      ),
    ).toEqual([
      { pfad: 'stundensatzTeilZehntelcent', meldung: 'Teilkosten sind größer als Vollkosten' },
    ]);
    expect(
      fehler(
        kostenstelleHinzufuegen(p, {
          name: 'Personal',
          stundensatzVollZehntelcent: 40_000,
          personalZehntelcent: 45_000,
        }),
      ),
    ).toEqual([
      { pfad: 'personalZehntelcent', meldung: 'Personal ist größer als der Stundensatz' },
    ]);
    expect(
      fehler(
        kostenstelleHinzufuegen(p, { name: 'kleine  maschinen', stundensatzVollZehntelcent: 1 }),
      ),
    ).toEqual([{ pfad: 'name', meldung: 'Name doppelt: kleine  maschinen' }]);
    expect(
      fehler(kostenstelleAendern(p, { id: 'KST-0099', name: 'X', stundensatzVollZehntelcent: 1 })),
    ).toEqual([{ pfad: 'id', meldung: 'Kostenstelle KST-0099 nicht gefunden' }]);
    const teurer = wert(
      kostenstelleAendern(p, {
        id: 'KST-0001',
        name: 'Kleine Maschinen',
        stundensatzVollZehntelcent: 60_000,
      }),
    );
    expect(teurer.kostenstellen).toEqual([
      { id: 'KST-0001', name: 'Kleine Maschinen', stundensatzVollZehntelcent: 60_000 },
    ]);
  });

  it('Satz kommt aus genau einer Quelle; Verweis muss stimmen', () => {
    const p = mitKostenstelle();
    const klein = platz(p, 'AP-KLEIN');
    const beides = 'Stundensatz entweder am Platz oder über die Kostenstelle, nicht beides';
    expect(
      fehler(arbeitsplatzAendern(p, { ...klein, stundensatzVollZehntelcent: 48_000 })),
    ).toEqual([{ pfad: 'kostenstelleId', meldung: beides }]);
    expect(fehler(arbeitsplatzAendern(p, { ...klein, stundensatzVorlaeufig: true }))).toEqual([
      { pfad: 'kostenstelleId', meldung: beides },
    ]);
    expect(fehler(arbeitsplatzAendern(p, { ...klein, personalZehntelcent: 20_000 }))).toEqual([
      { pfad: 'kostenstelleId', meldung: beides },
    ]);
    expect(fehler(arbeitsplatzAendern(p, { ...klein, kostenstelleId: 'KST-0099' }))).toEqual([
      { pfad: 'kostenstelleId', meldung: 'Kostenstelle KST-0099 nicht gefunden' },
    ]);
    expect(
      fehler(
        arbeitsplatzHinzufuegen(p, {
          name: 'Offset extern',
          schritte: [],
          fremdarbeit: {},
          kostenstelleId: 'KST-0001',
        }),
      ),
    ).toEqual([{ pfad: 'kostenstelleId', meldung: 'Fremdarbeit hat keinen Stundensatz' }]);
    expect(fehler(arbeitsplatzAendern(p, { ...klein, besatzungLauf: 0.5 }))).toEqual([
      {
        pfad: 'besatzungLauf',
        meldung: 'Für die Besatzung beim Lauf den Anteil Personal an der Kostenstelle angeben',
      },
    ]);
  });

  it('Satz der Kostenstelle: Herkunft, Plätze der Kostenstelle, Hinweise', () => {
    expect(
      stundensatzDesPlatzes(BEISPIEL_PRODUKTION, platz(BEISPIEL_PRODUKTION, 'AP-ZUS')),
    ).toEqual({
      stundensatzVollZehntelcent: 90_000,
      vorlaeufig: true,
      herkunft: { art: 'platz' },
    });
    const p = mitKostenstelle();
    expect(stundensatzDesPlatzes(p, platz(p, 'AP-KLEIN'))).toEqual({
      stundensatzVollZehntelcent: 48_000,
      stundensatzTeilZehntelcent: 30_000,
      vorlaeufig: true,
      herkunft: { art: 'kostenstelle', id: 'KST-0001', name: 'Kleine Maschinen' },
    });
    expect(arbeitsplaetzeDerKostenstelle(p, 'KST-0001').map((a) => a.id)).toEqual(['AP-KLEIN']);
    expect(arbeitsplaetzeDerKostenstelle(p, 'KST-0099')).toEqual([]);
    expect(arbeitsplatzHinweise(p, platz(p, 'AP-KLEIN'))).toEqual([
      'Stundensatz vorläufig',
      'Ösen: Leistung fehlt – rechnet nicht',
      'Heften: Leistung fehlt – rechnet nicht',
    ]);
  });

  it('Probe und Rechenweg rechnen mit dem Satz der Kostenstelle', () => {
    const eigen = bohren(BEISPIEL_PRODUKTION);
    expect(eigen.satzHerkunft).toBeUndefined();
    expect(rechenweg(eigen)[5]).toBe('Vollkosten: 0,38 h × 48,00 €/h = 18,00 €');

    const p = mitKostenstelle();
    const r = bohren(p);
    expect([r.laufMs, r.zeitMs, euro(r.kostenVoll), euro(r.kostenTeil)]).toEqual([
      1_050_000,
      1_350_000,
      '18,00 €',
      '11,25 €',
    ]);
    expect(r.satzHerkunft).toBe('Kostenstelle Kleine Maschinen');
    expect(r.hinweise).toEqual(['Stundensatz vorläufig']);
    expect(rechenweg(r).slice(5)).toEqual([
      'Vollkosten: 0,38 h × 48,00 €/h (Kostenstelle Kleine Maschinen) = 18,00 €',
      'Teilkosten: 0,38 h × 30,00 €/h (Kostenstelle Kleine Maschinen) = 11,25 €',
    ]);

    const teurer = wert(
      kostenstelleAendern(p, {
        id: 'KST-0001',
        name: 'Kleine Maschinen',
        stundensatzVollZehntelcent: 60_000,
      }),
    );
    expect(euro(bohren(teurer).kostenVoll)).toBe('22,50 €');
    expect(bohren(teurer).hinweise).toEqual(['Teilkosten nicht hinterlegt']);
  });

  it('Personal an der Kostenstelle, Besatzung beim Lauf am Platz', () => {
    const p = mitKostenstelle();
    const mitPersonal = wert(
      kostenstelleAendern(p, {
        ...p.kostenstellen?.[0],
        personalZehntelcent: 20_000,
      }),
    );
    const halb = wert(
      arbeitsplatzAendern(mitPersonal, { ...platz(mitPersonal, 'AP-KLEIN'), besatzungLauf: 0.5 }),
    );
    const r = bohren(halb);
    expect([r.personal?.satz.zehntelcent, r.personal?.besatzungLauf]).toEqual([20_000, 0.5]);
    // Rüsten 5 min × 48 € + Lauf 17,5 min × (48 − 10) € = 4,00 € + 11,08 €
    expect(euro(r.kostenVoll)).toBe('15,08 €');
  });

  it('entfernen nur, wenn kein Platz sie nutzt; JSON hin und zurück', () => {
    const p = mitKostenstelle();
    expect(fehler(kostenstelleEntfernen(p, 'KST-0001'))).toEqual([
      { pfad: 'id', meldung: 'Kostenstelle KST-0001 wird genutzt von: AP-KLEIN' },
    ]);
    expect(fehler(kostenstelleEntfernen(p, 'KST-0099'))).toEqual([
      { pfad: 'id', meldung: 'Kostenstelle KST-0099 nicht gefunden' },
    ]);
    const frei = wert(
      kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
        name: 'Versand',
        stundensatzVollZehntelcent: 38_000,
      }),
    );
    expect(wert(kostenstelleEntfernen(frei, 'KST-0001')).kostenstellen).toBeUndefined();
    const zurueck = wert(produktionAusJson(produktionAlsJson(p)));
    expect(zurueck.kostenstellen).toEqual(p.kostenstellen);
    expect(produktionAlsJson(zurueck)).toBe(produktionAlsJson(p));
    expect(produktionAlsJson(p)).toContain('"kostenstelleId": "KST-0001"');
  });
});
