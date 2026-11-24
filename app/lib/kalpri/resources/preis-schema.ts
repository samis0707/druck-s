import { z } from 'zod/v3';

/** Erlaubte Zeichen einer Preis-ID: A-Z a-z 0-9 _ - */
const ID_MUSTER = /^[A-Za-z0-9_-]+$/;

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(ID_MUSTER, 'nur Buchstaben, Ziffern, _ und -');

const materialIdFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen');

const lieferantFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(80, 'höchstens 80 Zeichen');

const artikelnummerFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(60, 'höchstens 60 Zeichen')
  .optional();

/** Prüft Text JJJJ-MM-TT auf ein echtes Kalenderdatum (2026-02-30 ist ungültig). */
function istEchtesDatum(wert: string): boolean {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!treffer) {
    return false;
  }
  const jahr = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return (
    datum.getUTCFullYear() === jahr &&
    datum.getUTCMonth() === monat - 1 &&
    datum.getUTCDate() === tag
  );
}

const gueltigAbFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
  .refine(istEchtesDatum, 'Datum im Format JJJJ-MM-TT');

/** Betrag in ganzen Zehntelcent, nicht negativ. */
const betragFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

const einheitNameFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(30, 'höchstens 30 Zeichen');

const inhaltFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

const abFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

const staffelStufeSchema = z.object({
  ab: abFeld,
  betragZehntelcent: betragFeld,
});

/** Staffel: mindestens ein Eintrag, beginnt bei ab: 1 und steigt streng aufsteigend.
 *  Die Prüfung hängt an der Liste, nicht am Objekt: zod erlaubt in discriminatedUnion
 *  keine Objekte mit .refine()/.superRefine(). */
const staffelFeld = z
  .array(staffelStufeSchema)
  .min(1, 'mindestens ein Eintrag')
  .refine(
    (stufen) =>
      stufen[0]?.ab === 1 &&
      stufen.every((stufe, index) => index === 0 || stufe.ab > (stufen[index - 1]?.ab ?? 0)),
    'Staffel muss bei 1 beginnen und aufsteigend sein',
  );

/**
 * T182: Einstand – vom Listenpreis zum Einstandspreis (Bezugspreis):
 * Liste × (1 − Rabatt) × (1 − Skonto) + Zuschläge je Bezugseinheit + Bezugskosten je Bestellung ÷
 * übliche Bestellmenge. Bezugseinheit: Gebinde (basis einheit), 1.000 Stück (je1000), 100 kg (je100kg);
 * die Bestellmenge zählt in Gebinde, Stück bzw. kg.
 */
const prozentFeld = z
  .number({ invalid_type_error: 'muss eine Zahl sein' })
  .min(0, 'darf nicht negativ sein')
  .max(100, 'höchstens 100')
  .optional();
export const EinstandSchema = z
  .object({
    rabattProzent: prozentFeld,
    skontoProzent: prozentFeld,
    /** Zuschläge je Bezugseinheit (Energie, Logistik …) in Zehntelcent. */
    zuschlagZehntelcent: z
      .number({ invalid_type_error: 'muss eine Zahl sein' })
      .int('ganze Zehntelcent')
      .min(0, 'darf nicht negativ sein')
      .optional(),
    /** Versand/Handling je Bestellung in Zehntelcent. */
    bezugskostenZehntelcent: z
      .number({ invalid_type_error: 'muss eine Zahl sein' })
      .int('ganze Zehntelcent')
      .min(0, 'darf nicht negativ sein')
      .optional(),
    /** Übliche Bestellmenge (Gebinde, Stück bzw. kg), auf die die Bezugskosten verteilt werden. */
    bestellmenge: z
      .number({ invalid_type_error: 'muss eine Zahl sein' })
      .positive('muss größer als 0 sein')
      .optional(),
  })
  .refine((e) => e.bezugskostenZehntelcent === undefined || e.bestellmenge !== undefined, {
    message: 'Bezugskosten brauchen eine übliche Bestellmenge',
    path: ['bestellmenge'],
  });
export type Einstand = z.infer<typeof EinstandSchema>;

const gemein = {
  id: idFeld,
  materialId: materialIdFeld,
  lieferant: lieferantFeld,
  artikelnummer: artikelnummerFeld,
  gueltigAb: gueltigAbFeld,
  einstand: EinstandSchema.optional(),
};

export const PreisSchema = z.discriminatedUnion(
  'basis',
  [
    z.object({
      ...gemein,
      basis: z.literal('einheit'),
      einheitName: einheitNameFeld,
      inhalt: inhaltFeld,
      staffel: staffelFeld,
    }),
    z.object({ ...gemein, basis: z.literal('je100kg'), betragZehntelcent: betragFeld }),
    z.object({ ...gemein, basis: z.literal('je1000'), betragZehntelcent: betragFeld }),
  ],
  {
    errorMap: (issue, ctx) => {
      if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
        return { message: 'Basis muss einheit, je100kg oder je1000 sein' };
      }
      if (issue.code === z.ZodIssueCode.invalid_type) {
        return { message: issue.received === undefined ? 'Pflichtfeld' : 'muss ein Objekt sein' };
      }
      return { message: ctx.defaultError };
    },
  },
);

export type Preis = z.infer<typeof PreisSchema>;
