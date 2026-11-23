import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  alleStichworte,
  arbeitsplatzHinzufuegen,
  arbeitsschrittEntfernen,
  lieferantAendern,
  lieferantEntfernen,
  lieferantenMitStichwort,
  lieferantHinzufuegen,
  naechsteLieferantId,
  produktionAlsJson,
  produktionAusJson,
  type Produktion,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function fehler(e: { ok: true } | { ok: false; fehler: { pfad: string; meldung: string }[] }) {
  return e.ok ? [] : e.fehler;
}

/** Zwei Lieferanten: Offset Nord (Offsetdruck, Falzen) und Folien Süd (Cellophanieren). */
function mitLieferanten(): Produktion {
  const a = wert(
    lieferantHinzufuegen(BEISPIEL_PRODUKTION, {
      name: 'Offset Nord',
      ansprechpartner: 'Frau Berg',
      email: 'anfrage@offset-nord.de',
      stichworte: ['Offsetdruck', 'Falzen'],
      beschreibung: 'Bogenoffset bis 70 × 100, 4/4-farbig',
      toleranzProzent: 10,
    }),
  );
  return wert(
    lieferantHinzufuegen(a, {
      name: 'Folien Süd',
      stichworte: ['Cellophanieren', 'offsetdruck'],
      toleranzProzent: 0,
    }),
  );
}

describe('Lieferanten', () => {
  it('anlegen mit automatischer ID; ändern; Auswahl nach Stichwort; alle Stichwörter', () => {
    expect(naechsteLieferantId(BEISPIEL_PRODUKTION)).toBe('LF-0001');
    const p = mitLieferanten();
    expect(p.lieferanten?.map((l) => l.id)).toEqual(['LF-0001', 'LF-0002']);
    expect(lieferantenMitStichwort(p, ' OFFSETDRUCK ').map((l) => l.name)).toEqual([
      'Offset Nord',
      'Folien Süd',
    ]);
    expect(lieferantenMitStichwort(p, 'Falzen').map((l) => l.name)).toEqual(['Offset Nord']);
    expect(alleStichworte(p)).toEqual(['Cellophanieren', 'Falzen', 'Offsetdruck']);
    const geaendert = wert(
      lieferantAendern(p, { id: 'LF-0002', name: 'Folien Süd GmbH', lieferzeitTage: 4 }),
    );
    expect(geaendert.lieferanten?.[1]).toEqual({
      id: 'LF-0002',
      name: 'Folien Süd GmbH',
      lieferzeitTage: 4,
    });
  });

  it('Fehler am Feld: E-Mail, doppeltes Stichwort, doppelter Name, Toleranz, Abrechnung', () => {
    const p = mitLieferanten();
    expect(fehler(lieferantHinzufuegen(p, { name: 'X', email: 'keine-adresse' }))).toEqual([
      { pfad: 'email', meldung: 'E-Mail-Adresse ungültig' },
    ]);
    expect(
      fehler(lieferantHinzufuegen(p, { name: 'X', stichworte: ['Stanzen', ' stanzen'] })),
    ).toEqual([{ pfad: 'stichworte.1', meldung: 'Stichwort doppelt: stanzen' }]);
    expect(fehler(lieferantHinzufuegen(p, { name: 'offset  nord' }))).toEqual([
      { pfad: 'name', meldung: 'Name doppelt: offset  nord' },
    ]);
    expect(fehler(lieferantHinzufuegen(p, { name: 'X', toleranzProzent: 60 }))).toEqual([
      { pfad: 'toleranzProzent', meldung: 'höchstens 50' },
    ]);
    expect(fehler(lieferantHinzufuegen(p, { name: 'X', abrechnung: 'pauschal' }))).toEqual([
      { pfad: 'abrechnung', meldung: 'Abrechnung unbekannt' },
    ]);
    expect(fehler(lieferantAendern(p, { id: 'LF-0099', name: 'Y' }))).toEqual([
      { pfad: 'id', meldung: 'Lieferant LF-0099 nicht gefunden' },
    ]);
  });

  it('Verweise: Platz auf unbekannten Lieferanten, Entfernen gesperrt; Katalog frei', () => {
    const p = mitLieferanten();
    const fremd = {
      id: 'AP-OFFSET',
      name: 'Offsetdruck (Zukauf)',
      schritte: [],
      fremdarbeit: { lieferantId: 'LF-0001' },
    };
    expect(
      fehler(arbeitsplatzHinzufuegen(p, { ...fremd, fremdarbeit: { lieferantId: 'LF-0077' } })),
    ).toEqual([{ pfad: 'fremdarbeit.lieferantId', meldung: 'Lieferant LF-0077 nicht gefunden' }]);
    const mitPlatz = wert(arbeitsplatzHinzufuegen(p, fremd));
    expect(fehler(lieferantEntfernen(mitPlatz, 'LF-0001'))).toEqual([
      { pfad: 'id', meldung: 'Lieferant LF-0001 wird genutzt von: AP-OFFSET' },
    ]);
    expect(wert(lieferantEntfernen(mitPlatz, 'LF-0002')).lieferanten).toHaveLength(1);
    const ohne = wert(lieferantEntfernen(wert(lieferantEntfernen(p, 'LF-0002')), 'LF-0001'));
    expect('lieferanten' in ohne).toBe(false);
    expect(fehler(arbeitsschrittEntfernen(p, 'S0001'))[0]?.meldung).toBe(
      'Arbeitsschritt S0001 wird genutzt von: AP-TON5C',
    );
  });

  it('JSON: sortiert, verlustfrei; Lieferanten aus T38 werden umgestellt', () => {
    const p = mitLieferanten();
    const json = produktionAlsJson(p);
    expect(wert(produktionAusJson(json)).lieferanten).toEqual(p.lieferanten);
    expect(json.indexOf('"LF-0001"')).toBeLessThan(json.indexOf('"LF-0002"'));
    expect(produktionAlsJson(BEISPIEL_PRODUKTION)).not.toContain('lieferanten');
    const alt = {
      ...BEISPIEL_PRODUKTION,
      lieferanten: [
        {
          id: 'LF-0001',
          name: 'Offset Nord',
          leistungen: ['S0001', 'S9999'],
          leistungenFrei: ['Offsetdruck bis 70 × 100', 'Falzen'],
        },
      ],
    };
    expect(wert(produktionAusJson(JSON.stringify(alt))).lieferanten).toEqual([
      {
        id: 'LF-0001',
        name: 'Offset Nord',
        stichworte: ['Digitaldruck', 'S9999'],
        beschreibung: 'Offsetdruck bis 70 × 100\nFalzen',
      },
    ]);
  });
});
