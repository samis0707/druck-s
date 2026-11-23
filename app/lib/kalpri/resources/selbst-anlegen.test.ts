import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  antwortenMitVorgabe,
  arbeitsweg,
  artikelFragen,
  artikelMitAntworten,
  imWegText,
  inBeschreibungStandard,
  kalkulationAusArtikel,
  kalkulationHinzufuegen,
  leereKalkulationen,
  pruefeArtikelbestand,
  pruefeProduktion,
  rechneKalkulation,
  type Artikel,
  type ArtikelTeil,
  type Kalkulation,
  type Produktion,
} from './index';

// T108: selbst anlegen – Schritte „einmal je Auftrag“, Druck nur an passenden Maschinen
// (Bogen/Rolle), Rolle schneiden, offenes Material und offene Farbigkeit abfragen

const HEUTE = '2026-11-09';
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const VIER_NULL = { vorne: { farbe: 'farbig' as const } };

/** Datencheck einmal je Auftrag; Großformatdruck im Weg; Latex nimmt nur Rolle. */
function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const s = (id: string) => {
    const x = p.arbeitsschritte.find((y) => y.id === id);
    if (!x) throw new Error(id);
    return x;
  };
  s('S0004').imWeg = { art: 'auftrag' };
  s('S0003').imWeg = { art: 'druck' };
  const lfp = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-LFP');
  if (!lfp) throw new Error('AP-LFP');
  lfp.grenzen = { ...lfp.grenzen, annahme: ['rolle'] };
  expect(pruefeProduktion(p).ok).toBe(true);
  return p;
}

function artikel(t: Partial<ArtikelTeil>, endformat = mm(210, 297)): Artikel {
  const a: Artikel = {
    id: 'A-0001',
    titel: 'Muster',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: endformat },
    teile: [
      {
        id: 'T1',
        name: 'Teil',
        jeProdukt: 1,
        woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L1' } },
        druck: { zustand: 'fest', wert: VIER_NULL },
        wer: { zustand: 'fest', wert: 'haus' },
        ...t,
      },
    ],
  };
  expect(pruefeArtikelbestand({ version: 1, artikel: [a] }).ok).toBe(true);
  return a;
}

function anlegen(a: Artikel, p = produktion()) {
  const v = kalkulationAusArtikel(a, p, BEISPIEL_LAGER, { auflagen: [100], erstelltAm: HEUTE });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return { v, k: r.wert.kalkulationen[0] as Kalkulation, p };
}

const gaenge = (k: Kalkulation) =>
  k.zeilen.flatMap((z) => (z.art === 'arbeitsgang' ? [`${z.platzId} ${z.schrittId}`] : []));

describe('T108 Schritt einmal je Auftrag', () => {
  it('Arbeitsweg: einmal, ohne Teil; Text und nicht in der Beschreibung', () => {
    const w = arbeitsweg(artikel({}), produktion());
    const check = w.schritte.filter((s) => s.schrittId === 'S0004');
    expect(check).toHaveLength(1);
    expect(check[0]?.teilId).toBeNull();
    expect(check[0]?.grund).toBe('einmal je Auftrag');
    expect(imWegText({ art: 'auftrag' })).toBe('einmal je Auftrag');
    expect(inBeschreibungStandard('auftrag')).toBe(false);
  });

  it('Aus Artikel: Zeile mit Menge „einmal je Auftrag“, rechnet 1', () => {
    const { k, p } = anlegen(artikel({}));
    const z = k.zeilen.find((x) => x.art === 'arbeitsgang' && x.schrittId === 'S0004');
    expect(z?.art === 'arbeitsgang' ? z.menge : undefined).toEqual({ art: 'auftrag' });
    const e = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE);
    expect(e.auflagen[0]?.zeilen.find((x) => x.zeileId === z?.id)?.menge).toBe(1);
  });
});

describe('T108 Druck nur an Maschinen, die das Material annehmen', () => {
  it('Bogen: Digitaldruck, kein Großformatdruck', () => {
    const g = gaenge(anlegen(artikel({})).k);
    expect(g).toContain('AP-TON5C S0001');
    expect(g.some((x) => x.endsWith('S0003'))).toBe(false);
  });

  it('Rolle: Großformatdruck, kein Digitaldruck; Schneiden je Abschnitt × 2, ein Stapel', () => {
    const { k, v } = anlegen(
      artikel(
        { woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L8' } } },
        mm(100, 150),
      ),
    );
    const g = gaenge(k);
    expect(g).toContain('AP-LFP S0003');
    expect(g.some((x) => x.endsWith('S0001'))).toBe(false);
    const schnitt = k.zeilen.find((x) => x.art === 'arbeitsgang' && x.schrittId === 'S0006');
    expect(schnitt?.art === 'arbeitsgang' ? schnitt.menge : undefined).toEqual({
      art: 'papierweg',
      teilId: 'T1',
      wert: 'druckbogen',
      faktor: 2,
    });
    expect(schnitt?.art === 'arbeitsgang' ? schnitt.stapel : undefined).toEqual({
      art: 'auftrag',
    });
    expect(v.hinweise).toContain(
      'Teil: Schneiden auf der Rolle – 2 Schnitte je Abschnitt angenommen',
    );
  });
});

describe('T108 offenes Material und offene Farbigkeit abfragen', () => {
  const offen = artikel({ woraus: { zustand: 'offen' }, druck: { zustand: 'offen' } });

  it('Fragen: Material aus dem Lager (ohne Verbrauchsmaterial), übliche Farbigkeiten', () => {
    const lager = {
      materialien: [
        ...BEISPIEL_LAGER.materialien,
        { id: 'TINTE', form: 'Menge' as const, sorte: 'Tinte', einheit: 'ml' as const },
      ],
    };
    const f = artikelFragen(offen, lager);
    const mat = f.find((x) => x.schluessel === 'teil:T1:woraus');
    expect(mat?.art).toBe('auswahl');
    expect(mat?.optionen.map((o) => o.wert)).toEqual(
      BEISPIEL_LAGER.materialien.map((m) => `material:${m.id}`),
    );
    const druck = f.find((x) => x.schluessel === 'teil:T1:druck');
    expect(druck?.optionen.map((o) => o.text)).toEqual(['1/0', '4/0', '1/1', '4/1', '4/4']);
  });

  it('Antworten legen fest; ohne Antwort gilt der erste Wert (wie angezeigt)', () => {
    const fest = artikelMitAntworten(offen, {
      'teil:T1:woraus': 'material:L4',
      'teil:T1:druck': 'druck:4',
    });
    expect(fest.teile[0]?.woraus).toEqual({
      zustand: 'fest',
      wert: { art: 'material', materialId: 'L4' },
    });
    expect(fest.teile[0]?.druck).toEqual({
      zustand: 'fest',
      wert: { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
    });
    const fragen = artikelFragen(offen, BEISPIEL_LAGER);
    const vorgabe = artikelMitAntworten(offen, antwortenMitVorgabe(fragen, {}));
    expect(vorgabe.teile[0]?.woraus).toEqual({
      zustand: 'fest',
      wert: { art: 'material', materialId: 'L1' },
    });
    expect(vorgabe.teile[0]?.druck).toEqual({
      zustand: 'fest',
      wert: { vorne: { farbe: 'schwarz' } },
    });
  });

  it('mit Variante (z. B. „10 Pass“): nur Material, das ein Platz mit der Variante annimmt', () => {
    const p = produktion();
    const mitPass = artikel({ woraus: { zustand: 'offen' }, variante: '10 Pass' });
    const werte = (pr: Produktion) =>
      artikelFragen(mitPass, BEISPIEL_LAGER, pr)
        .find((x) => x.schluessel === 'teil:T1:woraus')
        ?.optionen.map((o) => o.wert);
    expect(werte(p)).toEqual(['material:L8']);
    // Rolle schmaler als das Mindestformat des Platzes: passt nicht – dann alle zur Auswahl
    const lfp = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-LFP');
    if (lfp) lfp.grenzen = { ...lfp.grenzen, formatMin: { breiteUm: 600_000, hoeheUm: 1 } };
    expect(werte(p)).toHaveLength(BEISPIEL_LAGER.materialien.length);
    // Variante, die keine Maschine hat: alle zur Auswahl
    expect(
      artikelFragen(
        { ...mitPass, teile: [{ ...mitPass.teile[0]!, variante: 'Gold' }] },
        BEISPIEL_LAGER,
        produktion(),
      ).find((x) => x.schluessel === 'teil:T1:woraus')?.optionen,
    ).toHaveLength(BEISPIEL_LAGER.materialien.length);
  });

  it('Ware gestellt: keine Frage nach dem Material', () => {
    const f = artikelFragen(
      artikel({ woraus: { zustand: 'offen' }, wareGestellt: true }),
      BEISPIEL_LAGER,
    );
    expect(f.some((x) => x.schluessel === 'teil:T1:woraus')).toBe(false);
  });
});
