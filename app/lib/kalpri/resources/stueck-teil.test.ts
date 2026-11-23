import { describe, expect, it } from 'vitest';
import {
  BEISPIEL_LAGER,
  BEISPIEL_PRODUKTION,
  istStueckTeil,
  kalkulationAusArtikel,
  kalkulationBeschreibung,
  kalkulationHinzufuegen,
  artikelAusKalkulation,
  leereKalkulationen,
  preisHinzufuegen,
  pruefeArtikelbestand,
  pruefeKalkulationen,
  rechneKalkulation,
  type Artikel,
  type ArtikelTeil,
  type Kalkulation,
  type Lager,
  type Material,
  type Produktion,
} from './index';

// T101: Teile je Stück – Ware vom Kunden gestellt oder Material als Stück (Kuvert)

const HEUTE = '2026-11-08';
const mm = (b: number, h: number) => ({ breiteUm: b * 1000, hoeheUm: h * 1000 });
const VIER_NULL = { vorne: { farbe: 'farbig' as const } };
const EINS_NULL = { vorne: { farbe: 'schwarz' as const } };

/** Beispiel-Produktion, Objektdruck (Stück) mit „im Weg: bei jedem bedruckten Teil“. */
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function produktion(): Produktion {
  const p = kopie(BEISPIEL_PRODUKTION);
  const obj = p.arbeitsschritte.find((s) => s.id === 'S0002');
  if (!obj) throw new Error('S0002');
  obj.imWeg = { art: 'druck' };
  return p;
}

const KUVERT: Material = {
  id: 'M-C65',
  form: 'Stueck',
  sorte: 'Kuvert C6/5 ohne Fenster',
  kategorie: 'kuvert',
  grammatur: 80,
  breiteUm: 229_000,
  hoeheUm: 114_000,
} as Material;

function lager(): Lager {
  const l: Lager = { ...BEISPIEL_LAGER, materialien: [...BEISPIEL_LAGER.materialien, KUVERT] };
  const r = preisHinzufuegen(l, {
    materialId: 'M-C65',
    lieferant: 'Großhandel',
    basis: 'je1000',
    betragZehntelcent: 30_000,
    gueltigAb: '2026-01-01',
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.wert;
}

function teil(extra: Partial<ArtikelTeil>): ArtikelTeil {
  return {
    id: 'T1',
    name: 'Tüte',
    jeProdukt: 1,
    woraus: { zustand: 'fest', wert: { art: 'beschrieben', text: 'Bäckertüte Kraft' } },
    druck: { zustand: 'fest', wert: EINS_NULL },
    wer: { zustand: 'fest', wert: 'haus' },
    ...extra,
  };
}

function artikel(t: ArtikelTeil, endformat = mm(150, 340)): Artikel {
  const a: Artikel = {
    id: 'A-0101',
    titel: 'Bäckertüte bedruckt',
    einheit: 'Stueck',
    endformat: { zustand: 'fest', wert: endformat },
    teile: [t],
  };
  const r = pruefeArtikelbestand({ version: 1, artikel: [a] });
  expect(r.ok).toBe(true);
  return a;
}

function anlegen(a: Artikel, auflagen: number[], p = produktion(), l = lager()) {
  const v = kalkulationAusArtikel(a, p, l, { auflagen, erstelltAm: HEUTE });
  const r = kalkulationHinzufuegen(leereKalkulationen(), v.eingabe);
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  const k = r.wert.kalkulationen[0] as Kalkulation;
  return { v, k, e: rechneKalkulation(k, p, l, HEUTE) };
}

const GESTELLT = teil({ wareGestellt: true, wareText: 'Bäckertüte Kraft 150 × 340' });

describe('T101 Schema: Ware gestellt', () => {
  it('Artikel-Teil und Kalkulations-Teil nehmen wareGestellt und wareText', () => {
    expect(pruefeArtikelbestand({ version: 1, artikel: [artikel(GESTELLT)] }).ok).toBe(true);
    const k = anlegen(artikel(GESTELLT), [1000]).k;
    expect(pruefeKalkulationen({ version: 1, kalkulationen: [k] }).ok).toBe(true);
  });

  it('wareGestellt muss ja oder nein sein', () => {
    const a = artikel(teil({}));
    const kaputt = { ...a, teile: [{ ...a.teile[0], wareGestellt: 'ja' }] };
    const r = pruefeArtikelbestand({ version: 1, artikel: [kaputt] });
    expect(r.ok).toBe(false);
  });

  it('istStueckTeil: gestellt oder Material Stück', () => {
    expect(istStueckTeil({ wareGestellt: true }, undefined)).toBe(true);
    expect(istStueckTeil({}, { form: 'Stueck' })).toBe(true);
    expect(istStueckTeil({}, { form: 'Bogen' })).toBe(false);
    expect(istStueckTeil({}, undefined)).toBe(false);
  });
});

describe('T101 Aus Artikel: Stück-Teile gehen in den Objektdruck', () => {
  it('Ware gestellt: Objektdruck je Stück, kein Material, kein Schneiden', () => {
    const { v, k } = anlegen(artikel(GESTELLT), [1000]);
    const teil = k.teile?.[0];
    expect(teil?.wareGestellt).toBe(true);
    expect(teil?.wareText).toBe('Bäckertüte Kraft 150 × 340');
    expect(teil?.materialId).toBeUndefined();
    expect(k.zeilen.filter((z) => z.art === 'material')).toHaveLength(0);
    const gaenge = k.zeilen.filter((z) => z.art === 'arbeitsgang');
    expect(gaenge.map((z) => z.schrittId)).toEqual(['S0002']);
    expect(gaenge[0]?.druck).toEqual(EINS_NULL);
    expect(v.hinweise.some((h) => h.includes('kein Lagermaterial'))).toBe(false);
  });

  it('Kuvert aus dem Lager (Stück): Material + Objektdruck, kein Digitaldruck, kein Schneiden', () => {
    const t = teil({
      name: 'Kuvert',
      woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'M-C65' } },
      druck: { zustand: 'fest', wert: VIER_NULL },
    });
    const { k } = anlegen(artikel(t, mm(229, 114)), [500]);
    expect(k.teile?.[0]?.materialId).toBe('M-C65');
    expect(k.zeilen.map((z) => (z.art === 'arbeitsgang' ? z.schrittId : z.art))).toEqual([
      'material',
      'S0002',
    ]);
  });

  it('Teil auf Bogen bekommt keinen Objektdruck', () => {
    const t = teil({
      name: 'Flyer',
      woraus: {
        zustand: 'fest',
        wert: { art: 'sorte', sorte: 'Bilderdruck matt', grammatur: 135 },
      },
    });
    const { k } = anlegen(artikel(t, mm(148, 210)), [500]);
    const schritte = k.zeilen.flatMap((z) => (z.art === 'arbeitsgang' ? [z.schrittId] : []));
    expect(schritte).not.toContain('S0002');
    expect(schritte).toContain('S0001');
  });

  it('ohne Objektdruck im Katalog: klarer Hinweis, kein Digitaldruck', () => {
    const { v, k } = anlegen(artikel(GESTELLT), [1000], kopie(BEISPIEL_PRODUKTION));
    expect(k.zeilen.filter((z) => z.art === 'arbeitsgang')).toHaveLength(0);
    expect(v.hinweise.some((h) => h.includes('wird je Stück gedruckt'))).toBe(true);
  });
});

describe('T101 Rechnen je Stück', () => {
  it('Ware gestellt: Menge = Auflage + Zuschuss, Anliefermenge im Rechenweg, vollständig', () => {
    const { e } = anlegen(artikel(GESTELLT), [1000]);
    const au = e.auflagen[0];
    expect(au?.vollstaendig).toBe(true);
    // Objektdruck am Inkjet: Zuschuss 2 % + 10 = 30
    const druck = au?.zeilen.find((z) => z.zeileId === 'Z1');
    expect(druck?.menge).toBe(1000);
    const weg = au?.papierwege[0]?.papierweg;
    expect(weg?.druckbogen).toBe(1030);
    expect(weg?.zuschuss).toBe(30);
    expect(weg?.schnitteEndschnitt).toBeNull();
    expect(weg?.rohbogen).toBeNull();
    expect(weg?.stueck).toBe('gestellt');
    expect(weg?.rechenweg).toContain(
      'Ware vom Kunden: 1030 Stück anliefern lassen (Bäckertüte Kraft 150 × 340)',
    );
    expect(JSON.stringify(e)).not.toContain('Druckbogen-Format fehlt');
  });

  it('Kuvert aus dem Lager: 1030 Stück zu 30 € je 1000', () => {
    const t = teil({
      name: 'Kuvert',
      woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'M-C65' } },
      druck: { zustand: 'fest', wert: VIER_NULL },
    });
    const { e } = anlegen(artikel(t, mm(229, 114)), [1000]);
    const au = e.auflagen[0];
    expect(au?.vollstaendig).toBe(true);
    const material = au?.zeilen.find((z) => z.zeileId === 'Z1');
    expect(material?.menge).toBe(1030);
    expect(material?.kostenVoll?.zehntelcent).toBe(30_900);
    expect(JSON.stringify(e)).not.toContain('passt nicht auf den Druckbogen');
  });

  it('Stück-Material schlägt keinen Druckbogen und kein Vorschneiden vor', () => {
    const t = teil({
      name: 'Kuvert',
      woraus: { zustand: 'fest', wert: { art: 'material', materialId: 'M-C65' } },
      druck: { zustand: 'fest', wert: VIER_NULL },
    });
    const { e } = anlegen(artikel(t, mm(229, 114)), [500]);
    const text = JSON.stringify(e);
    expect(text).not.toContain('Druckbogen automatisch');
    expect(text).not.toContain('Vorschneiden fehlt');
  });
});

describe('T101 Beschreibung und zurück zum Artikel', () => {
  it('Beschreibung nennt die gestellte Ware statt Papier', () => {
    const { k } = anlegen(artikel(GESTELLT), [1000]);
    expect(kalkulationBeschreibung(k, produktion(), lager())).toBe(
      'Bäckertüte bedruckt · Format 150 × 340 mm · 1/0 auf Ware vom Kunden gestellt (Bäckertüte Kraft 150 × 340)',
    );
  });

  it('Kalkulation → Artikel behält „Ware gestellt“ und meldet kein fehlendes Papier', () => {
    const { k } = anlegen(artikel(GESTELLT), [1000]);
    const r = artikelAusKalkulation({ ...k, artikelId: 'A-9999' }, produktion(), lager(), {
      version: 1,
      artikel: [],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.fehler));
    const t = r.wert.artikel.teile[0];
    expect(t?.wareGestellt).toBe(true);
    expect(t?.wareText).toBe('Bäckertüte Kraft 150 × 340');
    expect(r.wert.hinweise.some((h) => h.includes('Papier fehlt'))).toBe(false);
  });
});
