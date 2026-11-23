import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  lagerAlsJson,
  lagerAufteilen,
  lagerZusammenfuehren,
  leereWerkzeuge,
  pruefeWerkzeuge,
  werkzeugeAlsJson,
  werkzeugeAusJson,
  type Lager,
} from './index';

describe('Werkzeuge als eigener Datenblock (ADR 0003)', () => {
  it('Beispiel-Lager aufteilen: Material ohne Stanzformen, Werkzeuge mit allen Stanzformen', () => {
    const anzahl = (BEISPIEL_LAGER.stanzformen ?? []).length;
    expect(anzahl).toBeGreaterThan(0);
    const { material, werkzeuge } = lagerAufteilen(BEISPIEL_LAGER);
    expect('stanzformen' in material).toBe(false);
    expect(werkzeuge.stanzformen).toHaveLength(anzahl);
    expect(material.materialien).toEqual(BEISPIEL_LAGER.materialien);
    expect(material.bestaende).toEqual(BEISPIEL_LAGER.bestaende);
    expect(lagerAlsJson(material)).not.toContain('"stanzformen"');
  });

  it('zusammenführen stellt das Lager wieder her (Rückweg)', () => {
    const { material, werkzeuge } = lagerAufteilen(BEISPIEL_LAGER);
    expect(lagerAlsJson(lagerZusammenfuehren(material, werkzeuge))).toBe(
      lagerAlsJson(BEISPIEL_LAGER),
    );
    const ohne: Lager = { ...BEISPIEL_LAGER };
    delete ohne.stanzformen;
    const leer = lagerZusammenfuehren(ohne, leereWerkzeuge());
    expect('stanzformen' in leer).toBe(false);
  });

  it('die Werkzeuge gewinnen gegen Stanzformen, die noch im Material stehen', () => {
    const { werkzeuge } = lagerAufteilen(BEISPIEL_LAGER);
    const nurEine = { ...werkzeuge, stanzformen: werkzeuge.stanzformen.slice(0, 1) };
    expect(lagerZusammenfuehren(BEISPIEL_LAGER, nurEine).stanzformen).toEqual(nurEine.stanzformen);
  });

  it('JSON: deterministisch, nach ID sortiert, hin und zurück; Fehler am Feld', () => {
    const { werkzeuge } = lagerAufteilen(BEISPIEL_LAGER);
    const umgedreht = { ...werkzeuge, stanzformen: [...werkzeuge.stanzformen].reverse() };
    expect(werkzeugeAlsJson(umgedreht)).toBe(werkzeugeAlsJson(werkzeuge));
    const gelesen = werkzeugeAusJson(werkzeugeAlsJson(werkzeuge));
    expect(gelesen.ok && werkzeugeAlsJson(gelesen.wert)).toBe(werkzeugeAlsJson(werkzeuge));
    expect(werkzeugeAusJson('{ kaputt')).toEqual({
      ok: false,
      fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }],
    });
    const erste = werkzeuge.stanzformen[0];
    if (!erste) throw new Error('Stanzform fehlt');
    expect(pruefeWerkzeuge({ version: 1, stanzformen: [erste, erste] })).toEqual({
      ok: false,
      fehler: [{ pfad: 'stanzformen.1.id', meldung: `ID doppelt: ${erste.id}` }],
    });
    expect(pruefeWerkzeuge({ stanzformen: [] })).toEqual({
      ok: false,
      fehler: [{ pfad: 'version', meldung: 'Pflichtfeld' }],
    });
  });
});
