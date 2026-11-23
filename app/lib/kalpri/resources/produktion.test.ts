import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  arbeitsschrittAendern,
  arbeitsschrittEntfernen,
  arbeitsschrittHinzufuegen,
  leereProduktion,
  naechsteArbeitsschrittId,
  produktionAlsJson,
  produktionAusJson,
  pruefeProduktion,
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

describe('Arbeitsschritte im Katalog', () => {
  it('Beispiel-Produktion ist gültig; JSON hin und zurück verlustfrei', () => {
    expect(pruefeProduktion(BEISPIEL_PRODUKTION).ok).toBe(true);
    expect(BEISPIEL_PRODUKTION.arbeitsschritte).toHaveLength(22);
    const text = produktionAlsJson(BEISPIEL_PRODUKTION);
    expect(produktionAlsJson(wert(produktionAusJson(text)))).toBe(text);
    expect(fehler(produktionAusJson('{kaputt'))).toEqual([
      { pfad: '', meldung: 'Kein gültiges JSON' },
    ]);
    expect(fehler(pruefeProduktion({ version: 2, arbeitsschritte: [] }))).toEqual([
      { pfad: 'version', meldung: 'Version muss 1 sein' },
    ]);
  });

  it('hinzufügen: Name und Einheit genügen, ID wird vergeben (S0001, dann S0002)', () => {
    expect(naechsteArbeitsschrittId(leereProduktion())).toBe('S0001');
    const p1 = wert(
      arbeitsschrittHinzufuegen(leereProduktion(), { name: ' Rillen ', einheit: 'Bogen' }),
    );
    expect(p1.arbeitsschritte).toEqual([{ id: 'S0001', name: 'Rillen', einheit: 'Bogen' }]);
    const p2 = wert(arbeitsschrittHinzufuegen(p1, { id: ' ', name: 'Bohren', einheit: 'Hub' }));
    expect(p2.arbeitsschritte.map((s) => s.id)).toEqual(['S0001', 'S0002']);
    expect(naechsteArbeitsschrittId(BEISPIEL_PRODUKTION)).toBe('S0023');
  });

  it('Fehler ohne Präfix am Feld: Pflicht, Einheit, doppelte ID, doppelter Name', () => {
    expect(fehler(arbeitsschrittHinzufuegen(leereProduktion(), {}))).toEqual([
      { pfad: 'name', meldung: 'Pflichtfeld' },
      { pfad: 'einheit', meldung: 'Pflichtfeld' },
    ]);
    expect(
      fehler(
        arbeitsschrittHinzufuegen(leereProduktion(), {
          name: 'X',
          einheit: 'Palette',
          werkzeug: 'ja',
        }),
      ),
    ).toEqual([
      { pfad: 'einheit', meldung: 'Einheit unbekannt' },
      { pfad: 'werkzeug', meldung: 'muss ja oder nein sein' },
    ]);
    expect(
      fehler(
        arbeitsschrittHinzufuegen(BEISPIEL_PRODUKTION, {
          id: 'S0001',
          name: 'Neu',
          einheit: 'Bogen',
        }),
      ),
    ).toEqual([{ pfad: 'id', meldung: 'ID doppelt: S0001' }]);
    expect(
      fehler(
        arbeitsschrittHinzufuegen(BEISPIEL_PRODUKTION, { name: '  rillen ', einheit: 'Bogen' }),
      ),
    ).toEqual([{ pfad: 'name', meldung: 'Name doppelt: rillen' }]);
    const doppelt = {
      version: 1,
      arbeitsschritte: [
        { id: 'A', name: 'Lochen', einheit: 'Hub' },
        { id: 'A', name: 'lochen', einheit: 'Hub' },
      ],
    };
    expect(fehler(pruefeProduktion(doppelt))).toEqual([
      { pfad: 'arbeitsschritte.0.id', meldung: 'ID doppelt: A' },
      { pfad: 'arbeitsschritte.0.name', meldung: 'Name doppelt: Lochen' },
      { pfad: 'arbeitsschritte.1.id', meldung: 'ID doppelt: A' },
      { pfad: 'arbeitsschritte.1.name', meldung: 'Name doppelt: lochen' },
    ]);
  });

  it('ändern und entfernen, die Eingabe bleibt unverändert', () => {
    const vorher = JSON.stringify(BEISPIEL_PRODUKTION);
    const geaendert = wert(
      arbeitsschrittAendern(BEISPIEL_PRODUKTION, {
        id: 'S0007',
        name: 'Rillen',
        einheit: 'Nutzen',
      }),
    );
    expect(geaendert.arbeitsschritte[6]).toEqual({
      id: 'S0007',
      name: 'Rillen',
      einheit: 'Nutzen',
    });
    expect(
      fehler(
        arbeitsschrittAendern(BEISPIEL_PRODUKTION, {
          id: 'S0007',
          name: 'Bohren',
          einheit: 'Bogen',
        }),
      ),
    ).toEqual([{ pfad: 'name', meldung: 'Name doppelt: Bohren' }]);
    expect(
      fehler(
        arbeitsschrittAendern(BEISPIEL_PRODUKTION, { id: 'S0099', name: 'X', einheit: 'Bogen' }),
      ),
    ).toEqual([{ pfad: 'id', meldung: 'Arbeitsschritt S0099 nicht gefunden' }]);
    expect(
      wert(arbeitsschrittEntfernen(BEISPIEL_PRODUKTION, 'S0022')).arbeitsschritte,
    ).toHaveLength(21);
    expect(fehler(arbeitsschrittEntfernen(BEISPIEL_PRODUKTION, 'S0099'))).toEqual([
      { pfad: 'id', meldung: 'Arbeitsschritt S0099 nicht gefunden' },
    ]);
    expect(JSON.stringify(BEISPIEL_PRODUKTION)).toBe(vorher);
  });
});
