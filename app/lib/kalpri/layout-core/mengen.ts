import { z } from 'zod';
import { menge, type Menge } from '@druck/units';
import { ausZod, type PruefErgebnis } from './pruefung';

/** Positive ganze Zahl (Nutzen je Bogen, Auflage in Stück). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Nicht negative ganze Zahl (Zuschuss in Bogen). */
const nichtNegativeZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/** Prozent 0–100, höchstens 2 Nachkommastellen. 1.15 * 100 ergibt 114.99999999999999,
 *  deshalb die Toleranz von 1e-9 (wie beim Volumen). */
const prozentFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .min(0, 'darf nicht negativ sein')
  .max(100, 'höchstens 100')
  .refine(
    (prozent) => Math.abs(Math.round(prozent * 100) - prozent * 100) < 1e-9,
    'höchstens 2 Nachkommastellen',
  );

/** Anzahl Farben je Bogenseite: ganze Zahl 0–8. */
const farbenFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein')
  .max(8, 'höchstens 8');

/**
 * Eingabe des Mengengerüsts: Nutzen je Bogen (aus dem Raster), Auflage in Stück, Zuschuss in
 * Bogen (fest plus Prozent) und die Farbigkeit je Bogenseite.
 */
export const MengenEingabeSchema = z
  .object({
    nutzenJeBogen: positiveZahl,
    auflage: positiveZahl,
    zuschuss: z.object({ bogen: nichtNegativeZahl, prozent: prozentFeld }),
    farbigkeit: z.object({ vorne: farbenFeld, hinten: farbenFeld }),
  })
  .superRefine((eingabe, ctx) => {
    if (eingabe.farbigkeit.vorne === 0 && eingabe.farbigkeit.hinten === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['farbigkeit'],
        message: 'Mindestens eine Seite muss bedruckt sein',
      });
    }
  });

export type MengenEingabe = z.infer<typeof MengenEingabeSchema>;

/** Eine bedruckte Bogenseite: Seite, Anzahl Farben und die Anzahl der Bogenseiten. */
export type Bogenseiten = {
  seite: 'vorne' | 'hinten';
  farben: number;
  anzahl: Menge<'Bogenseite'>;
};

/** Mengengerüst: ganze Bogen, Zuschuss in Bogen und Bogenseiten je Seite und Farbigkeit. */
export type Mengengeruest = {
  nutzenJeBogen: number;
  auflage: Menge<'Stueck'>;
  bogenNetto: Menge<'Bogen'>; // ceil(auflage / nutzenJeBogen)
  leereNutzen: number; // bogenNetto × nutzenJeBogen − auflage
  zuschuss: Menge<'Bogen'>; // bogen + ceil(bogenNetto × prozent / 100)
  bogenGesamt: Menge<'Bogen'>; // bogenNetto + zuschuss
  bogenseiten: Bogenseiten[]; // je bedruckter Seite eine Zeile, anzahl = bogenGesamt
  bogenseitenGesamt: Menge<'Bogenseite'>;
  farbigkeit: string; // "4/4", "4/0", "1/1"
};

/** Aufrunden mit ganzen Zahlen: ceil(a / b) = floor((a + b − 1) / b). */
function ceilGanz(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/**
 * Berechnet das Mengengerüst aus Nutzen je Bogen, Auflage, Zuschuss und Farbigkeit.
 * Mengen werden in ganzen Bogen gerechnet: leere Nutzen auf dem letzten Bogen kosten mit.
 */
export function berechneMengen(eingabe: unknown): PruefErgebnis<Mengengeruest> {
  const geprueft = ausZod(MengenEingabeSchema.safeParse(eingabe));
  if (!geprueft.ok) {
    return geprueft;
  }
  const e = geprueft.wert;

  const bogenNetto = ceilGanz(e.auflage, e.nutzenJeBogen);
  const leereNutzen = bogenNetto * e.nutzenJeBogen - e.auflage;

  // Prozent zuerst in Hundertstel: 100 × 0.07 ergibt 7.000000000000001 in JavaScript und
  // würde beim Aufrunden fälschlich einen Bogen zu viel ergeben.
  const prozentHundertstel = Math.round(e.zuschuss.prozent * 100);
  const zuschussProzent = ceilGanz(bogenNetto * prozentHundertstel, 10000);
  const zuschuss = e.zuschuss.bogen + zuschussProzent;
  const bogenGesamt = bogenNetto + zuschuss;

  const bogenseiten: Bogenseiten[] = [];
  if (e.farbigkeit.vorne > 0) {
    bogenseiten.push({
      seite: 'vorne',
      farben: e.farbigkeit.vorne,
      anzahl: menge(bogenGesamt, 'Bogenseite'),
    });
  }
  if (e.farbigkeit.hinten > 0) {
    bogenseiten.push({
      seite: 'hinten',
      farben: e.farbigkeit.hinten,
      anzahl: menge(bogenGesamt, 'Bogenseite'),
    });
  }

  return {
    ok: true,
    wert: {
      nutzenJeBogen: e.nutzenJeBogen,
      auflage: menge(e.auflage, 'Stueck'),
      bogenNetto: menge(bogenNetto, 'Bogen'),
      leereNutzen,
      zuschuss: menge(zuschuss, 'Bogen'),
      bogenGesamt: menge(bogenGesamt, 'Bogen'),
      bogenseiten,
      bogenseitenGesamt: menge(
        bogenseiten.reduce((summe, seite) => summe + seite.anzahl.wert, 0),
        'Bogenseite',
      ),
      farbigkeit: `${e.farbigkeit.vorne}/${e.farbigkeit.hinten}`,
    },
  };
}
