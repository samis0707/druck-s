import { z } from 'zod/v3';

const zahlFeld = z.number({
  required_error: 'Pflichtfeld',
  invalid_type_error: 'muss eine Zahl sein',
});

function pflichtText(max: number) {
  return z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(max, `höchstens ${max} Zeichen`);
}

/** Merkmale, nach denen eine Ausprägung fragen kann (nur Beschriebenes, keine Formeln). */
export const ZAHL_MERKMALE = [
  'grammatur',
  'dickeUm',
  'bogenbreiteUm',
  'bogenhoeheUm',
  'menge',
  'farben',
  'nutzen',
  'faecher',
] as const;
export const TEXT_MERKMALE = ['material', 'kategorie', 'oberflaeche', 'laufrichtung'] as const;
export const MERKMALE = [...TEXT_MERKMALE, ...ZAHL_MERKMALE, 'einstellung'] as const;
export type Merkmal = (typeof MERKMALE)[number];

export const VERGLEICHE = [
  'ist',
  'istNicht',
  'gleich',
  'groesser',
  'kleiner',
  'vonBis',
  'gesetzt',
  'nichtGesetzt',
] as const;
export type Vergleich = (typeof VERGLEICHE)[number];

const ZAHL_VERGLEICHE: readonly Vergleich[] = ['gleich', 'groesser', 'kleiner', 'vonBis'];
const TEXT_VERGLEICHE: readonly Vergleich[] = ['ist', 'istNicht'];
const EINSTELLUNG_VERGLEICHE: readonly Vergleich[] = ['gesetzt', 'nichtGesetzt'];

/** Erlaubte Vergleiche je Merkmal (für Auswahllisten in der Oberfläche). */
export function vergleicheFuer(merkmal: Merkmal): readonly Vergleich[] {
  if ((ZAHL_MERKMALE as readonly string[]).includes(merkmal)) return ZAHL_VERGLEICHE;
  if (merkmal === 'einstellung') return EINSTELLUNG_VERGLEICHE;
  return TEXT_VERGLEICHE;
}

/**
 * Bedingung „Merkmal Vergleich Wert“, z. B. grammatur groesser 300, material ist M0004,
 * faecher vonBis 17–20, einstellung gesetzt „Hand“. Zahlen in µm bzw. als Anzahl.
 */
export const BedingungSchema = z
  .object({
    merkmal: z.enum(MERKMALE, { message: 'Merkmal unbekannt' }),
    vergleich: z.enum(VERGLEICHE, { message: 'Vergleich unbekannt' }),
    wert: z.union([zahlFeld, pflichtText(80)], {
      errorMap: (issue, ctx) =>
        issue.code === z.ZodIssueCode.invalid_union
          ? {
              message: ctx.data === undefined ? 'Pflichtfeld' : 'muss eine Zahl oder ein Text sein',
            }
          : { message: ctx.defaultError },
    }),
    bis: zahlFeld.optional(),
  })
  .superRefine((b, ctx) => {
    if (!vergleicheFuer(b.merkmal).includes(b.vergleich)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vergleich'],
        message: 'Vergleich passt nicht zum Merkmal',
      });
      return;
    }
    const zahl = (ZAHL_MERKMALE as readonly string[]).includes(b.merkmal);
    if (zahl && typeof b.wert !== 'number') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wert'], message: 'muss eine Zahl sein' });
    }
    if (!zahl && typeof b.wert !== 'string') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wert'], message: 'muss ein Text sein' });
    }
    if (b.vergleich === 'vonBis') {
      if (b.bis === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bis'], message: 'Pflichtfeld' });
      } else if (typeof b.wert === 'number' && b.bis < b.wert) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bis'],
          message: 'muss mindestens so groß sein wie von',
        });
      }
    }
  });

export type Bedingung = z.infer<typeof BedingungSchema>;

const ganzNichtNegativ = zahlFeld
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/**
 * Leistungsänderung (Werkzeug, Arbeitsgang, Teil einer Wirkung): Leistung ± % (−90 bis +500),
 * Rüsten + ms, Zuschuss + fest / + %.
 */
export const LeistungsaenderungSchema = z.object({
  leistungProzent: zahlFeld.min(-90, 'mindestens −90').max(500, 'höchstens 500').optional(),
  ruestenMs: ganzNichtNegativ.optional(),
  zuschussFest: ganzNichtNegativ.optional(),
  zuschussProzent: zahlFeld.min(0, 'darf nicht negativ sein').max(100, 'höchstens 100').optional(),
});

export type Leistungsaenderung = z.infer<typeof LeistungsaenderungSchema>;

/** Wirkung einer Ausprägung: Leistungsänderung plus Kosten, „nicht geeignet“ und Hinweis-Text. */
export const WirkungSchema = LeistungsaenderungSchema.extend({
  kostenZehntelcent: ganzNichtNegativ.optional(),
  nichtGeeignet: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  hinweis: pflichtText(200).optional(),
  /** T158: Fassung je Durchgang ändern (z. B. „über 250 g nur 10 Stationen“) – ersetzt den
   *  Wert der Maschine bzw. Tätigkeit, solange die Bedingungen zutreffen. */
  fassung: z
    .object({
      einlegehoeheUm: ganzNichtNegativ.min(1, 'muss größer als 0 sein').optional(),
      stationen: ganzNichtNegativ.min(1, 'muss größer als 0 sein').optional(),
      stueckJeDurchgang: ganzNichtNegativ.min(1, 'muss größer als 0 sein').optional(),
    })
    .optional(),
});

export type Wirkung = z.infer<typeof WirkungSchema>;

/**
 * Ausprägung am Arbeitsplatz: gilt für einen Schritt (schrittId) oder alle Schritte am Platz;
 * greift, wenn alle Bedingungen zutreffen.
 */
export const AuspraegungSchema = z
  .object({
    name: pflichtText(80),
    schrittId: z
      .string({ invalid_type_error: 'muss ein Text sein' })
      .trim()
      .min(1, 'darf nicht leer sein')
      .optional(),
    bedingungen: z
      .array(BedingungSchema, {
        required_error: 'Pflichtfeld',
        invalid_type_error: 'muss eine Liste sein',
      })
      .min(1, 'mindestens eine Bedingung'),
    wirkung: WirkungSchema,
  })
  .superRefine((a, ctx) => {
    const { fassung, ...rest } = a.wirkung;
    const mitFassung = fassung !== undefined && Object.values(fassung).some((w) => w !== undefined);
    if (!mitFassung && Object.values(rest).every((w) => w === undefined || w === false)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wirkung'],
        message: 'mindestens eine Wirkung',
      });
    }
  });

export type Auspraegung = z.infer<typeof AuspraegungSchema>;
