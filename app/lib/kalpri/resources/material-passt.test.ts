import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  materialPasstAufPlatz,
  pruefeMaterial,
  type Arbeitsplatz,
  type Material,
} from './index';

/** Arbeitsplatz mit allen geprüften Grenzen (Grenzen am Platz). */
const PLATZ: Arbeitsplatz = {
  id: 'P1',
  name: 'Prüfplatz',
  schritte: [],
  grenzen: {
    formatMin: { breiteUm: 100_000, hoeheUm: 150_000 },
    formatMax: { breiteUm: 500_000, hoeheUm: 500_000 },
    grammaturMin: 60,
    grammaturMax: 350,
    dickeMaxUm: 2_000,
  },
};

/** Prüft die Eingabe und wirft bei Prüffehlern mit Meldungen. */
function material(eingabe: unknown): Material {
  const e = pruefeMaterial(eingabe);
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

/** Wählt ein Beispielmaterial aus dem Beispiel-Lager. */
function beispiel(id: string): Material {
  const m = BEISPIEL_LAGER.materialien.find((eintrag) => eintrag.id === id);
  if (!m) throw new Error(`${id} fehlt`);
  return m;
}

describe('passt auf Arbeitsplatz (T69)', () => {
  it('Treffer und Ausschluss je Grenze; gedrehtes Format zählt als Treffer', () => {
    const imBereich = material({
      form: 'Bogen',
      id: 'PX',
      sorte: 'Test',
      grammatur: 200,
      dickeUm: 200,
      breiteUm: 300_000,
      hoeheUm: 400_000,
    });
    expect(imBereich.form).toBe('Bogen');
    // alle Grenzen gleichzeitig: Treffer
    expect(materialPasstAufPlatz(imBereich, PLATZ)).toBe(true);

    // formatMax: zu groß (auch gedreht)
    const zuGroß = material({
      form: 'Bogen',
      id: 'PY1',
      sorte: 'Test',
      grammatur: 200,
      dickeUm: 200,
      breiteUm: 600_000,
      hoeheUm: 400_000,
    });
    expect(materialPasstAufPlatz(zuGroß, PLATZ)).toBe(false);

    // formatMin: zu klein im Winkel, aber die andere Lage passt (gedrehter Bogen)
    const zuKlein = material({
      form: 'Bogen',
      id: 'PY2',
      sorte: 'Test',
      grammatur: 200,
      dickeUm: 200,
      breiteUm: 90_000,
      hoeheUm: 120_000,
    });
    expect(materialPasstAufPlatz(zuKlein, PLATZ)).toBe(false);
    const gedreht = material({
      form: 'Bogen',
      id: 'PY3',
      sorte: 'Test',
      grammatur: 200,
      dickeUm: 200,
      breiteUm: 160_000,
      hoeheUm: 110_000,
    });
    expect(materialPasstAufPlatz(gedreht, PLATZ)).toBe(true);

    // grammaturMin / grammaturMax: Format passt, Grammatur nicht
    for (const grammatur of [50, 400]) {
      const falsch = material({
        form: 'Bogen',
        id: `PYG${grammatur}`,
        sorte: 'Test',
        grammatur,
        dickeUm: 200,
        breiteUm: 300_000,
        hoeheUm: 400_000,
      });
      expect(materialPasstAufPlatz(falsch, PLATZ)).toBe(false);
    }

    // dickeMaxUm
    const zuDick = material({
      form: 'Bogen',
      id: 'PY4',
      sorte: 'Test',
      grammatur: 200,
      dickeUm: 2_500,
      breiteUm: 300_000,
      hoeheUm: 400_000,
    });
    expect(materialPasstAufPlatz(zuDick, PLATZ)).toBe(false);

    // Beispieldaten: Digitalkarton (32×45, 350 g, 400 µm) passt
    expect(materialPasstAufPlatz(beispiel('L4'), PLATZ)).toBe(true);
  });

  it('Rolle: Format wird nicht geprüft, die Grammatur-Grenze schon', () => {
    expect(materialPasstAufPlatz(beispiel('L8'), PLATZ)).toBe(true);
    const zuSchwer = material({
      form: 'Rolle',
      id: 'PR1',
      sorte: 'Test',
      grammatur: 400,
      breiteUm: 330_000,
      laengeM: 500,
    });
    expect(materialPasstAufPlatz(zuSchwer, PLATZ)).toBe(false);
  });

  it('ohne Grenzen passt alles', () => {
    expect(
      materialPasstAufPlatz(beispiel('L9'), { id: 'P', name: 'Handarbeit', schritte: [] }),
    ).toBe(true);
  });

  it('mit Beispielproduktion: Digitalkarton passt auf die Digitale Stanze, Bogen 70×100 nicht', () => {
    const digistanze = BEISPIEL_PRODUKTION.arbeitsplaetze?.find((p) => p.id === 'AP-DIGISTANZE');
    if (!digistanze) throw new Error('AP-DIGISTANZE fehlt');
    expect(materialPasstAufPlatz(beispiel('L4'), digistanze)).toBe(true);
    expect(materialPasstAufPlatz(beispiel('L1'), digistanze)).toBe(false);
  });
});
