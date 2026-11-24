import { z } from 'zod/v3';
import { type Rechteck } from './geometrie';
import { ausZod, type Fehler, type PruefErgebnis } from './pruefung';
import { StanzungEingabeSchema, pruefeStanzung, type Stanzung } from './stanze';

/** Positive ganze Zahl in µm (Lage der Schnittlinie). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Nicht negative ganze Zahl in µm (Breite des Abfallstreifens). */
const abstand = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/**
 * Ein Schnitt: Lage der ersten Linie (posUm) und Breite des Abfallstreifens (abfallUm).
 * abfallUm = 0 ist ein Einzelschnitt, sonst ein Doppelschnitt mit zweiter Linie bei
 * posUm + abfallUm.
 */
export const SchnittSchema = z.object({ posUm: positiveZahl, abfallUm: abstand });

export type Schnitt = z.infer<typeof SchnittSchema>;

/** Eingabe der Teilung: Druckbogen, Schnitte und die Stanzung (Teilbogen im Tiegel). */
export const TeilungEingabeSchema = z.object({
  bogen: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  schnitte: z.object({ x: z.array(SchnittSchema), y: z.array(SchnittSchema) }),
  stanzung: StanzungEingabeSchema,
});

export type TeilungEingabe = z.infer<typeof TeilungEingabeSchema>;

/** Anlagekante eines Teilbogens (Kante, die in der Stanze anliegt). */
export type Kante = 'vorne' | 'hinten' | 'links' | 'rechts';

/** Ein Nutzen der Stanzform, umgerechnet in Druckbogen-Koordinaten. */
export type TeilungsNutzen = {
  id: string;
  gruppe: string;
  nutzenId: string;
  endformat: Rechteck;
  beschnitt: Rechteck;
};

/** Ein Teilbogen des Druckbogens mit Anlagekante und den Nutzen der Stanzform darauf. */
export type Teilbogen = {
  id: string;
  spalte: number;
  zeile: number;
  rechteck: Rechteck;
  anlage: Kante;
  drehung: 0 | 90 | 180 | 270;
  anlageOriginal: boolean;
  nutzen: TeilungsNutzen[];
};

/** Eine Schnittlinie auf dem Druckbogen. */
export type Schnittlinie = { richtung: 'x' | 'y'; posUm: number };

/** Ergebnis der Teilung: Teilbogen des Druckbogens mit den Nutzen der Stanzform. */
export type Teilung = {
  bogen: { breiteUm: number; hoeheUm: number };
  stanzung: Stanzung;
  schnittlinien: Schnittlinie[];
  abfall: Rechteck[];
  teilbogen: Teilbogen[];
  teilbogenJeBogen: number;
  nutzenJeBogen: number;
  warnungen: string[];
};

/** Reihenfolge der Anlagekanten: vorne, hinten, links, rechts. */
const KANTEN: Kante[] = ['vorne', 'hinten', 'links', 'rechts'];

/** Drehung je Anlagekante. */
const DREHUNG: Record<Kante, 0 | 90 | 180 | 270> = {
  vorne: 0,
  hinten: 180,
  links: 90,
  rechts: 270,
};

const FEHLER_SCHNITTE = 'Schnitte müssen aufsteigend auf dem Bogen liegen';
const WARNUNG_SCHNITTKANTE = 'Anlage an einer Schnittkante';

/** Ein Streifen zwischen zwei Schnittlinien (von, bis in µm, bis exklusive). */
type Streifen = { von: number; bis: number };

/** Länge in mm mit Komma als Dezimaltrenner (z. B. 158,5). */
function mmText(um: number): string {
  return String(um / 1000).replace('.', ',');
}

/**
 * Streifen einer Richtung: von = 0, Schnitte in Eingabereihenfolge, am Ende der Reststreifen.
 * Ein Schnitt ist ungültig, wenn er nicht aufsteigend liegt oder der Abfallstreifen bis zum
 * Bogenrand reicht.
 */
function streifen(schnitte: Schnitt[], laenge: number): { streifen: Streifen[]; gueltig: boolean } {
  const ergebnis: Streifen[] = [];
  let von = 0;
  for (const schnitt of schnitte) {
    if (schnitt.posUm <= von || schnitt.posUm + schnitt.abfallUm >= laenge) {
      return { streifen: [], gueltig: false };
    }
    ergebnis.push({ von, bis: schnitt.posUm });
    von = schnitt.posUm + schnitt.abfallUm;
  }
  ergebnis.push({ von, bis: laenge });
  return { streifen: ergebnis, gueltig: true };
}

/** true, wenn die Kante zum Format der Stanzung passt (vorne/hinten in Lage, links/rechts gedreht). */
function kantePasst(kante: Kante, r: Rechteck, f: { breiteUm: number; hoeheUm: number }): boolean {
  if (kante === 'vorne' || kante === 'hinten') {
    return r.breiteUm === f.breiteUm && r.hoeheUm === f.hoeheUm;
  }
  return r.hoeheUm === f.breiteUm && r.breiteUm === f.hoeheUm;
}

/** true, wenn die Kante eine Originalkante des Druckbogens ist. */
function kanteOriginal(
  kante: Kante,
  r: Rechteck,
  bogen: { breiteUm: number; hoeheUm: number },
): boolean {
  if (kante === 'vorne') return r.yUm === 0;
  if (kante === 'hinten') return r.yUm + r.hoeheUm === bogen.hoeheUm;
  if (kante === 'links') return r.xUm === 0;
  return r.xUm + r.breiteUm === bogen.breiteUm;
}

/**
 * Wählt die Anlagekante des Teilbogens: die erste passende Originalkante, sonst die erste
 * passende Kante. Passt keine Kante, gibt es keine Anlage.
 */
function waehleAnlage(
  r: Rechteck,
  bogen: { breiteUm: number; hoeheUm: number },
  f: { breiteUm: number; hoeheUm: number },
): { kante: Kante; original: boolean } | undefined {
  for (const kante of KANTEN) {
    if (kanteOriginal(kante, r, bogen) && kantePasst(kante, r, f)) {
      return { kante, original: true };
    }
  }
  for (const kante of KANTEN) {
    if (kantePasst(kante, r, f)) {
      return { kante, original: false };
    }
  }
  return undefined;
}

/** Rechnet ein Rechteck aus Teilbogen- in Druckbogen-Koordinaten um (nie gespiegelt). */
function umrechnen(r: Rechteck, t: Rechteck, anlage: Kante): Rechteck {
  if (anlage === 'vorne') {
    return {
      xUm: t.xUm + r.xUm,
      yUm: t.yUm + r.yUm,
      breiteUm: r.breiteUm,
      hoeheUm: r.hoeheUm,
    };
  }
  if (anlage === 'hinten') {
    return {
      xUm: t.xUm + t.breiteUm - r.xUm - r.breiteUm,
      yUm: t.yUm + t.hoeheUm - r.yUm - r.hoeheUm,
      breiteUm: r.breiteUm,
      hoeheUm: r.hoeheUm,
    };
  }
  if (anlage === 'links') {
    return {
      xUm: t.xUm + r.yUm,
      yUm: t.yUm + t.hoeheUm - r.xUm - r.breiteUm,
      breiteUm: r.hoeheUm,
      hoeheUm: r.breiteUm,
    };
  }
  return {
    xUm: t.xUm + t.breiteUm - r.yUm - r.hoeheUm,
    yUm: t.yUm + r.xUm,
    breiteUm: r.hoeheUm,
    hoeheUm: r.breiteUm,
  };
}

/**
 * Teilt den Druckbogen in Teilbogen und setzt die Stanzform auf jeden Teilbogen.
 * Die Schnitte laufen senkrecht (x) und waagerecht (y) durchgehend; jeder Teilbogen wird an
 * einer Kante angelegt, die zum Teilbogenformat der Stanzung passt (Originalkanten des
 * Druckbogens haben Vorrang). Ergebnis sind alle Nutzen in Druckbogen-Koordinaten, gruppiert
 * nach Teilbogen.
 */
export function berechneTeilung(eingabe: unknown): PruefErgebnis<Teilung> {
  const geprueft = ausZod(TeilungEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return { ok: false, fehler: geprueft.fehler };
  }
  const e = geprueft.wert;

  // Stanzung prüfen; ihre Fehler laufen unter "stanzung".
  const geprueftStanzung = pruefeStanzung(e.stanzung);
  if (!geprueftStanzung.ok) {
    return {
      ok: false,
      fehler: geprueftStanzung.fehler.map((f) => ({
        pfad: f.pfad ? `stanzung.${f.pfad}` : 'stanzung',
        meldung: f.meldung,
      })),
    };
  }
  const stanzung = geprueftStanzung.wert;

  // Streifen: erst x, dann y.
  const spalten = streifen(e.schnitte.x, e.bogen.breiteUm);
  const zeilen = streifen(e.schnitte.y, e.bogen.hoeheUm);
  const fehlerSchnitte: Fehler[] = [];
  if (!spalten.gueltig) {
    fehlerSchnitte.push({ pfad: 'schnitte.x', meldung: FEHLER_SCHNITTE });
  }
  if (!zeilen.gueltig) {
    fehlerSchnitte.push({ pfad: 'schnitte.y', meldung: FEHLER_SCHNITTE });
  }
  if (fehlerSchnitte.length > 0) {
    return { ok: false, fehler: fehlerSchnitte };
  }

  // Teilbogen: Zeilen (y) außen, Spalten (x) innen.
  const fehler: Fehler[] = [];
  const teilbogen: Teilbogen[] = [];
  const anSchnittkante: string[] = [];
  zeilen.streifen.forEach((zeile, zeileIndex) => {
    spalten.streifen.forEach((spalte, spalteIndex) => {
      const spalteNr = spalteIndex + 1;
      const zeileNr = zeileIndex + 1;
      const id = `T${(zeileNr - 1) * spalten.streifen.length + spalteNr}`;
      const rechteck: Rechteck = {
        xUm: spalte.von,
        yUm: zeile.von,
        breiteUm: spalte.bis - spalte.von,
        hoeheUm: zeile.bis - zeile.von,
      };

      const anlage = waehleAnlage(rechteck, e.bogen, stanzung.teilbogen);
      if (!anlage) {
        fehler.push({
          pfad: 'schnitte',
          meldung:
            `Teilbogen ${id} (${mmText(rechteck.breiteUm)} × ${mmText(rechteck.hoeheUm)} mm) ` +
            `passt nicht zur Stanzform (${mmText(stanzung.teilbogen.breiteUm)} × ` +
            `${mmText(stanzung.teilbogen.hoeheUm)} mm)`,
        });
        return;
      }

      const nutzen: TeilungsNutzen[] = stanzung.nutzen.map((n) => ({
        id: `${id}-${n.id}`,
        gruppe: id,
        nutzenId: n.id,
        endformat: umrechnen(n.endformat, rechteck, anlage.kante),
        beschnitt: umrechnen(n.beschnitt, rechteck, anlage.kante),
      }));

      teilbogen.push({
        id,
        spalte: spalteNr,
        zeile: zeileNr,
        rechteck,
        anlage: anlage.kante,
        drehung: DREHUNG[anlage.kante],
        anlageOriginal: anlage.original,
        nutzen,
      });
      if (!anlage.original) {
        anSchnittkante.push(id);
      }
    });
  });

  if (fehler.length > 0) {
    return { ok: false, fehler };
  }

  // Schnittlinien und Abfallstreifen: erst alle x-Schnitte, dann alle y-Schnitte.
  const schnittlinien: Schnittlinie[] = [];
  const abfall: Rechteck[] = [];
  for (const schnitt of e.schnitte.x) {
    schnittlinien.push({ richtung: 'x', posUm: schnitt.posUm });
    if (schnitt.abfallUm > 0) {
      schnittlinien.push({ richtung: 'x', posUm: schnitt.posUm + schnitt.abfallUm });
      abfall.push({
        xUm: schnitt.posUm,
        yUm: 0,
        breiteUm: schnitt.abfallUm,
        hoeheUm: e.bogen.hoeheUm,
      });
    }
  }
  for (const schnitt of e.schnitte.y) {
    schnittlinien.push({ richtung: 'y', posUm: schnitt.posUm });
    if (schnitt.abfallUm > 0) {
      schnittlinien.push({ richtung: 'y', posUm: schnitt.posUm + schnitt.abfallUm });
      abfall.push({
        xUm: 0,
        yUm: schnitt.posUm,
        breiteUm: e.bogen.breiteUm,
        hoeheUm: schnitt.abfallUm,
      });
    }
  }

  // Warnungen: zuerst die der Stanzung, dann die Anlage an Schnittkanten.
  const warnungen: string[] = [...stanzung.warnungen];
  if (anSchnittkante.length > 0) {
    warnungen.push(`${WARNUNG_SCHNITTKANTE}: ${anSchnittkante.join(', ')}`);
  }

  return {
    ok: true,
    wert: {
      bogen: e.bogen,
      stanzung,
      schnittlinien,
      abfall,
      teilbogen,
      teilbogenJeBogen: teilbogen.length,
      nutzenJeBogen: teilbogen.length * stanzung.anzahl,
      warnungen,
    },
  };
}
