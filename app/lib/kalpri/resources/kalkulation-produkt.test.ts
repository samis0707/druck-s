import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  abweichungenVomArtikel,
  geaenderteMarkieren,
  kalkulationAusProdukt,
  kalkulationHinzufuegen,
  leereKalkulationen,
  neuesProduktTeil,
  produktAusKalkulation,
  produktFehlt,
  produktVon,
  rechneKalkulation,
  wegVorschlagen,
  zeileMitVariante,
  type Artikel,
  type Kalkulation,
  type Zeile,
} from './index';

// T118/T120: Produkt an der Kalkulation, Weg vorschlagen und abgleichen

const HEUTE = '2026-11-11';
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function produkt(merkmale: { name: string; wert: string }[] = []): Artikel {
  return {
    id: 'PRODUKT',
    titel: 'Flyer A5',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } },
    teile: [
      {
        ...neuesProduktTeil(1),
        name: 'Flyer',
        woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L4' } },
        merkmale: merkmale.map((m) => ({
          name: m.name,
          wert: { zustand: 'fest' as const, wert: m.wert },
        })),
      },
    ],
  };
}

function anlegen(a = produkt()): Kalkulation {
  const v = kalkulationAusProdukt(a, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
    titel: 'Flyer A5',
    auflagen: [500],
    erstelltAm: HEUTE,
  });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0];
  if (!k) throw new Error('keine');
  return k;
}

const namen = (k: Kalkulation | Record<string, unknown>) =>
  ((k as { zeilen: Zeile[] }).zeilen ?? []).map((z) =>
    z.art === 'arbeitsgang' ? z.schrittId : z.art === 'material' ? `M:${z.materialId}` : z.art,
  );

describe('T118 Produkt an der Kalkulation', () => {
  it('neu aus Produkt: Zeilen als Vorschlag, Produkt gespeichert, kein Artikel', () => {
    const k = anlegen();
    expect(k.zeilen.length > 0).toBe(true);
    expect(k.zeilen.every((z) => z.vorschlag === true)).toBe(true);
    expect(produktVon(k)?.teile[0]?.name).toBe('Flyer');
    expect(k.artikelId).toBeUndefined();
  });

  it('Produkt ungültig oder fehlt: null', () => {
    expect(produktVon({})).toBeNull();
    expect(produktVon({ produkt: { titel: 'x' } })).toBeNull();
  });

  it('was noch fehlt: Endformat, Material, Farbigkeit', () => {
    const a = produkt();
    expect(produktFehlt(a)).toEqual([]);
    const leer: Artikel = { ...a, endformat: { zustand: 'offen' }, teile: [neuesProduktTeil(1)] };
    expect(produktFehlt(leer)).toEqual(['Endformat', 'Teil: Material']);
  });

  it('alte Kalkulation ohne Produkt: aus Teilen und Druckzeile', () => {
    const k = anlegen();
    const ohne = { ...k } as Kalkulation;
    delete (ohne as { produkt?: unknown }).produkt;
    const a = produktAusKalkulation(ohne);
    expect(a.teile[0]?.woraus).toEqual({
      zustand: 'fest',
      wert: { art: 'material', materialId: 'L4' },
    });
    expect(a.teile[0]?.druck.zustand).toBe('fest');
    expect(a.endformat).toEqual({ zustand: 'fest', wert: { breiteUm: 148_000, hoeheUm: 210_000 } });
  });
});

describe('T120 Weg vorschlagen und abgleichen', () => {
  it('unverändert: gleicher Weg, nichts dazu, nichts weg', () => {
    const k = anlegen();
    const v = wegVorschlagen(k, produktVon(k)!, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, HEUTE);
    expect(namen(v.eingabe)).toEqual(namen(k));
    expect(v.dazu).toEqual([]);
    expect(v.weg).toEqual([]);
  });

  it('Merkmal Bohren dazu: Bohren kommt dazu, IDs eindeutig; wieder weg: Bohren fällt weg', () => {
    const k = anlegen();
    const mit = wegVorschlagen(
      k,
      produkt([{ name: 'Bohren', wert: '2-fach' }]),
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      HEUTE,
    );
    expect(mit.dazu).toEqual(['Bohren (Bohren: 2-fach)']);
    const zeilen = mit.eingabe['zeilen'] as Zeile[];
    expect(new Set(zeilen.map((z) => z.id)).size).toBe(zeilen.length);
    const r = kalkulationHinzufuegen(leereKalkulationen(), mit.eingabe);
    expect(r.ok).toBe(true);
    const k2 = r.ok ? r.wert.kalkulationen[0]! : k;
    const ohne = wegVorschlagen(k2, produkt(), BEISPIEL_PRODUKTION, BEISPIEL_LAGER, HEUTE);
    expect(ohne.weg).toEqual(['Bohren (Bohren: 2-fach)']);
    expect(namen(ohne.eingabe)).not.toContain('S0014');
  });

  it('geänderte und eigene Zeilen bleiben; Druckbogen am Teil bleibt', () => {
    const k = kopie(anlegen());
    const druck = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0001');
    if (druck?.art !== 'arbeitsgang') throw new Error('Druck');
    const geaendert = geaenderteMarkieren(k, {
      ...k,
      zeilen: k.zeilen.map((z) => (z.id === druck.id ? { ...z, profil: 'schnell' } : z)),
    }) as Kalkulation;
    expect(geaendert.zeilen.find((z) => z.id === druck.id)?.geaendert).toBe(true);
    const eigene: Zeile = {
      id: 'Z99',
      art: 'arbeitsgang',
      platzId: 'AP-HAND',
      schrittId: 'S0020',
      menge: { art: 'auflage' },
    };
    const mitEigener = {
      ...geaendert,
      zeilen: [...geaendert.zeilen, eigene],
      teile: geaendert.teile?.map((t) => ({
        ...t,
        druckbogen: { breiteUm: 330_000, hoeheUm: 487_000 },
      })),
    } as Kalkulation;
    const v = wegVorschlagen(
      mitEigener,
      produktVon(k)!,
      BEISPIEL_PRODUKTION,
      BEISPIEL_LAGER,
      HEUTE,
    );
    const zeilen = v.eingabe['zeilen'] as Zeile[];
    const d = zeilen.find((z) => z.id === druck.id);
    expect(d?.art === 'arbeitsgang' ? d.profil : undefined).toBe('schnell');
    expect(zeilen.filter((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0001')).toHaveLength(
      1,
    );
    expect(zeilen.some((z) => z.id === 'Z99')).toBe(true);
    // geänderter Druck und eigene Zeile
    expect(v.bleiben.length).toBe(2);
    expect((v.eingabe['teile'] as { druckbogen?: unknown }[])[0]?.druckbogen).toEqual({
      breiteUm: 330_000,
      hoeheUm: 487_000,
    });
  });

  it('Markieren: ungeänderte und eigene Zeilen bleiben ohne Marke', () => {
    const k = anlegen();
    const neu = geaenderteMarkieren(k, { ...k }) as Kalkulation;
    expect(neu.zeilen.some((z) => z.geaendert === true)).toBe(false);
  });
});

describe('Abweichung vom Artikel (T118)', () => {
  it('gleiches Produkt weicht nicht ab', () => {
    expect(abweichungenVomArtikel(produkt(), produkt())).toEqual([]);
  });

  it('fest gewählter Wert aus wählbar oder offen ist keine Abweichung', () => {
    const artikel = produkt();
    const teil = artikel.teile[0];
    if (!teil) throw new Error('kein Teil');
    artikel.endformat = { zustand: 'offen' };
    teil.druck = {
      zustand: 'waehlbar',
      werte: [
        { vorne: { farbe: 'farbig' }, hinten: { farbe: 'farbig' } },
        { vorne: { farbe: 'schwarz' } },
      ],
    };
    expect(abweichungenVomArtikel(produkt(), artikel)).toEqual([]);
  });

  it('meldet Format, Material, Merkmale, neue und entfernte Teile', () => {
    const artikel = produkt();
    const neu = produkt([{ name: 'Bohren', wert: '2-fach' }]);
    neu.endformat = { zustand: 'fest', wert: { breiteUm: 210_000, hoeheUm: 297_000 } };
    const teil = neu.teile[0];
    if (!teil) throw new Error('kein Teil');
    teil.woraus = { zustand: 'fest', wert: { art: 'material', materialId: 'L5' } };
    neu.teile.push({ ...neuesProduktTeil(2), name: 'Umschlag' });
    expect(abweichungenVomArtikel(neu, artikel)).toEqual([
      'Endformat',
      'Flyer: Material',
      'Flyer: Merkmale',
      'Umschlag neu',
    ]);
    expect(abweichungenVomArtikel(artikel, neu)).toContain('Umschlag entfernt');
  });
});

describe('Farbigkeit nur am Druckschritt (T120)', () => {
  it('Rillen je Druckbogen bei 4/4: ohne Farbigkeit, also ein Durchgang', () => {
    const k = anlegen(produkt([{ name: 'Rillen', wert: '1 Rille' }]));
    const rillen = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0007');
    const druck = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0001');
    expect(rillen?.art === 'arbeitsgang' ? rillen.druck : 'fehlt').toBeUndefined();
    expect(druck?.art === 'arbeitsgang' ? druck.druck : undefined).toEqual({
      vorne: { farbe: 'farbig' },
      hinten: { farbe: 'farbig' },
    });
  });
});

describe('Grenze „höchstens n Nutzen je Bogen“ (T121)', () => {
  function mitGrenze(nutzenMax: number) {
    const k = anlegen(produkt([{ name: 'Rillen', wert: '1 Rille' }]));
    const rillen = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0007');
    if (rillen?.art !== 'arbeitsgang') throw new Error('Rillen');
    const p = kopie(BEISPIEL_PRODUKTION);
    const platz = (p.arbeitsplaetze ?? []).find((x) => x.id === rillen.platzId);
    const schritt = platz?.schritte.find((s) => s.schrittId === 'S0007');
    if (!schritt) throw new Error('Schritt');
    schritt.grenzen = { ...(schritt.grenzen ?? {}), nutzenMax };
    const e = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE);
    const i = k.zeilen.indexOf(rillen);
    return e.auflagen[0]?.zeilen[i];
  }

  it('mehr Nutzen als erlaubt: ungeeignet mit Grund', () => {
    const z = mitGrenze(1);
    expect(z?.ungeeignet?.[0]).toMatch(/höchstens 1 Nutzen je Bogen – hier \d+/);
  });

  it('genug erlaubt: geeignet', () => {
    expect(mitGrenze(500)?.ungeeignet).toBeUndefined();
  });
});

describe('Variante aus dem Merkmal-Wert (T123)', () => {
  it('„Bohren: 4-fach“ wählt die erste passende Variante, nennt die anderen', () => {
    const p = kopie(BEISPIEL_PRODUKTION);
    const platz = (p.arbeitsplaetze ?? []).find((x) =>
      x.schritte.some((s) => s.schrittId === 'S0014'),
    );
    const schritt = platz?.schritte.find((s) => s.schrittId === 'S0014');
    if (!platz || !schritt) throw new Error('Bohren');
    // nur diese Maschine bohrt
    p.arbeitsplaetze = (p.arbeitsplaetze ?? []).map((x) =>
      x.id === platz.id ? x : { ...x, schritte: x.schritte.filter((s) => s.schrittId !== 'S0014') },
    );
    schritt.profile = [
      { name: 'Nagel 2-fach', angaben: ['2-fach'], ruestenMs: 600_000 },
      { name: 'Hang 4-fach', angaben: ['4-fach'], ruestenMs: 900_000 },
      { name: 'Nagel 4-fach', angaben: ['4-fach'], ruestenMs: 1_200_000, faktor: 2 },
    ];
    const v = kalkulationAusProdukt(
      produkt([{ name: 'Bohren', wert: '4-fach' }]),
      p,
      BEISPIEL_LAGER,
      { titel: 'Block', auflagen: [500], erstelltAm: HEUTE },
    );
    const zeilen = v.eingabe['zeilen'] as Zeile[];
    const bohren = zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0014');
    expect(bohren?.art === 'arbeitsgang' ? bohren.profil : undefined).toBe('Hang 4-fach');
    expect(v.hinweise.some((h) => h.includes('auch möglich: Nagel 4-fach'))).toBe(true);
  });
});

describe('Standard-Variante (T124)', () => {
  it('Standard geht vor der Reihenfolge', () => {
    const p = kopie(BEISPIEL_PRODUKTION);
    const platz = (p.arbeitsplaetze ?? []).find((x) =>
      x.schritte.some((s) => s.schrittId === 'S0014'),
    );
    const schritt = platz?.schritte.find((s) => s.schrittId === 'S0014');
    if (!platz || !schritt) throw new Error('Bohren');
    p.arbeitsplaetze = (p.arbeitsplaetze ?? []).map((x) =>
      x.id === platz.id ? x : { ...x, schritte: x.schritte.filter((s) => s.schrittId !== 'S0014') },
    );
    schritt.profile = [
      { name: 'Nagel 4-fach', angaben: ['4-fach'], faktor: 2 },
      { name: 'Hang 4-fach', angaben: ['4-fach'], standard: true },
    ];
    const v = kalkulationAusProdukt(
      produkt([{ name: 'Bohren', wert: '4-fach' }]),
      p,
      BEISPIEL_LAGER,
      { titel: 'Block', auflagen: [500], erstelltAm: HEUTE },
    );
    const bohren = (v.eingabe['zeilen'] as Zeile[]).find(
      (z) => z.art === 'arbeitsgang' && z.schrittId === 'S0014',
    );
    expect(bohren?.art === 'arbeitsgang' ? bohren.profil : undefined).toBe('Hang 4-fach');
    expect(v.hinweise.some((h) => h.includes('auch möglich: Nagel 4-fach'))).toBe(true);
  });
});

describe('Bogen vom Lieferanten, Verarbeitung im Haus (T125)', () => {
  function block(): Artikel {
    const a = produkt([{ name: 'Rillen', wert: '1 Rille' }]);
    const teil = a.teile[0];
    if (!teil) throw new Error('Teil');
    a.teile[0] = {
      ...teil,
      jeProdukt: 25,
      wer: { zustand: 'fest', wert: 'lieferant' },
      druck: { zustand: 'fest', wert: 'ohne' },
      lieferform: { format: { breiteUm: 314_000, hoeheUm: 438_000 } },
    };
    return a;
  }

  it('Zukauf mit Bestellmenge, Schneiden im Haus, kein Material, kein Druck', () => {
    const k = anlegen(block());
    const arten = k.zeilen.map((z) =>
      z.art === 'arbeitsgang' ? z.schrittId : z.art === 'zukauf' ? `zukauf:${z.teilId}` : z.art,
    );
    expect(arten).toContain('zukauf:T1');
    expect(arten).not.toContain('material');
    expect(arten).not.toContain('S0001');
    expect(arten).toContain('S0007');
    expect(k.teile?.[0]).toMatchObject({
      geliefert: true,
      druckbogen: { breiteUm: 314_000, hoeheUm: 438_000 },
    });
    const e = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, HEUTE).auflagen[0];
    const zukauf = e?.zeilen.find(
      (z) => z.zeileId === k.zeilen.find((x) => x.art === 'zukauf')?.id,
    );
    // 500 × 25 Blatt A5 ÷ 4 je Bogen = 3.125 Bogen (+ Zuschuss der Schritte im Haus)
    expect(zukauf?.einheit).toBe('Bogen');
    expect((zukauf?.menge ?? 0) >= 3_125).toBe(true);
    expect(zukauf?.rechenweg.join(' ')).toMatch(
      /Bestellmenge für Flyer: [\d.]+ Bogen 314 × 438 mm \(4 Nutzen je Bogen/,
    );
  });

  it('ohne Lieferform: Lieferant liefert fertig wie bisher', () => {
    const a = block();
    const teil = a.teile[0];
    if (!teil) throw new Error('Teil');
    delete teil.lieferform;
    const k = anlegen(a);
    expect(k.zeilen.map((z) => z.art)).toEqual(['zukauf', ...k.zeilen.slice(1).map((z) => z.art)]);
    expect(k.zeilen.some((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0007')).toBe(false);
  });
});

describe('Variante mit Faktor und Marken (T129)', () => {
  function mitVarianten() {
    const p = kopie(BEISPIEL_PRODUKTION);
    const platz = (p.arbeitsplaetze ?? []).find((x) =>
      x.schritte.some((s) => s.schrittId === 'S0014'),
    );
    const schritt = platz?.schritte.find((s) => s.schrittId === 'S0014');
    if (!platz || !schritt) throw new Error('Bohren');
    p.arbeitsplaetze = (p.arbeitsplaetze ?? []).map((x) =>
      x.id === platz.id ? x : { ...x, schritte: x.schritte.filter((s) => s.schrittId !== 'S0014') },
    );
    schritt.profile = [
      { name: 'Hang 4-fach', angaben: ['4-fach'], standard: true },
      { name: 'Nagel 4-fach', angaben: ['4-fach'], faktor: 2 },
    ];
    return p;
  }

  it('Variante setzen bringt ihren Faktor mit, zurück entfernt ihn', () => {
    const p = mitVarianten();
    const v = kalkulationAusProdukt(
      produkt([{ name: 'Bohren', wert: '4-fach' }]),
      p,
      BEISPIEL_LAGER,
      {
        titel: 'Block',
        auflagen: [500],
        erstelltAm: HEUTE,
      },
    );
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const bohren = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0014');
    if (bohren?.art !== 'arbeitsgang') throw new Error('Bohren');
    const nagel = zeileMitVariante(k, bohren.id, p, 'Nagel 4-fach');
    const zn = nagel.zeilen.find((z) => z.id === bohren.id);
    expect(zn?.art === 'arbeitsgang' && 'faktor' in zn.menge ? zn.menge.faktor : undefined).toBe(2);
    const hang = zeileMitVariante(nagel, bohren.id, p, 'Hang 4-fach');
    const zh = hang.zeilen.find((z) => z.id === bohren.id);
    expect(zh?.art === 'arbeitsgang' && 'faktor' in zh.menge ? zh.menge.faktor : undefined).toBe(
      undefined,
    );
    const e1 = rechneKalkulation(k, p, BEISPIEL_LAGER, HEUTE).auflagen[0];
    const e2 = rechneKalkulation(nagel, p, BEISPIEL_LAGER, HEUTE).auflagen[0];
    const i = k.zeilen.indexOf(bohren);
    expect((e2?.zeilen[i]?.menge ?? 0) === 2 * (e1?.zeilen[i]?.menge ?? 0)).toBe(true);
  });

  it('Formular ohne Marke: Vorschlag bleibt, als geändert markiert', () => {
    const k = anlegen();
    const z = k.zeilen[0];
    if (!z) throw new Error('z');
    const ohne = { ...z } as Record<string, unknown>;
    delete ohne['vorschlag'];
    const neu = geaenderteMarkieren(k, { ...k, zeilen: [ohne, ...k.zeilen.slice(1)] });
    expect((neu['zeilen'] as Zeile[])[0]).toMatchObject({ vorschlag: true, geaendert: true });
  });
});

describe('Geliefertes Teil ohne Endformat (T152)', () => {
  it('Zukauf-Zeile ohne Teilbezug, Weg bleibt gültig', () => {
    const a: Artikel = {
      id: 'A-9',
      titel: 'Block',
      einheit: 'Stueck',
      endformat: {
        zustand: 'waehlbar',
        werte: [
          { breiteUm: 148_000, hoeheUm: 210_000 },
          { breiteUm: 210_000, hoeheUm: 297_000 },
        ],
      },
      teile: [
        {
          ...neuesProduktTeil(1),
          wer: { zustand: 'fest', wert: 'lieferant' },
          lieferform: { format: { breiteUm: 314_000, hoeheUm: 438_000 } },
        },
      ],
    };
    const v = kalkulationAusProdukt(a, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
      titel: 'Block',
      auflagen: [100],
      erstelltAm: '2026-11-12',
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const zukauf = r.wert.kalkulationen[0]?.zeilen.find((z) => z.art === 'zukauf');
    expect(zukauf !== undefined && 'teilId' in zukauf).toBe(false);
  });
});

describe('Menge von Hand (T154)', () => {
  it('ersetzt die berechnete Menge, die berechnete bleibt im Rechenweg', () => {
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Schneiden von Hand',
      einheit: 'Stueck',
      auflagen: [500],
      erstelltAm: '2026-11-12',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-SCHN',
          schrittId: 'S0006',
          menge: { art: 'auflage' },
          handwerte: { menge: 2 },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const z = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-11-12').auflagen[0]
      ?.zeilen[0];
    expect(z?.menge).toBe(2);
    expect(z?.rechenweg.join(' ')).toContain('Menge von Hand: 2');
    expect(z?.rechenweg.join(' ')).toContain('(berechnet: 500)');
  });
});

describe('Stanzform am Artikel (T155)', () => {
  it('Vorschlag setzt die Form des Teils am Schritt mit Werkzeug; zurück an den Artikel', () => {
    const formId = (BEISPIEL_LAGER.stanzformen ?? [])[0]?.id ?? 'F0001';
    const a: Artikel = {
      id: 'A-9',
      titel: 'Karte gestanzt',
      einheit: 'Stueck',
      endformat: { zustand: 'fest', wert: { breiteUm: 85_000, hoeheUm: 55_000 } },
      teile: [
        {
          ...neuesProduktTeil(1),
          woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'L1' } },
          merkmale: [{ name: 'Stanzen', wert: { zustand: 'fest', wert: 'ja' } }],
          stanzformId: formId,
        },
      ],
    };
    const v = kalkulationAusProdukt(a, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, {
      titel: 'Karte',
      auflagen: [500],
      erstelltAm: '2026-11-12',
    });
    const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const stanzen = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId === 'S0009');
    expect(stanzen?.art === 'arbeitsgang' ? stanzen.stanzformId : null).toBe(formId);
    const druck = k.zeilen.find((z) => z.art === 'arbeitsgang' && z.schrittId !== 'S0009');
    expect(druck?.art === 'arbeitsgang' ? druck.stanzformId : null).toBeUndefined();
    expect(produktAusKalkulation(k).teile[0]?.stanzformId).toBe(formId);
  });
});

describe('Wartezeit je Tätigkeit (T156)', () => {
  it('steht im Ergebnis und Rechenweg, ändert die Kosten nicht', () => {
    const mitWarten = {
      ...BEISPIEL_PRODUKTION,
      arbeitsplaetze: (BEISPIEL_PRODUKTION.arbeitsplaetze ?? []).map((p) =>
        p.id === 'AP-SCHN'
          ? {
              ...p,
              schritte: p.schritte.map((s) =>
                s.schrittId === 'S0006' ? { ...s, wartezeitMs: 1_800_000 } : s,
              ),
            }
          : p,
      ),
    };
    const r = kalkulationHinzufuegen(leereKalkulationen(), {
      titel: 'Warten',
      einheit: 'Stueck',
      auflagen: [500],
      erstelltAm: '2026-11-12',
      zeilen: [
        {
          id: 'Z1',
          art: 'arbeitsgang',
          platzId: 'AP-SCHN',
          schrittId: 'S0006',
          menge: { art: 'auflage' },
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const k = r.wert.kalkulationen[0];
    if (!k) throw new Error('k');
    const ohne = rechneKalkulation(k, BEISPIEL_PRODUKTION, BEISPIEL_LAGER, '2026-11-12').auflagen[0]
      ?.zeilen[0];
    const mit = rechneKalkulation(k, mitWarten, BEISPIEL_LAGER, '2026-11-12').auflagen[0]
      ?.zeilen[0];
    expect(mit?.werte?.art === 'arbeitsgang' ? mit.werte.wartezeitMs : null).toBe(1_800_000);
    expect(mit?.rechenweg.join(' ')).toContain('Danach warten: 30 min');
    expect(mit?.kostenVoll?.zehntelcent).toBe(ohne?.kostenVoll?.zehntelcent);
  });
});
