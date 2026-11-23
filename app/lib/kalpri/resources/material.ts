import { z } from 'zod';
import { ausZod, type PruefErgebnis } from './pruefung';

/** Erlaubte Zeichen einer Material-ID: A-Z a-z 0-9 _ - */
const ID_MUSTER = /^[A-Za-z0-9_-]+$/;

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(ID_MUSTER, 'nur Buchstaben, Ziffern, _ und -');

const sorteFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(120, 'höchstens 120 Zeichen');

const grammaturFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein')
  .max(2000, 'höchstens 2000');

const dickeFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Ganzzahlige Länge in µm, größer als 0. */
const laengeUmFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Rollenlänge in Metern, Nachkommastellen erlaubt. */
const laengeMFeld = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .gt(0, 'muss größer als 0 sein');

const laufrichtungFeld = z.enum(['SB', 'BB'], { message: 'Laufrichtung muss SB oder BB sein' });

const kategorieFeld = z
  .enum(['papier', 'kuvert', 'tuete', 'verpackung', 'sonstiges'], {
    message: 'Kategorie muss papier, kuvert, tuete, verpackung oder sonstiges sein',
  })
  .optional();

const oberflaecheFeld = z
  .enum(['ungestrichen', 'gestrichen', 'beschichtet'], {
    message: 'Oberfläche muss ungestrichen, gestrichen oder beschichtet sein',
  })
  .optional();

/** Volumen in cm³/g, > 0, höchstens 5, höchstens 2 Nachkommastellen.
 *  1.15 * 100 ergibt 114.99999999999999, deshalb die Toleranz von 1e-9. */
const volumenFeld = z
  .number({ invalid_type_error: 'muss eine Zahl sein' })
  .gt(0, 'muss größer als 0 sein')
  .max(5, 'höchstens 5')
  .refine(
    (volumen) => Math.abs(Math.round(volumen * 100) - volumen * 100) < 1e-9,
    'höchstens 2 Nachkommastellen',
  )
  .optional();

/** GTIN/EAN: genau 8, 12, 13 oder 14 Ziffern, ohne Prüfziffern-Rechnung. */
const gtinFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/, 'GTIN muss 8, 12, 13 oder 14 Ziffern haben')
  .optional();

const lieferantFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(80, 'höchstens 80 Zeichen');

/** Materialgruppe (Lager.gruppen bzw. STANDARD_GRUPPEN), z. B. „matt“ (Nutzer 30.10.). */
const gruppeFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .optional();

const nummerFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(60, 'höchstens 60 Zeichen');

const artikelnummerSchema = z.object({
  lieferant: lieferantFeld,
  nummer: nummerFeld,
  url: z
    .string({ invalid_type_error: 'muss ein Text sein' })
    .trim()
    .url('muss eine Webadresse sein')
    .optional(),
});

const artikelnummernFeld = z.array(artikelnummerSchema).optional();

/** Tag-IDs aus dem kontrollierten Katalog (lager.tags, T69). */
const tagsFeld = z
  .array(
    z
      .string({ invalid_type_error: 'muss ein Text sein' })
      .trim()
      .min(1, 'Pflichtfeld')
      .regex(/^[A-Za-z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -'),
  )
  .optional();

/** Aufschlag auf den Preis des Materials (z. B. Toner + 20 %), zählt zu den Kosten der Zeile. */
/** T180: gewählte Aufschlag-Art (Liste im Lager); ein eigener `aufschlagProzent` geht vor. */
const aufschlagArtIdFeld = z
  .string()
  .regex(/^AA-\d{4}$/, 'Aufschlag-Art im Format AA-0001')
  .optional();
const aufschlagProzentFeld = z
  .number({ invalid_type_error: 'muss eine Zahl sein' })
  .min(0, 'darf nicht negativ sein')
  .max(1000, 'höchstens 1000')
  .optional();
/** Gewinnaufschlag der Kalkulation zusätzlich zum Aufschlag am Material (Standard: ja). */
const gewinnZusaetzlichFeld = z
  .boolean({ invalid_type_error: 'muss ja oder nein sein' })
  .optional();
const aufschlagFestFeld = z
  .number({ invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein')
  .optional();

/**
 * Packung beim Einkauf, z. B. Ries mit 250 Bogen. anbruch = false: es werden nur ganze Packungen
 * verbraucht (die Kalkulation rundet dann immer auf); fehlt: Anbruch erlaubt.
 */
export const PackungSchema = z.object({
  einheit: z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(40, 'höchstens 40 Zeichen'),
  inhalt: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .gt(0, 'muss größer als 0 sein'),
  anbruch: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});

export type Packung = z.infer<typeof PackungSchema>;

const bogenSchema = z.object({
  id: idFeld,
  sorte: sorteFeld,
  grammatur: grammaturFeld,
  dickeUm: dickeFeld.optional(),
  kategorie: kategorieFeld,
  oberflaeche: oberflaecheFeld,
  volumen: volumenFeld,
  form: z.literal('Bogen'),
  breiteUm: laengeUmFeld,
  hoeheUm: laengeUmFeld,
  laufrichtung: laufrichtungFeld.optional(),
  /** Druckbogen für die Maschine (T103), z. B. Juwel 65 × 92 → 32,4 × 45,8 cm vorgeschnitten;
   *  gilt in der Kalkulation, wenn das Teil keinen eigenen Druckbogen hat. */
  druckbogen: z.object({ breiteUm: laengeUmFeld, hoeheUm: laengeUmFeld }).optional(),
  gtin: gtinFeld,
  artikelnummern: artikelnummernFeld,
  aufschlagProzent: aufschlagProzentFeld,
  aufschlagArtId: aufschlagArtIdFeld,
  aufschlagFestZehntelcent: aufschlagFestFeld,
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
  packung: PackungSchema.optional(),
  gruppeId: gruppeFeld,
  tags: tagsFeld,
});

const rolleSchema = z.object({
  id: idFeld,
  sorte: sorteFeld,
  grammatur: grammaturFeld,
  dickeUm: dickeFeld.optional(),
  kategorie: kategorieFeld,
  oberflaeche: oberflaecheFeld,
  volumen: volumenFeld,
  form: z.literal('Rolle'),
  breiteUm: laengeUmFeld,
  laengeM: laengeMFeld,
  kernUm: laengeUmFeld.optional(),
  gtin: gtinFeld,
  artikelnummern: artikelnummernFeld,
  aufschlagProzent: aufschlagProzentFeld,
  aufschlagArtId: aufschlagArtIdFeld,
  aufschlagFestZehntelcent: aufschlagFestFeld,
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
  packung: PackungSchema.optional(),
  gruppeId: gruppeFeld,
  tags: tagsFeld,
});

const stueckSchema = z.object({
  id: idFeld,
  sorte: sorteFeld,
  grammatur: grammaturFeld.optional(),
  dickeUm: dickeFeld.optional(),
  kategorie: kategorieFeld,
  oberflaeche: oberflaecheFeld,
  volumen: volumenFeld,
  form: z.literal('Stueck'),
  breiteUm: laengeUmFeld,
  hoeheUm: laengeUmFeld,
  gtin: gtinFeld,
  artikelnummern: artikelnummernFeld,
  aufschlagProzent: aufschlagProzentFeld,
  aufschlagArtId: aufschlagArtIdFeld,
  aufschlagFestZehntelcent: aufschlagFestFeld,
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
  packung: PackungSchema.optional(),
  gruppeId: gruppeFeld,
  tags: tagsFeld,
});

/** Einheiten für Verbrauchsmaterial (T102): Tinte in ml oder l, Pulver/Draht in g oder kg. */
export const MENGEN_EINHEITEN = ['ml', 'l', 'g', 'kg', 'm', 'Stueck'] as const;
export type MengenEinheit = (typeof MENGEN_EINHEITEN)[number];

/**
 * Verbrauchsmaterial (T102): ohne Maße, mit Einheit (ml, l, g, kg, m, Stück), z. B. Tinte HP 831 in
 * ml mit Packung „Kartusche“ zu 775 ml. Wird über den Verbrauch eines Schritts gerechnet.
 */
const mengeSchema = z.object({
  id: idFeld,
  sorte: sorteFeld,
  kategorie: kategorieFeld,
  form: z.literal('Menge'),
  // wie bei Stück erlaubt, für Verbrauchsmaterial meist leer (gleiche Felder über alle Formen)
  grammatur: grammaturFeld.optional(),
  dickeUm: dickeFeld.optional(),
  oberflaeche: oberflaecheFeld,
  volumen: volumenFeld,
  einheit: z.enum(MENGEN_EINHEITEN, {
    message: 'Einheit muss ml, l, g, kg, m oder Stueck sein',
  }),
  gtin: gtinFeld,
  artikelnummern: artikelnummernFeld,
  aufschlagProzent: aufschlagProzentFeld,
  aufschlagArtId: aufschlagArtIdFeld,
  aufschlagFestZehntelcent: aufschlagFestFeld,
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
  packung: PackungSchema.optional(),
  gruppeId: gruppeFeld,
  tags: tagsFeld,
});

/** Anzeige der Einheit: ml, l, g, kg, „Stück“. */
export function mengenEinheitText(e: MengenEinheit): string {
  return e === 'Stueck' ? 'Stück' : e;
}

/** Einheit eines Materials für Mengen und Preise: Menge → seine Einheit, Rolle → m², sonst
 *  Bogen bzw. Stück. */
export function materialEinheitText(m: Material): string {
  if (m.form === 'Menge') return mengenEinheitText(m.einheit);
  if (m.form === 'Rolle') return 'm²';
  return m.form === 'Bogen' ? 'Bogen' : 'Stück';
}

export const MaterialSchema = z.discriminatedUnion(
  'form',
  [bogenSchema, rolleSchema, stueckSchema, mengeSchema],
  {
    errorMap: (issue, ctx) => {
      if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
        return { message: 'Form muss Bogen, Rolle oder Stueck sein' };
      }
      if (issue.code === z.ZodIssueCode.invalid_type) {
        return { message: issue.received === 'undefined' ? 'Pflichtfeld' : 'muss ein Objekt sein' };
      }
      return { message: ctx.defaultError };
    },
  },
);

export type Material = z.infer<typeof MaterialSchema>;

export function pruefeMaterial(input: unknown): PruefErgebnis<Material> {
  const r = ausZod(MaterialSchema.safeParse(input));
  if (!r.ok) return r;
  const meldung = druckbogenMeldung(r.wert);
  return meldung === null ? r : { ok: false, fehler: [{ pfad: 'druckbogen', meldung }] };
}

/** Druckbogen eines Bogens (T103) muss in den Bogen passen (auch gedreht); sonst Meldung. */
export function druckbogenMeldung(m: Material): string | null {
  if (m.form !== 'Bogen' || m.druckbogen === undefined) return null;
  const d = m.druckbogen;
  const passt =
    (d.breiteUm <= m.breiteUm && d.hoeheUm <= m.hoeheUm) ||
    (d.breiteUm <= m.hoeheUm && d.hoeheUm <= m.breiteUm);
  return passt ? null : 'Druckbogen ist größer als der Bogen';
}
