import type { Rechteck } from './geometrie';
import { berechneRaster, type Raster } from './raster';
import { rasterEingabe, type AusschiessSchema } from './vorlagen';

/**
 * Ausschießplan im Zustand „Schema“ (docs/konzept.md): die Mengen eines Teils für eine Auflage,
 * ohne Seiteninhalte. Er ist die einzige Quelle für Nutzen, Druckbogen, Rohbogen und Schnitte;
 * die Kalkulation (Papierweg) liest nur daraus (T88).
 */

/** Fläche in µm (Bogen, Endformat, offenes Format). */
export type Flaeche = { breiteUm: number; hoeheUm: number };

/** Anordnung gleich großer Stücke auf einer Fläche: Spalten (quer) × Zeilen (hoch). */
export type Lage = {
  spalten: number;
  zeilen: number;
  /** true: Stück um 90° gedreht gelegt. */
  gedreht: boolean;
  anzahl: number;
};

/** Schnitte an der Schneidemaschine: jeder Stapel einzeln oder Hälften/Streifen aufeinander. */
export type Schnitte = { einzeln: number; gestapelt: number };

function lageIn(flaeche: Flaeche, breite: number, hoehe: number, gedreht: boolean): Lage {
  const spalten = breite > 0 ? Math.floor(flaeche.breiteUm / breite) : 0;
  const zeilen = hoehe > 0 ? Math.floor(flaeche.hoeheUm / hoehe) : 0;
  return { spalten, zeilen, gedreht, anzahl: spalten * zeilen };
}

/**
 * Beste Lage gleich großer Stücke auf einer Fläche, beide Richtungen probiert. Bei gleicher
 * Anzahl gewinnt die ungedrehte Lage. Passt nichts → anzahl 0.
 */
export function besteLage(flaeche: Flaeche, stueck: Flaeche): Lage {
  const gerade = lageIn(flaeche, stueck.breiteUm, stueck.hoeheUm, false);
  const gedreht = lageIn(flaeche, stueck.hoeheUm, stueck.breiteUm, true);
  return gedreht.anzahl > gerade.anzahl ? gedreht : gerade;
}

/**
 * Lage der Stücke als Rechtecke, Spalte für Spalte von links oben (Ursprung 0/0), Zeile für
 * Zeile von oben. Gedreht: Breite und Höhe des Stücks getauscht.
 */
export function lagePositionen(stueck: Flaeche, lage: Lage): Rechteck[] {
  const b = lage.gedreht ? stueck.hoeheUm : stueck.breiteUm;
  const h = lage.gedreht ? stueck.breiteUm : stueck.hoeheUm;
  const positionen: Rechteck[] = [];
  for (let z = 0; z < lage.zeilen; z++) {
    for (let s = 0; s < lage.spalten; s++) {
      positionen.push({ xUm: s * b, yUm: z * h, breiteUm: b, hoeheUm: h });
    }
  }
  return positionen;
}

/**
 * Schnitte für eine Lage an der Schneidemaschine.
 * - k = 2 je Zwischenraum, wenn Nutzen mit Beschnitt (Doppelschnitt), sonst 1
 * - rand: true → zuerst rundum Randschnitte (je Richtung 2), sonst nur Trennschnitte
 * - einzeln: erst in Streifen, dann jeden Streifen für sich; gestapelt: Streifen aufeinander
 * Es zählt die günstigere Richtung (erst Spalten oder erst Zeilen).
 */
export function schnitteFuerLage(l: Lage, doppelschnitt: boolean, rand: boolean): Schnitte {
  if (l.anzahl <= 0) return { einzeln: 0, gestapelt: 0 };
  const k = doppelschnitt ? 2 : 1;
  const r0 = rand ? 2 : 0;
  const richtung = (erst: number, dann: number): Schnitte => {
    const streifen = r0 + k * (erst - 1);
    const jeStreifen = r0 + k * (dann - 1);
    return { einzeln: streifen + erst * jeStreifen, gestapelt: streifen + jeStreifen };
  };
  const a = richtung(l.spalten, l.zeilen);
  const b = richtung(l.zeilen, l.spalten);
  return {
    einzeln: Math.min(a.einzeln, b.einzeln),
    gestapelt: Math.min(a.gestapelt, b.gestapelt),
  };
}

/**
 * Schnitte beim Vorschneiden: Trennschnitte zwischen den Druckbogen und je Richtung ein
 * Abfallschnitt, wenn ein Rest bleibt (Höchstformat aus dem Rohbogen, nicht genau geteilt).
 * Geht genau auf, sind es die Schnitte der Lage ohne Randschnitte.
 */
export function vorschnitte(roh: Flaeche, druck: Flaeche, l: Lage): Schnitte {
  const b = l.gedreht ? druck.hoeheUm : druck.breiteUm;
  const h = l.gedreht ? druck.breiteUm : druck.hoeheUm;
  const restB = roh.breiteUm - l.spalten * b > 0 ? 1 : 0;
  const restH = roh.hoeheUm - l.zeilen * h > 0 ? 1 : 0;
  const richtung = (erst: number, restErst: number, dann: number, restDann: number): Schnitte => {
    const streifen = erst - 1 + restErst;
    const jeStreifen = dann - 1 + restDann;
    return { einzeln: streifen + erst * jeStreifen, gestapelt: streifen + jeStreifen };
  };
  const x = richtung(l.spalten, restB, l.zeilen, restH);
  const y = richtung(l.zeilen, restH, l.spalten, restB);
  return { einzeln: Math.min(x.einzeln, y.einzeln), gestapelt: Math.min(x.gestapelt, y.gestapelt) };
}

function gleicheFlaeche(a: Flaeche, b: Flaeche): boolean {
  return (
    (a.breiteUm === b.breiteUm && a.hoeheUm === b.hoeheUm) ||
    (a.breiteUm === b.hoeheUm && a.hoeheUm === b.breiteUm)
  );
}

/** Eingaben für einen Ausschießplan (Bogen). */
export type AusschiessPlanEingabe = {
  /** Druckbogen; null = unbekannt (dann keine Nutzen, außer von Hand). */
  druckbogen: Flaeche | null;
  /** Rohbogen aus dem Lager; null = unbekannt. */
  rohbogen: Flaeche | null;
  /** true: gedruckt wird auf dem Rohbogen (kein eigener Druckbogen, kein Vorschneiden). */
  aufRohbogen: boolean;
  /** Offenes Format bzw. Endformat eines Nutzens. */
  nutzenFormat: Flaeche;
  /** Beschnitt je Seite; ein Beschnitt im Schema geht vor. */
  beschnittUm: number;
  /** Nicht bedruckbarer Rand der Druckmaschine je Seite. */
  randUm: number;
  schema?: AusschiessSchema | undefined;
  /** Nutzen je Druckbogen von Hand (statt berechnet). */
  nutzenVonHand?: number | undefined;
  /** Gebrauchte Nutzen: Auflage × je Produkt. */
  exemplare: number;
  zuschussFest?: number | undefined;
  zuschussProzent?: number | undefined;
};

/** Ausschießplan (Bogen) im Zustand „Schema“: Mengengerüst eines Teils für eine Auflage. */
export type AusschiessPlan = {
  zustand: 'schema';
  druckbogenFormat: Flaeche | null;
  rohbogenFormat: Flaeche | null;
  nutzenJeBogen: number | null;
  nutzenHerkunft: 'berechnet' | 'hand' | null;
  /** Lage der Nutzen auf dem Druckbogen (nur berechnet). */
  nutzenLage: Lage | null;
  /** Raster mit der Lage jedes Nutzens auf dem Druckbogen (nur berechnet). */
  nutzenRaster: Raster | null;
  /** Meldung, wenn die Nutzen nicht auf den Druckbogen passen. */
  nutzenFehler: string | null;
  /** Warnungen des Rasters (z. B. Schema). */
  warnungen: string[];
  /** true: Steg zwischen den Nutzen → je Zwischenraum zwei Schnitte. */
  doppelschnitt: boolean;
  /** Druckbogen ohne Zuschuss: aufrunden(Exemplare ÷ Nutzen). */
  druckbogenNetto: number | null;
  zuschuss: number;
  /** Druckbogen inkl. Zuschuss. */
  druckbogen: number | null;
  druckbogenJeRohbogen: number | null;
  /** Lage der Druckbogen auf dem Rohbogen (null, wenn auf dem Rohbogen gedruckt wird). */
  rohLage: Lage | null;
  /** Druckbogen auf dem Rohbogen als Rechtecke (leer, wenn auf dem Rohbogen gedruckt wird). */
  rohPositionen: Rechteck[];
  /** true: Der Druckbogen passt nicht in den Rohbogen. */
  rohPasstNicht: boolean;
  rohbogen: number | null;
  /** Druckbogen, die aus den Rohbogen entstehen (≥ druckbogen). */
  druckbogenAusRoh: number | null;
  schnitteVorschneiden: Schnitte | null;
  schnitteEndschnitt: Schnitte | null;
  /** Anteil der Nutzen an der Druckbogenfläche in ganzen Prozent. */
  papierGenutztProzent: number | null;
};

/**
 * Ausschießplan (Bogen) eines Teils für eine Auflage (T88):
 * 1. Nutzen je Druckbogen: von Hand oder aus dem Raster (`berechneRaster`: Bogen − Rand bzw.
 *    Ränder des Schemas, Nutzenformat + Beschnitt, Steg, Drehung, festes Raster des Schemas)
 * 2. Druckbogen = aufrunden(Exemplare ÷ Nutzen) + Zuschuss (aufrunden(netto × % ÷ 100) + fest)
 * 3. Druckbogen je Rohbogen: 1, wenn auf dem Rohbogen gedruckt wird oder die Formate gleich
 *    sind (auch gedreht); sonst beste Lage, mit Vorschneiden
 * 4. Rohbogen = aufrunden(Druckbogen ÷ Druckbogen je Rohbogen)
 * 5. Endschnitt aus der Lage der Nutzen (mit Randschnitten), genutztes Papier
 */
export function berechneAusschiessPlan(e: AusschiessPlanEingabe): AusschiessPlan {
  const druck = e.druckbogen;
  const roh = e.rohbogen;
  const p: AusschiessPlan = {
    zustand: 'schema',
    druckbogenFormat: druck,
    rohbogenFormat: roh,
    nutzenJeBogen: null,
    nutzenHerkunft: null,
    nutzenLage: null,
    nutzenRaster: null,
    nutzenFehler: null,
    warnungen: [],
    doppelschnitt: (e.schema?.beschnittUm ?? e.beschnittUm) > 0,
    druckbogenNetto: null,
    zuschuss: 0,
    druckbogen: null,
    druckbogenJeRohbogen: null,
    rohLage: null,
    rohPositionen: [],
    rohPasstNicht: false,
    rohbogen: null,
    druckbogenAusRoh: null,
    schnitteVorschneiden: null,
    schnitteEndschnitt: null,
    papierGenutztProzent: null,
  };

  // 1. Nutzen je Druckbogen
  if (e.nutzenVonHand !== undefined) {
    p.nutzenJeBogen = e.nutzenVonHand;
    p.nutzenHerkunft = 'hand';
  } else if (druck !== null) {
    const eingabe = rasterEingabe({
      bogen: druck,
      endformat: e.nutzenFormat,
      beschnittUm: e.beschnittUm,
      randUm: e.randUm,
      schema: e.schema,
    });
    const r = berechneRaster(eingabe);
    if (!r.ok) {
      p.nutzenFehler = r.fehler.map((f) => f.meldung).join('; ');
    } else {
      p.doppelschnitt = eingabe.steg.xUm > 0 || eingabe.steg.yUm > 0;
      p.nutzenJeBogen = r.wert.nutzen;
      p.nutzenHerkunft = 'berechnet';
      p.nutzenRaster = r.wert;
      p.nutzenLage = {
        spalten: r.wert.spalten,
        zeilen: r.wert.zeilen,
        gedreht: r.wert.gedreht,
        anzahl: r.wert.nutzen,
      };
      p.warnungen = [...r.wert.warnungen];
    }
  }

  // 2. Druckbogen + Zuschuss
  if (p.nutzenJeBogen !== null) {
    const netto = Math.ceil(e.exemplare / p.nutzenJeBogen);
    const prozent = e.zuschussProzent ?? 0;
    const fest = e.zuschussFest ?? 0;
    // kleine Gleitkomma-Reste nicht aufrunden
    const zuschuss = Math.ceil(Math.round(((netto * prozent) / 100) * 1e6) / 1e6) + fest;
    p.druckbogenNetto = netto;
    p.zuschuss = zuschuss;
    p.druckbogen = netto + zuschuss;
  }

  // 3./4. Rohbogen
  if (roh !== null && druck !== null) {
    if (e.aufRohbogen || gleicheFlaeche(roh, druck)) {
      p.druckbogenJeRohbogen = 1;
      p.schnitteVorschneiden = { einzeln: 0, gestapelt: 0 };
    } else {
      const l = besteLage(roh, druck);
      if (l.anzahl === 0) {
        p.rohPasstNicht = true;
      } else {
        p.druckbogenJeRohbogen = l.anzahl;
        p.rohLage = l;
        p.rohPositionen = lagePositionen(druck, l);
        p.schnitteVorschneiden = vorschnitte(roh, druck, l);
      }
    }
    if (p.druckbogen !== null && p.druckbogenJeRohbogen !== null) {
      p.rohbogen = Math.ceil(p.druckbogen / p.druckbogenJeRohbogen);
      p.druckbogenAusRoh = p.rohbogen * p.druckbogenJeRohbogen;
    }
  }

  // 5. Endschnitt und genutztes Papier
  if (p.nutzenLage !== null && druck !== null) {
    p.schnitteEndschnitt = schnitteFuerLage(p.nutzenLage, p.doppelschnitt, true);
  }
  if (p.nutzenJeBogen !== null && druck !== null) {
    const flaecheNutzen = p.nutzenJeBogen * e.nutzenFormat.breiteUm * e.nutzenFormat.hoeheUm;
    p.papierGenutztProzent = Math.round((100 * flaecheNutzen) / (druck.breiteUm * druck.hoeheUm));
  }
  return p;
}
