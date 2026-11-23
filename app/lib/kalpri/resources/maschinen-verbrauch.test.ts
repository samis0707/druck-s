import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  eintragDerGruppe,
  kalkulationAusArtikel,
  maschinenVerbrauch,
  pruefeProduktion,
  rechneKalkulation,
  verbrauchAnDieMaschine,
  verbrauchGruppen,
  verbrauchWahlFuerWert,
  type Artikel,
  type Kalkulation,
  type Lager,
  type MaschinenVerbrauch,
  type Produktion,
} from './index';

// T115: Verbrauchsmaterial der Maschine – Gruppen von Alternativen, je Gruppe eins

const HEUTE = '2026-11-10';
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function lager(): Lager {
  const l = kopie(BEISPIEL_LAGER);
  const folie = (id: string, sorte: string) => ({
    id,
    form: 'Rolle' as const,
    sorte,
    kategorie: 'sonstiges' as const,
    grammatur: 39,
    breiteUm: 315_000,
    laengeM: 50,
  });
  l.materialien.push(
    folie('F1', 'Folie matt'),
    folie('F2', 'Folie glänzend'),
    folie('F3', 'Folie Softtouch'),
  );
  l.materialien.push({
    id: 'OEL',
    form: 'Menge',
    sorte: 'Öl',
    kategorie: 'sonstiges',
    einheit: 'ml',
  } as never);
  const preis = (
    id: string,
    materialId: string,
    betrag: number,
    einheitName = 'Rolle',
    inhalt = 1,
  ) => ({
    id,
    materialId,
    lieferant: 'Martin Maier',
    gueltigAb: '2026-11-01',
    basis: 'einheit' as const,
    einheitName,
    inhalt,
    staffel: [{ ab: 1, betragZehntelcent: betrag }],
  });
  l.preise = [
    ...(l.preise ?? []),
    preis('PF1', 'F1', 85_100),
    preis('PF2', 'F2', 85_100),
    preis('PF3', 'F3', 164_900),
    preis('POEL', 'OEL', 10_000, 'Liter', 1000),
  ] as never;
  return l;
}

const FOLIEN: MaschinenVerbrauch[] = [
  {
    id: 'V1',
    materialId: 'F1',
    gruppe: 'Folie',
    menge: 0.154,
    je: 'Bogen',
    standard: true,
    wert: 'matt',
  },
  { id: 'V2', materialId: 'F2', gruppe: 'Folie', menge: 0.154, je: 'Bogen', wert: 'glänzend' },
  { id: 'V3', materialId: 'F3', gruppe: 'folie', menge: 0.156, je: 'Bogen', wert: 'Softtouch' },
];

/** Kaschieren am Aerocut-Platz (Schritt S0007 als Stellvertreter) mit drei Folien + Öl je Stunde. */
function produktion(extra: Partial<MaschinenVerbrauch> = {}): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const s = p.arbeitsschritte.find((x) => x.id === 'S0007');
  if (!s) throw new Error('S0007');
  s.name = 'Kaschieren';
  s.imWeg = { art: 'merkmal', name: 'Kaschierung', werte: ['matt', 'glänzend', 'Softtouch'] };
  s.menge = { wert: 'druckbogen' };
  const platz = (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-AEROCUT');
  if (!platz) throw new Error('AP-AEROCUT');
  platz.verbrauchsmaterial = [
    ...FOLIEN.map((v) => ({ ...v, schritte: ['S0007'] })),
    { id: 'V4', materialId: 'OEL', gruppe: 'Öl', menge: 6, je: 'Stunde', ...extra },
  ];
  return p;
}

const platz = (p: Produktion) => (p.arbeitsplaetze ?? []).find((a) => a.id === 'AP-AEROCUT');

describe('T115 Schema', () => {
  it('gültig; doppelte ID, fremder Schritt und zwei Standards je Gruppe werden gemeldet', () => {
    expect(pruefeProduktion(produktion()).ok).toBe(true);
    const p = produktion();
    const a = platz(p);
    if (!a?.verbrauchsmaterial) throw new Error('platz');
    a.verbrauchsmaterial.push({ ...FOLIEN[1]!, id: 'V1', schritte: ['S9999'] });
    a.verbrauchsmaterial.push({ ...FOLIEN[2]!, id: 'V8', standard: true });
    const r = pruefeProduktion(p);
    expect(r.ok).toBe(false);
    const m = r.ok ? [] : r.fehler.map((f) => f.meldung);
    expect(m).toContain('V1 doppelt');
    expect(m).toContain('S9999 gibt es an dieser Maschine nicht');
    expect(m).toContain('In der Gruppe „folie“ ist schon ein Standard');
  });
});

describe('T115 Auswahl je Gruppe', () => {
  it('Gruppen ohne Groß/klein; je Gruppe Wahl, sonst Standard, sonst der erste', () => {
    const a = platz(produktion());
    const g = verbrauchGruppen(a, 'S0007');
    expect(g.map((x) => [x.gruppe, x.eintraege.length])).toEqual([
      ['Folie', 3],
      ['Öl', 1],
    ]);
    expect(eintragDerGruppe(g[0]!, undefined)?.materialId).toBe('F1');
    expect(eintragDerGruppe(g[0]!, { folie: 'F3' })?.materialId).toBe('F3');
    expect(eintragDerGruppe(g[0]!, { Folie: 'GIBTSNICHT' })?.materialId).toBe('F1');
    expect(maschinenVerbrauch(a, 'S0007', { Folie: 'F2' })).toEqual([
      { materialId: 'F2', menge: 0.154, je: 'Bogen' },
      { materialId: 'OEL', menge: 6, je: 'Stunde' },
    ]);
    // Öl hat keine Schritt-Einschränkung, gilt auch beim Schneiden (S0006 hängt nicht am Platz → nur Öl)
    expect(maschinenVerbrauch(a, 'S0006').map((v) => v.materialId)).toEqual(['OEL']);
  });

  it('Merkmal-Wert wählt (Groß/klein egal); unbekannter Wert → keine Wahl', () => {
    const a = platz(produktion());
    expect(verbrauchWahlFuerWert(a, 'S0007', 'softtouch')).toEqual({ Folie: 'F3' });
    expect(verbrauchWahlFuerWert(a, 'S0007', 'pur')).toBeUndefined();
    expect(verbrauchWahlFuerWert(a, 'S0007', null)).toBeUndefined();
  });
});

describe('T115 Kalkulation', () => {
  function kalk(wahl?: Record<string, string>): Kalkulation {
    return {
      id: 'K-0001',
      titel: 'Kaschieren',
      auflagen: [1000],
      einheit: 'Bogen',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-AEROCUT',
          schrittId: 'S0007',
          menge: { art: 'auflage' },
          ...(wahl ? { verbrauchWahl: wahl } : {}),
        },
      ],
    };
  }
  const z = (k: Kalkulation) =>
    rechneKalkulation(k, produktion(), lager(), HEUTE).auflagen[0]?.zeilen[0];

  it('Standard matt, gewählt Softtouch teurer; Rechenweg nennt die Folie und das Öl', () => {
    const matt = z(kalk());
    const soft = z(kalk({ Folie: 'F3' }));
    expect(matt?.rechenweg.some((t) => t.includes('Verbrauch Folie matt'))).toBe(true);
    expect(matt?.rechenweg.some((t) => t.includes('Verbrauch Öl'))).toBe(true);
    expect(soft?.rechenweg.some((t) => t.includes('Verbrauch Folie Softtouch'))).toBe(true);
    expect((soft?.kostenVoll?.zehntelcent ?? 0) > (matt?.kostenVoll?.zehntelcent ?? 0)).toBe(true);
  });

  it('Öl je Betriebsstunde: Menge aus der Laufzeit', () => {
    const r = z(kalk());
    const oel = r?.rechenweg.find((t) => t.startsWith('Verbrauch Öl'));
    expect(oel).toMatch(/^Verbrauch Öl \(OEL\): 6 je Std\. × /);
  });

  it('Aus Artikel: Merkmal Kaschierung „Softtouch“ wählt die Softtouch-Folie', () => {
    const a: Artikel = {
      id: 'A-0001',
      titel: 'Karte kaschiert',
      einheit: 'Stueck',
      endformat: { zustand: 'fest', wert: { breiteUm: 105_000, hoeheUm: 148_000 } },
      teile: [
        {
          id: 'T1',
          name: 'Karte',
          jeProdukt: 1,
          woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L4' } },
          druck: { zustand: 'fest', wert: { vorne: { farbe: 'farbig' } } },
          wer: { zustand: 'fest', wert: 'haus' },
          merkmale: [{ name: 'Kaschierung', wert: { zustand: 'fest', wert: 'Softtouch' } }],
        },
      ],
    };
    const v = kalkulationAusArtikel(a, produktion(), lager(), {
      auflagen: [100],
      erstelltAm: HEUTE,
    });
    const zeile = (v.eingabe['zeilen'] as { schrittId?: string; verbrauchWahl?: unknown }[]).find(
      (x) => x.schrittId === 'S0007',
    );
    expect(zeile?.verbrauchWahl).toEqual({ Folie: 'F3' });
  });
});

describe('T115 Übernahme: Verbrauch am Schritt → Maschine', () => {
  it('wandert an die Maschine, rechnet gleich; ohne alten Verbrauch dasselbe Objekt', () => {
    const p = kopie(BEISPIEL_PRODUKTION);
    const a = (p.arbeitsplaetze ?? []).find((x) => x.id === 'AP-AEROCUT');
    const s = a?.schritte.find((x) => x.schrittId === 'S0007');
    if (!s) throw new Error('S0007');
    s.verbrauch = [
      { materialId: 'F1', menge: 0.154, je: 'Bogen' },
      { materialId: 'OEL', menge: 6, je: 'Stunde' },
    ];
    const neu = verbrauchAnDieMaschine(p, lager());
    const b = (neu.arbeitsplaetze ?? []).find((x) => x.id === 'AP-AEROCUT');
    expect(b?.schritte.find((x) => x.schrittId === 'S0007')?.verbrauch).toBeUndefined();
    expect(b?.verbrauchsmaterial).toEqual([
      {
        id: 'V1',
        materialId: 'F1',
        gruppe: 'Folie',
        menge: 0.154,
        je: 'Bogen',
        schritte: ['S0007'],
        standard: true,
      },
      {
        id: 'V2',
        materialId: 'OEL',
        gruppe: 'Öl',
        menge: 6,
        je: 'Stunde',
        schritte: ['S0007'],
        standard: true,
      },
    ]);
    expect(pruefeProduktion(neu).ok).toBe(true);
    const k: Kalkulation = {
      id: 'K-0001',
      titel: 'x',
      auflagen: [500],
      einheit: 'Bogen',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-AEROCUT',
          schrittId: 'S0007',
          menge: { art: 'auflage' },
        },
      ],
    };
    const vorher = rechneKalkulation(k, p, lager(), HEUTE).auflagen[0]?.kostenMitZeilenaufschlag
      .zehntelcent;
    const nachher = rechneKalkulation(k, neu, lager(), HEUTE).auflagen[0]?.kostenMitZeilenaufschlag
      .zehntelcent;
    expect(nachher).toBe(vorher);
    expect(verbrauchAnDieMaschine(BEISPIEL_PRODUKTION)).toBe(BEISPIEL_PRODUKTION);
  });

  it('gleiches erstes Wort an einem Schritt: eigene Gruppen (beide werden gerechnet)', () => {
    const p = kopie(BEISPIEL_PRODUKTION);
    const s = (p.arbeitsplaetze ?? [])
      .find((x) => x.id === 'AP-AEROCUT')
      ?.schritte.find((x) => x.schrittId === 'S0007');
    if (!s) throw new Error('S0007');
    s.verbrauch = [
      { materialId: 'F1', menge: 1, je: 'Bogen' },
      { materialId: 'F2', menge: 1, je: 'Bogen' },
    ];
    const b = (verbrauchAnDieMaschine(p, lager()).arbeitsplaetze ?? []).find(
      (x) => x.id === 'AP-AEROCUT',
    );
    expect(b?.verbrauchsmaterial?.map((v) => v.gruppe)).toEqual(['Folie', 'Folie (2)']);
    expect(maschinenVerbrauch(b, 'S0007').map((v) => v.materialId)).toEqual(['F1', 'F2']);
  });
});
