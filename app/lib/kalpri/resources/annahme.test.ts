import { describe, expect, it } from 'vitest';
import { BEISPIEL_PRODUKTION, annahmeVon, pruefeProduktion } from './index';

describe('Was der Platz annimmt', () => {
  it('Angabe geht vor; sonst Einlegehöhe → Stapel, Format/Grammatur/Dicke → Bogen, sonst nichts', () => {
    expect(annahmeVon(undefined)).toEqual([]);
    expect(annahmeVon({})).toEqual([]);
    expect(annahmeVon({ annahme: ['rolle'], einlegehoeheUm: 50_000 })).toEqual(['rolle']);
    expect(annahmeVon({ einlegehoeheUm: 50_000, grammaturMax: 300 })).toEqual(['stapel']);
    expect(annahmeVon({ grammaturMax: 300 })).toEqual(['bogen']);
    expect(annahmeVon({ randUm: 4000 })).toEqual([]);
  });

  it('Schema: bekannte Werte gültig, unbekannte am Feld gemeldet', () => {
    const p = JSON.parse(JSON.stringify(BEISPIEL_PRODUKTION)) as {
      arbeitsplaetze: { grenzen?: Record<string, unknown> }[];
    };
    const erster = p.arbeitsplaetze[0];
    if (!erster) throw new Error('kein Platz');
    erster.grenzen = { annahme: ['bogen', 'stapel'] };
    expect(pruefeProduktion(p).ok).toBe(true);
    erster.grenzen = { annahme: ['karton'] };
    const r = pruefeProduktion(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler).toEqual([
      { pfad: 'arbeitsplaetze.0.grenzen.annahme.0', meldung: 'unbekannt' },
    ]);
  });
});
