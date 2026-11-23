import {
  berechneAusschiessPlan,
  berechneRollenPlan,
  berechneRaster,
  besteLage,
  rasterEingabe,
  schnitteFuerLage,
  type AusschiessPlan,
  type AusschiessSchema,
  type Lage,
  type RollenPlan,
  type Schnitte as LayoutSchnitte,
} from '@druck/layout-core';
import { effektiveDicke } from './eigenschaften';
import type { Format, Kalkulation, Teil } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import type { Material } from './material';
import type { RollenVorschlag } from './rollen-vorschlag';

/** Standard-Beschnitt je Seite um jeden Nutzen: 3 mm. */
export const STANDARD_BESCHNITT_UM = 3000;

/** Anordnung gleich großer Stücke auf einer Fläche (= `Lage` aus `layout-core`, T89). */
export type Raster = Lage;

/**
 * Angaben der Druckmaschine für den Papierweg (später aus dem Druck-Arbeitsgang):
 * nicht bedruckbarer Rand je Seite und Zuschuss (fest + %), aufgerundet; dazu das
 * Ausschießschema des Teils (fehlt: automatisch).
 */
export type DruckAngaben = {
  randUm?: number;
  /** Abstand zwischen den Nutzen auf der Rolle (T105). */
  abstandUm?: number;
  zuschussFest?: number;
  zuschussProzent?: number;
  schema?: AusschiessSchema;
};

export type NutzenErgebnis =
  | {
      ok: true;
      raster: Raster;
      /** true: Abstand zwischen den Nutzen (Steg) > 0 → je Zwischenraum zwei Schnitte. */
      doppelschnitt: boolean;
      warnungen: string[];
    }
  | { ok: false; meldung: string };

/**
 * Nutzen auf dem Druckbogen aus dem Ausschießen (`layout-core`, der Ausschießplan ist die einzige
 * Wahrheit): Bogen − Rand der Maschine (bzw. größere Ränder des Schemas), Endformat bzw. offenes
 * Format, Beschnitt, Steg (ohne Schema 2 × Beschnitt), Drehung, festes Raster des Schemas.
 */
export function nutzenAusschiessen(e: {
  bogen: Format;
  nutzenFormat: Format;
  beschnittUm: number;
  randUm: number;
  schema?: AusschiessSchema | undefined;
}): NutzenErgebnis {
  const eingabe = rasterEingabe({
    bogen: e.bogen,
    endformat: e.nutzenFormat,
    beschnittUm: e.beschnittUm,
    randUm: e.randUm,
    schema: e.schema,
  });
  const r = berechneRaster(eingabe);
  if (!r.ok) return { ok: false, meldung: r.fehler.map((f) => f.meldung).join('; ') };
  return {
    ok: true,
    raster: {
      spalten: r.wert.spalten,
      zeilen: r.wert.zeilen,
      gedreht: r.wert.gedreht,
      anzahl: r.wert.nutzen,
    },
    doppelschnitt: eingabe.steg.xUm > 0 || eingabe.steg.yUm > 0,
    warnungen: r.wert.warnungen,
  };
}

/** Schnitte an der Schneidemaschine: jeder Stapel einzeln oder Hälften/Streifen aufeinander. */
export type Schnitte = LayoutSchnitte;

export type PapierwegErgebnis = {
  teilId: string;
  auflage: number;
  /** Druckbogen-Format (fehlt am Teil → Rohbogen-Format); null = unbekannt. */
  druckbogenFormat: Format | null;
  rohbogenFormat: Format | null;
  nutzenJeBogen: number | null;
  nutzenHerkunft: 'berechnet' | 'hand' | null;
  /** Raster der Nutzen auf dem Druckbogen (nur, wenn berechnet). */
  nutzenRaster: Raster | null;
  /** Druckbogen ohne Zuschuss: aufrunden(Auflage × jeProdukt ÷ Nutzen). */
  druckbogenNetto: number | null;
  zuschuss: number;
  /** Druckbogen inkl. Zuschuss. */
  druckbogen: number | null;
  /** Druckbogen je Rohbogen (beste Lage); 1, wenn auf dem Rohbogen gedruckt wird. */
  druckbogenJeRohbogen: number | null;
  rohRaster: Raster | null;
  rohbogen: number | null;
  /** Druckbogen, die aus den Rohbogen entstehen (≥ druckbogen). */
  druckbogenAusRoh: number | null;
  /** Schnitte je Stapel beim Vorschneiden; 0, wenn nicht vorgeschnitten wird. */
  schnitteVorschneiden: Schnitte | null;
  /** Schnitte je Stapel beim Endschnitt an der Schneidemaschine (Nutzen mit Rand). */
  schnitteEndschnitt: Schnitte | null;
  /** Dicke eines Bogens in µm; null = unbekannt. */
  dickeUm: number | null;
  /** Stapelhöhe aller Druckbogen in µm. */
  stapelhoeheUm: number | null;
  /** Anteil der Nutzen (offenes Format bzw. Endformat) an der Druckbogenfläche in ganzen Prozent. */
  papierGenutztProzent: number | null;
  rechenweg: string[];
  hinweise: string[];
  /** Ausschießplan (Bogen) aus `layout-core`, aus dem die Mengen stammen (T89); fehlt bei Rolle. */
  plan?: AusschiessPlan;
  /** Stück-Teil (T101): je Stück gedruckt; „gestellt“ = Ware vom Kunden (Druckbogen = Stück). */
  stueck?: 'gestellt' | 'material';
  /** Rollenplan aus `layout-core`, aus dem die Mengen stammen (T92); nur bei Rolle. */
  rollenPlan?: RollenPlan;
  /** Andere Rollenbreiten derselben Sorte (T105), mit Verbrauch und Kosten. */
  rollenVorschlag?: RollenVorschlag[];
};

const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** 325000 µm → "32,5"; Bogen in cm wie in der Druckerei üblich. */
function cm(um: number): string {
  return ZAHL.format(um / 10_000);
}

/** 85000 µm → "85". */
function mm(um: number): string {
  return ZAHL.format(um / 1000);
}

export function formatBogen(f: Format): string {
  return `${cm(f.breiteUm)} × ${cm(f.hoeheUm)} cm`;
}

export function formatEndformat(f: Format): string {
  return `${mm(f.breiteUm)} × ${mm(f.hoeheUm)} mm`;
}

/**
 * Bestes Raster gleich großer Stücke auf einer Fläche, beide Lagen probiert (T89: aus dem
 * Ausschießkern, `besteLage`). Bei gleicher Anzahl gewinnt die ungedrehte Lage.
 */
export function bestesRaster(flaeche: Format, stueck: Format): Raster {
  return besteLage(flaeche, stueck);
}

/** Schnitte für ein Raster an der Schneidemaschine (T89: aus dem Ausschießkern, `schnitteFuerLage`). */
export function schnitteFuerRaster(r: Raster, doppelschnitt: boolean, rand: boolean): Schnitte {
  return schnitteFuerLage(r, doppelschnitt, rand);
}

/**
 * Stück-Teil (T101): Ware vom Kunden gestellt oder Material als Stück (z. B. Kuvert) – gedruckt
 * wird je Stück (Objektdruck), ohne Druckbogen, Nutzen und Schneiden.
 */
export function istStueckTeil(
  teil: Pick<Teil, 'wareGestellt'>,
  material: Pick<Material, 'form'> | undefined,
): boolean {
  return teil.wareGestellt === true || material?.form === 'Stueck';
}

/**
 * Papierweg je Stück (T101): Stück = Auflage × je Produkt + Zuschuss (in den Feldern des
 * Druckbogens, 1 Nutzen, Format = Teil); Material-Stück = gleiche Menge, bei gestellter Ware kein
 * Material, dafür die Anliefermenge im Rechenweg.
 */
function stueckweg(
  e: PapierwegErgebnis,
  teil: Teil,
  material: Material | undefined,
  auflage: number,
  druckAngaben: DruckAngaben,
): PapierwegErgebnis {
  const format = teil.offenesFormat ?? teil.endformat;
  const netto = auflage * teil.jeProdukt;
  const prozent = druckAngaben.zuschussProzent ?? 0;
  const fest = druckAngaben.zuschussFest ?? 0;
  const zuschuss = Math.ceil(Math.round(((netto * prozent) / 100) * 1e6) / 1e6) + fest;
  const brutto = netto + zuschuss;
  e.druckbogenFormat = format;
  e.nutzenJeBogen = 1;
  e.nutzenHerkunft = 'berechnet';
  e.druckbogenNetto = netto;
  e.zuschuss = zuschuss;
  e.druckbogen = brutto;
  e.druckbogenJeRohbogen = 1;
  e.druckbogenAusRoh = brutto;
  const gestellt = teil.wareGestellt === true;
  e.stueck = gestellt ? 'gestellt' : 'material';
  if (material !== undefined && !gestellt) {
    e.rohbogenFormat = format;
    e.rohbogen = brutto;
  }
  if (gestellt && teil.materialId !== undefined) {
    e.hinweise.push('Ware gestellt – das Material des Teils wird nicht gerechnet');
  }
  e.rechenweg.push(
    `Stück: ${auflage} × ${teil.jeProdukt} = ${netto}` +
      (zuschuss > 0 ? ` + Zuschuss ${zuschuss} = ${brutto}` : '') +
      ' (je Stück gedruckt, kein Druckbogen, kein Schneiden)',
  );
  if (gestellt) {
    const was = teil.wareText?.trim();
    e.rechenweg.push(`Ware vom Kunden: ${brutto} Stück anliefern lassen${was ? ` (${was})` : ''}`);
  }
  return e;
}

function formatAus(m: Material | undefined): Format | null {
  if (!m || m.form === 'Rolle' || m.form === 'Menge') return null;
  return { breiteUm: m.breiteUm, hoeheUm: m.hoeheUm };
}

/**
 * Papierweg eines Teils für eine Auflage: Nutzen je Druckbogen (von Hand oder aus offenem
 * Format bzw. Endformat + 2 × Beschnitt auf Druckbogen − 2 × Rand), Druckbogen + Zuschuss, Druckbogen je Rohbogen,
 * Rohbogen, Schnitte (Vorschneiden ohne Randschnitte, Endschnitt mit Randschnitten),
 * Rand und Zuschuss aus den Angaben der Druckmaschine,
 * Stapelhöhe und genutztes Papier. Fehlendes wird als Hinweis gemeldet, nicht als Fehler.
 */
export function rechnePapierweg(
  teil: Teil,
  material: Material | undefined,
  auflage: number,
  druckAngaben: DruckAngaben = {},
): PapierwegErgebnis {
  const e: PapierwegErgebnis = {
    teilId: teil.id,
    auflage,
    druckbogenFormat: null,
    rohbogenFormat: null,
    nutzenJeBogen: null,
    nutzenHerkunft: null,
    nutzenRaster: null,
    druckbogenNetto: null,
    zuschuss: 0,
    druckbogen: null,
    druckbogenJeRohbogen: null,
    rohRaster: null,
    rohbogen: null,
    druckbogenAusRoh: null,
    schnitteVorschneiden: null,
    schnitteEndschnitt: null,
    dickeUm: null,
    stapelhoeheUm: null,
    papierGenutztProzent: null,
    rechenweg: [],
    hinweise: [],
  };

  if (teil.materialId !== undefined && material === undefined) {
    e.hinweise.push(`Material ${teil.materialId} nicht im Lager`);
  }
  if (istStueckTeil(teil, material)) {
    return stueckweg(e, teil, material, auflage, druckAngaben);
  }
  if (material?.form === 'Rolle') {
    return rollenweg(e, teil, material, auflage, druckAngaben);
  }
  // T125: geliefert – die Bogen des Lieferanten sind Roh- und Druckbogen zugleich
  const roh =
    teil.geliefert === true && teil.druckbogen !== undefined
      ? teil.druckbogen
      : formatAus(material);
  const druck = teil.druckbogen ?? roh;

  // Nutzen je Druckbogen (offenes Format, wenn angegeben)
  const nutzenFormat = teil.offenesFormat ?? teil.endformat;
  const nutzenText = teil.offenesFormat
    ? `offen ${formatEndformat(teil.offenesFormat)}`
    : formatEndformat(teil.endformat);
  const schema = druckAngaben.schema;
  const beschnitt = schema?.beschnittUm ?? teil.beschnittUm ?? STANDARD_BESCHNITT_UM;
  const rand = druckAngaben.randUm ?? 0;

  // T89: das Mengengerüst kommt ausschließlich aus dem Ausschießplan (layout-core)
  const plan = berechneAusschiessPlan({
    druckbogen: druck,
    rohbogen: roh,
    aufRohbogen: teil.druckbogen === undefined,
    nutzenFormat,
    beschnittUm: beschnitt,
    randUm: rand,
    schema,
    nutzenVonHand: teil.nutzenJeBogen,
    exemplare: auflage * teil.jeProdukt,
    zuschussFest: druckAngaben.zuschussFest,
    zuschussProzent: druckAngaben.zuschussProzent,
  });
  e.plan = plan;
  e.rohbogenFormat = plan.rohbogenFormat;
  e.druckbogenFormat = plan.druckbogenFormat;
  e.nutzenJeBogen = plan.nutzenJeBogen;
  e.nutzenHerkunft = plan.nutzenHerkunft;
  e.nutzenRaster = plan.nutzenLage;
  e.druckbogenNetto = plan.druckbogenNetto;
  e.zuschuss = plan.zuschuss;
  e.druckbogen = plan.druckbogen;
  e.druckbogenJeRohbogen = plan.druckbogenJeRohbogen;
  e.rohRaster = plan.rohLage;
  e.rohbogen = plan.rohbogen;
  e.druckbogenAusRoh = plan.druckbogenAusRoh;
  e.schnitteVorschneiden = plan.schnitteVorschneiden;
  e.schnitteEndschnitt = plan.schnitteEndschnitt;
  e.papierGenutztProzent = plan.papierGenutztProzent;

  // Rechenweg und Hinweise zum Plan
  if (plan.nutzenHerkunft === 'hand') {
    e.rechenweg.push(`Nutzen je Druckbogen: ${teil.nutzenJeBogen} (von Hand)`);
  } else if (druck === null) {
    e.hinweise.push('Druckbogen-Format fehlt – Nutzen nicht berechnet');
  } else {
    if (plan.nutzenFehler !== null) {
      e.hinweise.push(
        `${teil.offenesFormat ? 'Offenes Format' : 'Endformat'} ${formatEndformat(nutzenFormat)}` +
          ` passt nicht auf den Druckbogen ${formatBogen(druck)}` +
          (schema ? ` (Schema „${schema.name}“: ${plan.nutzenFehler})` : ''),
      );
    } else if (plan.nutzenLage !== null) {
      const r = plan.nutzenLage;
      e.hinweise.push(...plan.warnungen);
      e.rechenweg.push(
        `Nutzen: ${nutzenText} + ${mm(beschnitt)} mm Beschnitt` +
          `${rand > 0 ? `, Rand ${mm(rand)} mm` : ''} auf ${formatBogen(druck)}` +
          ` → ${r.spalten} × ${r.zeilen}${r.gedreht ? ' (gedreht)' : ''} = ${r.anzahl}` +
          (schema ? ` (Schema „${schema.name}“)` : ''),
      );
    }
    if (
      schema?.endformat &&
      !(
        (schema.endformat.breiteUm === nutzenFormat.breiteUm &&
          schema.endformat.hoeheUm === nutzenFormat.hoeheUm) ||
        (schema.endformat.breiteUm === nutzenFormat.hoeheUm &&
          schema.endformat.hoeheUm === nutzenFormat.breiteUm)
      )
    ) {
      e.hinweise.push(
        `Schema „${schema.name}“ ist für ${formatEndformat(schema.endformat)}, das Teil hat ${formatEndformat(nutzenFormat)}`,
      );
    }
  }
  if (plan.druckbogen !== null && plan.druckbogenNetto !== null) {
    const prozent = druckAngaben.zuschussProzent ?? 0;
    const fest = druckAngaben.zuschussFest ?? 0;
    e.rechenweg.push(
      `Druckbogen: ${auflage} × ${teil.jeProdukt} ÷ ${plan.nutzenJeBogen} = ${plan.druckbogenNetto}` +
        (plan.zuschuss > 0
          ? ` + Zuschuss ${plan.zuschuss}` +
            (prozent > 0 ? ` (${ZAHL.format(prozent)} % + ${fest})` : '') +
            ` = ${plan.druckbogen}`
          : ''),
    );
  }
  if (roh !== null && druck !== null) {
    if (plan.rohPasstNicht) {
      e.hinweise.push(
        `Druckbogen ${formatBogen(druck)} passt nicht in den Rohbogen ${formatBogen(roh)}`,
      );
    }
    if (plan.rohbogen !== null && plan.druckbogenJeRohbogen !== null) {
      e.rechenweg.push(
        plan.druckbogenJeRohbogen === 1
          ? `Rohbogen ${formatBogen(roh)}: ${plan.rohbogen} (gedruckt wird auf dem Rohbogen)`
          : `Rohbogen ${formatBogen(roh)}: ${plan.druckbogen} ÷ ${plan.druckbogenJeRohbogen} = ` +
              `${plan.rohbogen} → ${plan.druckbogenAusRoh} Druckbogen` +
              (plan.schnitteVorschneiden
                ? `, Vorschneiden ${plan.schnitteVorschneiden.einzeln} Schnitte` +
                  ` (${plan.schnitteVorschneiden.gestapelt} gestapelt)`
                : ''),
      );
    }
  }
  if (plan.schnitteEndschnitt !== null) {
    e.rechenweg.push(
      `Endschnitt: ${plan.schnitteEndschnitt.einzeln} Schnitte je Stapel` +
        ` (${plan.schnitteEndschnitt.gestapelt}, wenn Streifen aufeinander)`,
    );
  }

  // Dicke und Stapelhöhe
  const dicke = material ? effektiveDicke(material) : undefined;
  if (dicke !== undefined) {
    e.dickeUm = dicke.um;
    if (e.druckbogen !== null) e.stapelhoeheUm = e.druckbogen * dicke.um;
  }
  return e;
}

/**
 * Papierweg auf der Rolle (Nutzer 30.10., Großformat): Nutzen (offenes Format bzw. Endformat +
 * Beschnitt) nebeneinander über die Rollenbreite − 2 × Rand der Maschine, beide Lagen probiert;
 * es gewinnt die kürzere Länge je Nutzen, bei Gleichstand ungedreht. Ein **Abschnitt** ist eine
 * Reihe: Rollenbreite × Nutzenlänge – er steht in den Feldern des Druckbogens
 * (`druckbogenFormat`, `druckbogen` = Abschnitte inkl. Zuschuss), damit m² und Laufmeter der
 * Schritte und des Materials daraus folgen. Nutzen von Hand = so viele nebeneinander, ungedreht.
 * Kein Rohbogen, kein Vorschneiden, kein Endschnitt; Druckbogen und Schema des Teils gelten nicht.
 */
function rollenweg(
  e: PapierwegErgebnis,
  teil: Teil,
  rolle: Extract<Material, { form: 'Rolle' }>,
  auflage: number,
  druckAngaben: DruckAngaben,
): PapierwegErgebnis {
  if (teil.druckbogen !== undefined) {
    e.hinweise.push('Druckbogen gilt nicht für Rollen – Abschnitte aus der Rollenbreite');
  }
  if (druckAngaben.schema !== undefined) {
    e.hinweise.push('Ausschießschema gilt nicht für Rollen – Abschnitte aus der Rollenbreite');
  }
  const nutzenFormat = teil.offenesFormat ?? teil.endformat;
  const nutzenText = teil.offenesFormat
    ? `offen ${formatEndformat(teil.offenesFormat)}`
    : formatEndformat(teil.endformat);
  const beschnitt = teil.beschnittUm ?? STANDARD_BESCHNITT_UM;
  const rand = druckAngaben.randUm ?? 0;

  // T92: das Mengengerüst kommt ausschließlich aus dem Rollenplan (layout-core)
  const plan = berechneRollenPlan({
    rollenbreiteUm: rolle.breiteUm,
    nutzenFormat,
    beschnittUm: beschnitt,
    randUm: rand,
    abstandUm: druckAngaben.abstandUm,
    nutzenVonHand: teil.nutzenJeBogen,
    exemplare: auflage * teil.jeProdukt,
    zuschussFest: druckAngaben.zuschussFest,
    zuschussProzent: druckAngaben.zuschussProzent,
  });
  e.rollenPlan = plan;
  e.nutzenHerkunft = plan.nutzenHerkunft;
  if (plan.passtNicht || plan.nutzenLage === null || plan.abschnittFormat === null) {
    e.hinweise.push(
      `${teil.offenesFormat ? 'Offenes Format' : 'Endformat'} ${formatEndformat(nutzenFormat)}` +
        ` passt nicht auf die Rolle (${cm(rolle.breiteUm)} cm breit)`,
    );
    return e;
  }
  const lage = plan.nutzenLage;
  e.druckbogenFormat = plan.abschnittFormat;
  e.nutzenJeBogen = plan.nutzenJeAbschnitt;
  e.nutzenRaster = lage;
  e.rechenweg.push(
    `Rolle ${cm(rolle.breiteUm)} cm breit: ${nutzenText} + ${mm(beschnitt)} mm Beschnitt` +
      `${rand > 0 ? `, Rand ${mm(rand)} mm` : ''}` +
      `${(druckAngaben.abstandUm ?? 0) > 0 ? `, Abstand ${mm(druckAngaben.abstandUm ?? 0)} mm` : ''}` +
      ` → ${lage.spalten} nebeneinander` +
      `${lage.gedreht ? ' (gedreht)' : ''}${plan.nutzenHerkunft === 'hand' ? ' (von Hand)' : ''},` +
      ` Abschnitt ${cm(plan.abschnittFormat.hoeheUm)} cm lang`,
  );
  e.druckbogenNetto = plan.abschnitteNetto;
  e.zuschuss = plan.zuschuss;
  e.druckbogen = plan.abschnitte;
  e.rechenweg.push(
    `Abschnitte: ${auflage} × ${teil.jeProdukt} ÷ ${lage.spalten} = ${plan.abschnitteNetto}` +
      (plan.zuschuss > 0 ? ` + Zuschuss ${plan.zuschuss} = ${plan.abschnitte}` : '') +
      ` → ${ZAHL.format(plan.laufmeter ?? 0)} Laufmeter = ${ZAHL.format(plan.quadratmeter ?? 0)} m²`,
  );
  e.papierGenutztProzent = plan.papierGenutztProzent;
  const dicke = effektiveDicke(rolle);
  if (dicke !== undefined) e.dickeUm = dicke.um;
  return e;
}

export type TeilPapierweg = { teil: Teil; auflagen: PapierwegErgebnis[] };

/** Papierwege aller Teile einer Kalkulation, je Auflage (Material aus dem Lager); Druckangaben
 *  je Teil-ID (fehlt eine, gilt: kein Rand, kein Zuschuss). */
export function rechnePapierwege(
  k: Kalkulation,
  lager: Lager,
  druckAngaben: Readonly<Record<string, DruckAngaben>> = {},
): TeilPapierweg[] {
  return (k.teile ?? []).map((teil) => {
    const material =
      teil.materialId === undefined
        ? undefined
        : lager.materialien.find((m) => m.id === teil.materialId);
    const druck = druckAngaben[teil.id] ?? {};
    return { teil, auflagen: k.auflagen.map((a) => rechnePapierweg(teil, material, a, druck)) };
  });
}

/** Passt das Format in das Höchstformat (auch um 90° gedreht)? */
export function passtInFormat(f: Format, max: Format): boolean {
  return (
    (f.breiteUm <= max.breiteUm && f.hoeheUm <= max.hoeheUm) ||
    (f.breiteUm <= max.hoeheUm && f.hoeheUm <= max.breiteUm)
  );
}

export type DruckbogenVorschlag = {
  /** Druckbogen-Format, das in die Maschine passt. */
  format: Format;
  /** Druckbogen je Rohbogen. */
  jeRohbogen: number;
  /** Nutzen je Druckbogen (offenes Format bzw. Endformat + Beschnitt, ohne Rand). */
  nutzenJeBogen: number;
  /** true: genau geteilt (kein Abfall); false: Höchstformat ausgeschnitten (Rest Abfall). */
  geteilt: boolean;
  text: string;
};

/**
 * Druckbogen, wenn der Rohbogen nicht in die Druckmaschine passt (Vorschneiden). Probiert die
 * genaue Teilung des Rohbogens (1–4 Spalten × 1–4 Zeilen) und das Höchstformat der Maschine,
 * so oft es aus dem Rohbogen geht. Gewinnt: die meisten Nutzen je Druckbogen (weniger Druckbogen,
 * Durchgänge und Klicks), dann die meisten Nutzen je Rohbogen (weniger Papier), dann die genaue
 * Teilung. null: Rohbogen passt schon, oder nichts davon trägt einen Nutzen.
 */
export function druckbogenVorschlag(
  teil: Pick<Teil, 'endformat' | 'offenesFormat' | 'beschnittUm'>,
  roh: Format,
  max: Format,
  randUm = 0,
  schema?: AusschiessSchema,
): DruckbogenVorschlag | null {
  if (passtInFormat(roh, max)) return null;
  const nutzenFormat = teil.offenesFormat ?? teil.endformat;
  const beschnittUm = schema?.beschnittUm ?? teil.beschnittUm ?? STANDARD_BESCHNITT_UM;
  const nutzenAuf = (bogen: Format) => {
    const n = nutzenAusschiessen({ bogen, nutzenFormat, beschnittUm, randUm, schema });
    return n.ok ? n.raster.anzahl : 0;
  };
  const kandidaten: Omit<DruckbogenVorschlag, 'text'>[] = [];
  for (let s = 1; s <= 4; s++) {
    for (let z = 1; z <= 4; z++) {
      if (s * z === 1) continue;
      const format = {
        breiteUm: Math.floor(roh.breiteUm / s),
        hoeheUm: Math.floor(roh.hoeheUm / z),
      };
      if (!passtInFormat(format, max)) continue;
      kandidaten.push({
        format,
        jeRohbogen: s * z,
        nutzenJeBogen: nutzenAuf(format),
        geteilt: true,
      });
    }
  }
  // Höchstformat in der Lage, in der es am häufigsten aus dem Rohbogen geht
  const hoch = bestesRaster(roh, max);
  if (hoch.anzahl > 0) {
    const format = hoch.gedreht ? { breiteUm: max.hoeheUm, hoeheUm: max.breiteUm } : max;
    kandidaten.push({
      format,
      jeRohbogen: hoch.anzahl,
      nutzenJeBogen: nutzenAuf(format),
      geteilt: false,
    });
  }
  const gut = kandidaten.filter((k) => k.nutzenJeBogen > 0);
  gut.sort(
    (a, c) =>
      c.nutzenJeBogen - a.nutzenJeBogen ||
      c.nutzenJeBogen * c.jeRohbogen - a.nutzenJeBogen * a.jeRohbogen ||
      Number(c.geteilt) - Number(a.geteilt),
  );
  // T110: großer Druckbogen zuerst – außer ein kleinerer bringt mindestens 1,5-mal so viele
  // Nutzen je Rohbogen (sonst z. B. 33 × 70 mit 4 Nutzen und 42 % Abfall statt 4 × 31,5 × 44
  // mit je 2 Nutzen aus 63 × 88)
  const jeRoh = (k: { nutzenJeBogen: number; jeRohbogen: number }) =>
    k.nutzenJeBogen * k.jeRohbogen;
  const erster = gut[0];
  const best =
    erster === undefined
      ? undefined
      : (gut.find((k) => jeRoh(k) * 2 >= jeRoh(erster) * 3) ?? erster);
  if (!best) return null;
  return {
    ...best,
    text:
      `Rohbogen ${formatBogen(roh)} passt nicht in die Maschine (höchstens ${formatBogen(max)})` +
      ` → ${best.jeRohbogen} Druckbogen ${formatBogen(best.format)} je Rohbogen` +
      `${best.geteilt ? '' : ' (Rest Abfall)'}, je ${best.nutzenJeBogen} Nutzen – wird vorgeschnitten`,
  };
}
