import { z } from 'zod';

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(/^[A-Za-z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');

function pflichtText(max: number) {
  return z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(max, `höchstens ${max} Zeichen`);
}

const ganzNichtNegativ = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/**
 * Kostenstelle: trägt den Stundensatz für einen oder mehrere Arbeitsplätze (z. B. „Kleine
 * Maschinen“). Nummer = Kostenstellennummer der Buchhaltung (z. B. „KS-450“). Geld in
 * Zehntelcent je Stunde.
 */
export const KostenstelleSchema = z
  .object({
    id: idFeld,
    name: pflichtText(80),
    nummer: pflichtText(40).optional(),
    stundensatzVollZehntelcent: ganzNichtNegativ,
    stundensatzTeilZehntelcent: ganzNichtNegativ.optional(),
    stundensatzVorlaeufig: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    personalZehntelcent: ganzNichtNegativ.optional(),
    beschreibung: pflichtText(2000).optional(),
  })
  .superRefine((k, ctx) => {
    if (
      k.stundensatzTeilZehntelcent !== undefined &&
      k.stundensatzTeilZehntelcent > k.stundensatzVollZehntelcent
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stundensatzTeilZehntelcent'],
        message: 'Teilkosten sind größer als Vollkosten',
      });
    }
    if (
      k.personalZehntelcent !== undefined &&
      k.personalZehntelcent > k.stundensatzVollZehntelcent
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['personalZehntelcent'],
        message: 'Personal ist größer als der Stundensatz',
      });
    }
  });

export type Kostenstelle = z.infer<typeof KostenstelleSchema>;
