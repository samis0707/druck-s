import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  bestandAbtrennen,
  bestandEinsetzen,
  lagerAlsJson,
  lagerbestandAlsJson,
  lagerbestandAusJson,
  leererLagerbestand,
  pruefeLagerbestand,
} from './index';

describe('Lagerbestand als eigener Datenblock (ADR 0003)', () => {
  it('abtrennen: Material mit leerem Bestand, Bestand-Block mit allen Zeilen', () => {
    const anzahl = BEISPIEL_LAGER.bestaende.length;
    expect(anzahl).toBeGreaterThan(0);
    const { material, bestand } = bestandAbtrennen(BEISPIEL_LAGER);
    expect(material.bestaende).toEqual([]);
    expect(bestand.bestaende).toHaveLength(anzahl);
    expect(material.materialien).toEqual(BEISPIEL_LAGER.materialien);
    expect(material.stanzformen).toEqual(BEISPIEL_LAGER.stanzformen);
  });

  it('einsetzen stellt das Lager wieder her (Rückweg)', () => {
    const { material, bestand } = bestandAbtrennen(BEISPIEL_LAGER);
    const wieder = bestandEinsetzen(material, bestand);
    if (!wieder.ok) throw new Error(JSON.stringify(wieder.fehler));
    expect(lagerAlsJson(wieder.wert)).toBe(lagerAlsJson(BEISPIEL_LAGER));
    const leer = bestandEinsetzen(material, leererLagerbestand());
    expect(leer.ok && leer.wert.bestaende).toEqual([]);
  });

  it('einsetzen meldet Zeilen ohne passendes Material, statt sie still zu verwerfen', () => {
    const { material, bestand } = bestandAbtrennen(BEISPIEL_LAGER);
    const erste = bestand.bestaende[0];
    if (!erste) throw new Error('Bestand fehlt');
    const fremd = { ...bestand, bestaende: [{ ...erste, materialId: 'GIBTSNICHT' }] };
    expect(bestandEinsetzen(material, fremd)).toEqual({
      ok: false,
      fehler: [{ pfad: 'bestaende.0.materialId', meldung: 'Material GIBTSNICHT nicht gefunden' }],
    });
  });

  it('JSON: deterministisch sortiert, hin und zurück; Fehler am Feld', () => {
    const { bestand } = bestandAbtrennen(BEISPIEL_LAGER);
    const umgedreht = { ...bestand, bestaende: [...bestand.bestaende].reverse() };
    expect(lagerbestandAlsJson(umgedreht)).toBe(lagerbestandAlsJson(bestand));
    const gelesen = lagerbestandAusJson(lagerbestandAlsJson(bestand));
    expect(gelesen.ok && lagerbestandAlsJson(gelesen.wert)).toBe(lagerbestandAlsJson(bestand));
    expect(lagerbestandAusJson('{ kaputt')).toEqual({
      ok: false,
      fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }],
    });
    expect(pruefeLagerbestand({ bestaende: [] })).toEqual({
      ok: false,
      fehler: [{ pfad: 'version', meldung: 'Pflichtfeld' }],
    });
  });
});
