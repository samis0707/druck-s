import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_PRODUKTION,
  arbeitsplatzAendern,
  kostenstelleHinzufuegen,
  kostenstelleStatus,
  type Kostenstelle,
  type Produktion,
} from './index';

function wert<T>(e: { ok: true; wert: T } | { ok: false; fehler: unknown }): T {
  if (!e.ok) throw new Error(JSON.stringify(e.fehler));
  return e.wert;
}

function ks(p: Produktion, name: string): Kostenstelle {
  const gefunden = (p.kostenstellen ?? []).find((k) => k.name === name);
  if (!gefunden) throw new Error(`Kostenstelle ${name} fehlt`);
  return gefunden;
}

describe('kostenstelleStatus', () => {
  it('Vollkosten und Teilkosten, vorläufig, kein Platz: Hinweis', () => {
    const p = wert(
      kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
        name: 'Teststelle',
        stundensatzVollZehntelcent: 48_000,
        stundensatzTeilZehntelcent: 30_000,
        stundensatzVorlaeufig: true,
      }),
    );
    expect(kostenstelleStatus(p, ks(p, 'Teststelle'))).toEqual({
      stand: 'hinweis',
      gruende: ['Stundensatz vorläufig', 'noch kein Platz'],
    });
  });

  it('nur Vollkosten, kein Platz: Hinweis', () => {
    const p = wert(
      kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
        name: 'Nur Voll',
        stundensatzVollZehntelcent: 48_000,
      }),
    );
    expect(kostenstelleStatus(p, ks(p, 'Nur Voll'))).toEqual({
      stand: 'hinweis',
      gruende: ['Teilkosten nicht hinterlegt', 'noch kein Platz'],
    });
  });

  it('vollständig und von AP-KLEIN genutzt: ok', () => {
    const mitKs = wert(
      kostenstelleHinzufuegen(BEISPIEL_PRODUKTION, {
        name: 'Kleine Maschinen',
        stundensatzVollZehntelcent: 48_000,
        stundensatzTeilZehntelcent: 30_000,
      }),
    );
    const klein = mitKs.arbeitsplaetze?.find((p) => p.id === 'AP-KLEIN');
    if (!klein) throw new Error('AP-KLEIN fehlt');
    const roh: Record<string, unknown> = {
      ...klein,
      kostenstelleId: ks(mitKs, 'Kleine Maschinen').id,
    };
    delete roh['stundensatzVollZehntelcent'];
    delete roh['stundensatzTeilZehntelcent'];
    delete roh['stundensatzVorlaeufig'];
    const p = wert(arbeitsplatzAendern(mitKs, roh));
    expect(kostenstelleStatus(p, ks(p, 'Kleine Maschinen'))).toEqual({
      stand: 'ok',
      gruende: [],
    });
  });
});
