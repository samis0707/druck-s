import { z } from 'zod';
import { RechteckSchema, liegtIn, type Rechteck } from './geometrie';
import { ausZod, type Fehler } from './pruefung';

/** Positive ganze Zahl in µm (Endformat, Bogen, Slot-Nummern). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Nicht negative ganze Zahl in µm (Ränder, Beschnitt, Steg). */
const abstand = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/**
 * Ausrichtung des Nutzenblocks an einer Bogenkante: je Richtung Mitte oder eine Kante mit
 * festem Abstand (in µm) vom Bogenrand bis zum Endformat des äußeren Nutzens.
 */
export const AusrichtungSchema = z.object(
  {
    x: z.discriminatedUnion(
      'art',
      [
        z.object({ art: z.literal('mitte') }),
        z.object({ art: z.literal('links'), abstandUm: abstand }),
        z.object({ art: z.literal('rechts'), abstandUm: abstand }),
      ],
      {
        errorMap: (issue, ctx) => {
          if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
            return { message: 'Ausrichtung muss mitte, links oder rechts sein' };
          }
          if (issue.code === z.ZodIssueCode.invalid_type) {
            return {
              message: issue.received === 'undefined' ? 'Pflichtfeld' : 'muss ein Objekt sein',
            };
          }
          return { message: ctx.defaultError };
        },
      },
    ),
    y: z.discriminatedUnion(
      'art',
      [
        z.object({ art: z.literal('mitte') }),
        z.object({ art: z.literal('vorne'), abstandUm: abstand }),
        z.object({ art: z.literal('hinten'), abstandUm: abstand }),
      ],
      {
        errorMap: (issue, ctx) => {
          if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
            return { message: 'Ausrichtung muss mitte, vorne oder hinten sein' };
          }
          if (issue.code === z.ZodIssueCode.invalid_type) {
            return {
              message: issue.received === 'undefined' ? 'Pflichtfeld' : 'muss ein Objekt sein',
            };
          }
          return { message: ctx.defaultError };
        },
      },
    ),
  },
  {
    errorMap: (issue, ctx) => {
      if (issue.code === z.ZodIssueCode.invalid_type) {
        return {
          message: issue.received === 'undefined' ? 'Pflichtfeld' : 'muss ein Objekt sein',
        };
      }
      return { message: ctx.defaultError };
    },
  },
);

export type Ausrichtung = z.infer<typeof AusrichtungSchema>;

export const RasterEingabeSchema = z.object({
  bogen: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  raender: z.object({
    greiferUm: abstand,
    hintenUm: abstand,
    linksUm: abstand,
    rechtsUm: abstand,
  }),
  endformat: z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl }),
  beschnittUm: abstand,
  steg: z.object({ xUm: abstand, yUm: abstand }),
  drehungErlaubt: z.boolean({
    required_error: 'Pflichtfeld',
    invalid_type_error: 'muss ja oder nein sein',
  }),
  raster: z.object({ spalten: positiveZahl, zeilen: positiveZahl }).optional(),
  ausrichtung: AusrichtungSchema.optional(),
});

export type RasterEingabe = z.infer<typeof RasterEingabeSchema>;

export const SlotSchema = z.object({
  id: z.string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' }),
  spalte: positiveZahl,
  zeile: positiveZahl,
  drehung: z.union([z.literal(0), z.literal(90)]),
  endformat: RechteckSchema,
  beschnitt: RechteckSchema,
});

export type Slot = z.infer<typeof SlotSchema>;

export type Raster = {
  bogen: { breiteUm: number; hoeheUm: number };
  spalten: number;
  zeilen: number;
  nutzen: number;
  gedreht: boolean;
  druckbereich: Rechteck;
  block: Rechteck;
  slots: Slot[];
  ausnutzung: number;
  warnungen: string[];
};

export type RasterErgebnis = { ok: true; wert: Raster } | { ok: false; fehler: Fehler[] };

export type BesteAusnutzung = Raster & { bogenGedreht: boolean };
export type BesteAusnutzungErgebnis =
  | { ok: true; wert: BesteAusnutzung }
  | { ok: false; fehler: Fehler[] };

/** Eine Lage des Endformats: w und h sind Breite und Höhe in der jeweiligen Lage (gedreht: vertauscht). */
type Lage = { w: number; h: number; gedreht: 0 | 90 };

/** Ein Bogen in einer Lage: beim gedrehten Bogen sind Breite und Höhe vertauscht. */
type Blatt = { bogen: { breiteUm: number; hoeheUm: number }; bogenGedreht: boolean };

const WARNUNG_STEG =
  'Steg kleiner als doppelter Beschnitt: Beschnitt benachbarter Nutzen überlappt';
const FEHLER_ENDFORMAT = 'Endformat passt nicht in den druckbaren Bereich';
const FEHLER_RAENDER = 'Ränder sind größer als der Bogen';
const FEHLER_AUSRICHTUNG = 'Nutzen ragen über den Bogen hinaus';
const WARNUNG_AUSRICHTUNG = 'Nutzen ragen in den nicht bedruckbaren Bereich';

/** Druckbereich = Bogen minus Ränder. Ursprung ist die linke Ecke der Greiferkante. */
function druckbereichVon(
  bogen: { breiteUm: number; hoeheUm: number },
  raender: RasterEingabe['raender'],
): Rechteck {
  return {
    xUm: raender.linksUm,
    yUm: raender.greiferUm,
    breiteUm: bogen.breiteUm - raender.linksUm - raender.rechtsUm,
    hoeheUm: bogen.hoeheUm - raender.greiferUm - raender.hintenUm,
  };
}

/** Lagen des Endformats: zuerst ungedreht, dann gedreht (nur wenn erlaubt und nicht quadratisch). */
function endformatLagen(e: RasterEingabe): Lage[] {
  const w = e.endformat.breiteUm;
  const h = e.endformat.hoeheUm;
  const lagen: Lage[] = [{ w, h, gedreht: 0 }];
  if (e.drehungErlaubt && w !== h) {
    lagen.push({ w: h, h: w, gedreht: 90 });
  }
  return lagen;
}

/** So viele Spalten und Zeilen passen in dieser Lage höchstens. */
function maximaleSpalten(
  druckbereich: Rechteck,
  lage: Lage,
  beschnittUm: number,
  steg: RasterEingabe['steg'],
): { spalten: number; zeilen: number } {
  const nutzBreite = druckbereich.breiteUm - 2 * beschnittUm;
  const nutzHoehe = druckbereich.hoeheUm - 2 * beschnittUm;
  const spalten =
    nutzBreite < lage.w ? 0 : Math.floor((nutzBreite + steg.xUm) / (lage.w + steg.xUm));
  const zeilen = nutzHoehe < lage.h ? 0 : Math.floor((nutzHoehe + steg.yUm) / (lage.h + steg.yUm));
  return { spalten, zeilen };
}

/**
 * Baut Block, Slots, Warnungen und Ausnutzung für eine gewählte Lage.
 * Die Anzahl der Nutzen kommt aus dem Druckbereich; die Ausrichtung verschiebt nur den Block.
 */
function baueRaster(
  blatt: Blatt,
  druckbereich: Rechteck,
  lage: Lage,
  spalten: number,
  zeilen: number,
  e: RasterEingabe,
): RasterErgebnis {
  const b = e.beschnittUm;
  const blockBreite = spalten * lage.w + (spalten - 1) * e.steg.xUm + 2 * b;
  const blockHoehe = zeilen * lage.h + (zeilen - 1) * e.steg.yUm + 2 * b;
  const W = blatt.bogen.breiteUm;
  const H = blatt.bogen.hoeheUm;

  // x: Mitte (wie bisher) oder links/rechts mit Abstand vom Bogenrand bis Endformat.
  let xUm = druckbereich.xUm + Math.floor((druckbereich.breiteUm - blockBreite) / 2);
  const ausrichtungX = e.ausrichtung?.x;
  if (ausrichtungX?.art === 'links') {
    xUm = ausrichtungX.abstandUm - b;
  } else if (ausrichtungX?.art === 'rechts') {
    xUm = W - ausrichtungX.abstandUm + b - blockBreite;
  }

  // y: Mitte (wie bisher) oder vorne/hinten mit Abstand vom Bogenrand bis Endformat.
  let yUm = druckbereich.yUm + Math.floor((druckbereich.hoeheUm - blockHoehe) / 2);
  const ausrichtungY = e.ausrichtung?.y;
  if (ausrichtungY?.art === 'vorne') {
    yUm = ausrichtungY.abstandUm - b;
  } else if (ausrichtungY?.art === 'hinten') {
    yUm = H - ausrichtungY.abstandUm + b - blockHoehe;
  }

  const block: Rechteck = { xUm, yUm, breiteUm: blockBreite, hoeheUm: blockHoehe };

  // Der Block muss vollständig auf dem Bogen liegen.
  if (xUm < 0 || yUm < 0 || xUm + blockBreite > W || yUm + blockHoehe > H) {
    return { ok: false, fehler: [{ pfad: 'ausrichtung', meldung: FEHLER_AUSRICHTUNG }] };
  }

  const slots: Slot[] = [];
  for (let zeile = 1; zeile <= zeilen; zeile += 1) {
    for (let spalte = 1; spalte <= spalten; spalte += 1) {
      const x = block.xUm + b + (spalte - 1) * (lage.w + e.steg.xUm);
      const y = block.yUm + b + (zeile - 1) * (lage.h + e.steg.yUm);
      slots.push({
        id: `S${slots.length + 1}`,
        spalte,
        zeile,
        drehung: lage.gedreht,
        endformat: { xUm: x, yUm: y, breiteUm: lage.w, hoeheUm: lage.h },
        beschnitt: {
          xUm: x - b,
          yUm: y - b,
          breiteUm: lage.w + 2 * b,
          hoeheUm: lage.h + 2 * b,
        },
      });
    }
  }

  const warnungen: string[] = [];
  // Der Block darf aus dem bedruckbaren Bereich ragen (Beschnitt am Rand ist gewollt).
  if (!liegtIn(block, druckbereich)) {
    warnungen.push(WARNUNG_AUSRICHTUNG);
  }
  if (b > 0 && ((spalten > 1 && e.steg.xUm < 2 * b) || (zeilen > 1 && e.steg.yUm < 2 * b))) {
    warnungen.push(WARNUNG_STEG);
  }

  const bogenFlaeche = blatt.bogen.breiteUm * blatt.bogen.hoeheUm;
  const ausnutzung =
    bogenFlaeche > 0
      ? Math.round(((spalten * zeilen * lage.w * lage.h) / bogenFlaeche) * 10000) / 10000
      : 0;

  return {
    ok: true,
    wert: {
      bogen: blatt.bogen,
      spalten,
      zeilen,
      nutzen: spalten * zeilen,
      gedreht: lage.gedreht === 90,
      druckbereich,
      block,
      slots,
      ausnutzung,
      warnungen,
    },
  };
}

/**
 * Berechnet das Nutzenraster auf dem Bogen.
 * Ohne festes `raster` gewinnt die Lage mit den meisten Nutzen (bei Gleichstand die ungedrehte),
 * mit festem `raster` die erste Lage, in die das Raster passt.
 */
export function berechneRaster(eingabe: unknown): RasterErgebnis {
  const geprueft = ausZod(RasterEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return { ok: false, fehler: geprueft.fehler };
  }
  const e = geprueft.wert;
  const blatt: Blatt = { bogen: e.bogen, bogenGedreht: false };
  const druckbereich = druckbereichVon(e.bogen, e.raender);
  if (druckbereich.breiteUm <= 0 || druckbereich.hoeheUm <= 0) {
    return { ok: false, fehler: [{ pfad: 'raender', meldung: FEHLER_RAENDER }] };
  }

  const lagen = endformatLagen(e);

  if (e.raster) {
    for (const lage of lagen) {
      const masse = maximaleSpalten(druckbereich, lage, e.beschnittUm, e.steg);
      if (e.raster.spalten <= masse.spalten && e.raster.zeilen <= masse.zeilen) {
        return baueRaster(blatt, druckbereich, lage, e.raster.spalten, e.raster.zeilen, e);
      }
    }
    return {
      ok: false,
      fehler: [
        {
          pfad: 'raster',
          meldung: `Raster ${e.raster.spalten} × ${e.raster.zeilen} passt nicht in den druckbaren Bereich`,
        },
      ],
    };
  }

  let best: { lage: Lage; spalten: number; zeilen: number } | undefined;
  for (const lage of lagen) {
    const masse = maximaleSpalten(druckbereich, lage, e.beschnittUm, e.steg);
    const nutzen = masse.spalten * masse.zeilen;
    if (nutzen === 0) {
      continue;
    }
    if (!best || nutzen > best.spalten * best.zeilen) {
      best = { lage, spalten: masse.spalten, zeilen: masse.zeilen };
    }
  }
  if (!best) {
    return { ok: false, fehler: [{ pfad: '', meldung: FEHLER_ENDFORMAT }] };
  }
  return baueRaster(blatt, druckbereich, best.lage, best.spalten, best.zeilen, e);
}

/**
 * Rechnet immer automatisch (ein festes `raster` in der Eingabe wird ignoriert).
 * Ist `bogenDrehbar` und der Bogen nicht quadratisch, wird zusätzlich der gedrehte Bogen gerechnet
 * (Breite und Höhe vertauscht = andere Kante an den Greifer; die Ränder bleiben, weil sie zur
 * Maschine gehören). Es gewinnt die Lage mit den meisten Nutzen; bei Gleichstand der ungedrehte Bogen.
 * Passt in keiner Lage etwas → Fehler der ersten Lage.
 */
export function besteAusnutzung(
  eingabe: unknown,
  optionen: { bogenDrehbar: boolean },
): BesteAusnutzungErgebnis {
  const geprueft = ausZod(RasterEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return { ok: false, fehler: geprueft.fehler };
  }
  const e = geprueft.wert;

  const blaetter: Blatt[] = [{ bogen: e.bogen, bogenGedreht: false }];
  if (optionen?.bogenDrehbar === true && e.bogen.breiteUm !== e.bogen.hoeheUm) {
    blaetter.push({
      bogen: { breiteUm: e.bogen.hoeheUm, hoeheUm: e.bogen.breiteUm },
      bogenGedreht: true,
    });
  }

  const lagen = endformatLagen(e);
  let best: BesteAusnutzung | undefined;
  let ersterFehler: Fehler | undefined;

  for (const blatt of blaetter) {
    const druckbereich = druckbereichVon(blatt.bogen, e.raender);
    if (druckbereich.breiteUm <= 0 || druckbereich.hoeheUm <= 0) {
      ersterFehler ??= { pfad: 'raender', meldung: FEHLER_RAENDER };
      continue;
    }
    for (const lage of lagen) {
      const masse = maximaleSpalten(druckbereich, lage, e.beschnittUm, e.steg);
      const nutzen = masse.spalten * masse.zeilen;
      if (nutzen === 0) {
        ersterFehler ??= { pfad: '', meldung: FEHLER_ENDFORMAT };
        continue;
      }
      // Eine Ausrichtung, die nicht auf den Bogen passt, macht diese Lage unbrauchbar.
      const gebaut = baueRaster(blatt, druckbereich, lage, masse.spalten, masse.zeilen, e);
      if (!gebaut.ok) {
        ersterFehler ??= gebaut.fehler[0] ?? { pfad: 'ausrichtung', meldung: FEHLER_AUSRICHTUNG };
        continue;
      }
      if (best === undefined || nutzen > best.nutzen) {
        best = { ...gebaut.wert, bogenGedreht: blatt.bogenGedreht };
      }
    }
  }

  if (best === undefined) {
    return {
      ok: false,
      fehler: [ersterFehler ?? { pfad: '', meldung: FEHLER_ENDFORMAT }],
    };
  }
  return { ok: true, wert: best };
}
