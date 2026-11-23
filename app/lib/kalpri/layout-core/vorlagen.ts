import { z } from 'zod';
import { AusrichtungSchema, type RasterEingabe } from './raster';
import { ausZod, type PruefErgebnis } from './pruefung';

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(/^[A-Za-z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');

const nameFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(80, 'höchstens 80 Zeichen');

const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

const abstand = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

const LISTE = { required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Liste sein' };

const MassSchema = z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl });

/** Format mit Namen, z. B. „A5“ 148 × 210 mm oder „Visitenkarte“ 85 × 55 mm (in µm). */
export const FormatEintragSchema = z.object({
  id: idFeld,
  name: nameFeld,
  breiteUm: positiveZahl,
  hoeheUm: positiveZahl,
});

export type FormatEintrag = z.infer<typeof FormatEintragSchema>;

/**
 * Ausschießschema mit Namen: wie die Nutzen auf den Druckbogen kommen. Alles freiwillig;
 * was fehlt, gilt wie ohne Schema:
 * - beschnittUm: Beschnitt je Seite (fehlt: vom Teil, sonst 3 mm)
 * - steg: Abstand zwischen den Endformaten (fehlt: 2 × Beschnitt, jeder Nutzen mit eigenem
 *   Beschnitt, Doppelschnitt)
 * - drehungErlaubt: Nutzen dürfen um 90° gedreht liegen (fehlt: ja)
 * - raster: feste Spalten × Zeilen (fehlt: so viele wie passen)
 * - raender: Mindestränder (die Maschine kann größere verlangen, es gilt der größere)
 * - ausrichtung: Block an Greifer/Seitenmarke statt mittig
 * - endformat: das Schema gilt für dieses Endformat (offenes Format); passt es nicht, meldet
 *   die Kalkulation das
 * - bogen: Druckbogen des Schemas (fehlt: Rohbogen bzw. automatisch)
 */
export const AusschiessSchemaSchema = z.object({
  id: idFeld,
  name: nameFeld,
  beschreibung: z
    .string({ invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'darf nicht leer sein')
    .max(500, 'höchstens 500 Zeichen')
    .optional(),
  beschnittUm: abstand.optional(),
  steg: z.object({ xUm: abstand, yUm: abstand }).optional(),
  drehungErlaubt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  raster: z.object({ spalten: positiveZahl, zeilen: positiveZahl }).optional(),
  raender: z
    .object({ greiferUm: abstand, hintenUm: abstand, linksUm: abstand, rechtsUm: abstand })
    .optional(),
  ausrichtung: AusrichtungSchema.optional(),
  endformat: MassSchema.optional(),
  bogen: MassSchema.optional(),
});

export type AusschiessSchema = z.infer<typeof AusschiessSchemaSchema>;

function eindeutig(
  liste: readonly { id: string; name: string }[],
  feld: string,
  ctx: z.RefinementCtx,
): void {
  const ids = new Map<string, number>();
  const namen = new Map<string, number>();
  for (const e of liste) {
    ids.set(e.id, (ids.get(e.id) ?? 0) + 1);
    const n = e.name.trim().toLowerCase();
    namen.set(n, (namen.get(n) ?? 0) + 1);
  }
  liste.forEach((e, i) => {
    if ((ids.get(e.id) ?? 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [feld, i, 'id'],
        message: `ID doppelt: ${e.id}`,
      });
    }
    if ((namen.get(e.name.trim().toLowerCase()) ?? 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [feld, i, 'name'],
        message: `Name doppelt: ${e.name}`,
      });
    }
  });
}

/** Datei der Formate und Ausschießschemas (Stammdaten fürs Ausschießen und die Kalkulation). */
export const AusschiessVorlagenSchema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: 'Version muss 1 sein' }) }),
    formate: z.array(FormatEintragSchema, LISTE),
    schemas: z.array(AusschiessSchemaSchema, LISTE),
  })
  .superRefine((d, ctx) => {
    eindeutig(d.formate, 'formate', ctx);
    eindeutig(d.schemas, 'schemas', ctx);
  });

export type AusschiessVorlagen = z.infer<typeof AusschiessVorlagenSchema>;

/** Übliche Formate für den Start (DIN und zwei häufige Sonderformate). */
export const STANDARD_FORMATE: readonly FormatEintrag[] = [
  { id: 'F-A3', name: 'A3', breiteUm: 297_000, hoeheUm: 420_000 },
  { id: 'F-A4', name: 'A4', breiteUm: 210_000, hoeheUm: 297_000 },
  { id: 'F-A5', name: 'A5', breiteUm: 148_000, hoeheUm: 210_000 },
  { id: 'F-A6', name: 'A6', breiteUm: 105_000, hoeheUm: 148_000 },
  { id: 'F-DL', name: 'DIN lang', breiteUm: 99_000, hoeheUm: 210_000 },
  { id: 'F-VK', name: 'Visitenkarte', breiteUm: 85_000, hoeheUm: 55_000 },
  { id: 'F-SRA3', name: 'SRA3', breiteUm: 320_000, hoeheUm: 450_000 },
];

export function leereAusschiessVorlagen(): AusschiessVorlagen {
  return { version: 1, formate: [...STANDARD_FORMATE], schemas: [] };
}

export function pruefeAusschiessVorlagen(eingabe: unknown): PruefErgebnis<AusschiessVorlagen> {
  return ausZod(AusschiessVorlagenSchema.safeParse(eingabe));
}

/** Nächste freie Nummer mit Präfix: „AS-0001“, „F-0001“ (eigene IDs wie „F-A5“ zählen nicht). */
export function naechsteVorlagenId(liste: readonly { id: string }[], praefix: 'AS' | 'F'): string {
  let hoechste = 0;
  const muster = new RegExp(`^${praefix}-(\\d{4})$`);
  for (const e of liste) {
    const n = Number(muster.exec(e.id)?.[1] ?? 0);
    if (n > hoechste) hoechste = n;
  }
  return `${praefix}-${String(hoechste + 1).padStart(4, '0')}`;
}

/** Format zu einem Text: Name aus der Liste (ohne Groß-/Kleinschreibung) oder null. */
export function findeFormat(text: string, formate: readonly FormatEintrag[]): FormatEintrag | null {
  const t = text.trim().toLowerCase();
  if (t === '') return null;
  return formate.find((f) => f.name.trim().toLowerCase() === t) ?? null;
}

/** Name zum Maß, wenn es in der Liste steht (beide Lagen), sonst null. */
export function formatName(
  mass: { breiteUm: number; hoeheUm: number },
  formate: readonly FormatEintrag[],
): string | null {
  const f = formate.find(
    (x) =>
      (x.breiteUm === mass.breiteUm && x.hoeheUm === mass.hoeheUm) ||
      (x.breiteUm === mass.hoeheUm && x.hoeheUm === mass.breiteUm),
  );
  return f?.name ?? null;
}

/**
 * Eingabe für `berechneRaster` aus Bogen, Endformat und Schema. Ränder: je Kante der größere von
 * Maschinenrand und Schema. Ohne Schema: Steg 2 × Beschnitt (jeder Nutzen mit eigenem
 * Beschnitt), Drehung erlaubt, kein festes Raster, Block mittig.
 */
export function rasterEingabe(e: {
  bogen: { breiteUm: number; hoeheUm: number };
  endformat: { breiteUm: number; hoeheUm: number };
  beschnittUm: number;
  randUm: number;
  schema?: AusschiessSchema | undefined;
}): RasterEingabe {
  const s = e.schema;
  const b = s?.beschnittUm ?? e.beschnittUm;
  const r = s?.raender;
  const eingabe: RasterEingabe = {
    bogen: e.bogen,
    raender: {
      greiferUm: Math.max(e.randUm, r?.greiferUm ?? 0),
      hintenUm: Math.max(e.randUm, r?.hintenUm ?? 0),
      linksUm: Math.max(e.randUm, r?.linksUm ?? 0),
      rechtsUm: Math.max(e.randUm, r?.rechtsUm ?? 0),
    },
    endformat: e.endformat,
    beschnittUm: b,
    steg: s?.steg ?? { xUm: 2 * b, yUm: 2 * b },
    drehungErlaubt: s?.drehungErlaubt ?? true,
  };
  if (s?.raster) eingabe.raster = s.raster;
  if (s?.ausrichtung) eingabe.ausrichtung = s.ausrichtung;
  return eingabe;
}

const mmText = (um: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(um / 1000);

/** Kurzbeschreibung eines Schemas: „148 × 210 mm · Raster 2 × 1 · Steg 0 mm · ohne Drehung“. */
export function schemaText(s: AusschiessSchema): string {
  const teile: string[] = [];
  if (s.endformat)
    teile.push(`für ${mmText(s.endformat.breiteUm)} × ${mmText(s.endformat.hoeheUm)} mm`);
  if (s.bogen) teile.push(`Bogen ${mmText(s.bogen.breiteUm)} × ${mmText(s.bogen.hoeheUm)} mm`);
  if (s.raster) teile.push(`Raster ${s.raster.spalten} × ${s.raster.zeilen}`);
  if (s.beschnittUm !== undefined) teile.push(`Beschnitt ${mmText(s.beschnittUm)} mm`);
  if (s.steg) {
    teile.push(
      s.steg.xUm === s.steg.yUm
        ? `Steg ${mmText(s.steg.xUm)} mm`
        : `Steg ${mmText(s.steg.xUm)} / ${mmText(s.steg.yUm)} mm`,
    );
  }
  if (s.drehungErlaubt === false) teile.push('ohne Drehung');
  if (s.raender) {
    const r = s.raender;
    teile.push(
      r.greiferUm === r.hintenUm && r.hintenUm === r.linksUm && r.linksUm === r.rechtsUm
        ? `Ränder mindestens ${mmText(r.greiferUm)} mm`
        : `Greiferrand ${mmText(r.greiferUm)} mm`,
    );
  }
  if (s.ausrichtung) teile.push('an der Anlage ausgerichtet');
  return teile.length === 0 ? 'wie automatisch' : teile.join(' · ');
}
