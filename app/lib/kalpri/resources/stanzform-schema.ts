import { z } from 'zod/v3';
import { LeistungsaenderungSchema } from './auspraegung-schema';

/** Erlaubte Zeichen einer Stanzform-ID: A-Z a-z 0-9 _ - */
const ID_MUSTER = /^[A-Za-z0-9_-]+$/;

const idFeld = z
  .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
  .trim()
  .min(1, 'Pflichtfeld')
  .max(40, 'höchstens 40 Zeichen')
  .regex(ID_MUSTER, 'nur Buchstaben, Ziffern, _ und -');

/** Pflichttext mit Höchstlänge. */
function pflichtText(max: number) {
  return z
    .string({ required_error: 'Pflichtfeld', invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'Pflichtfeld')
    .max(max, `höchstens ${max} Zeichen`);
}

/** Freiwilliger Text: fehlt oder ist nicht leer (leere Felder lässt das Formular weg). */
function freiText(max: number) {
  return z
    .string({ invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'darf nicht leer sein')
    .max(max, `höchstens ${max} Zeichen`)
    .optional();
}

/** Ganze Zahl größer als 0 (µm oder Anzahl). */
const positiveZahl = z
  .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
  .int('muss eine ganze Zahl sein')
  .gt(0, 'muss größer als 0 sein');

/** Format in µm: Breite = Anlage- bzw. Greiferkante. */
const FormatSchema = z.object({ breiteUm: positiveZahl, hoeheUm: positiveZahl });

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

const datumFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .refine(istEchtesDatum, 'Datum im Format JJJJ-MM-TT')
  .optional();

/** Teilung des Druckbogens: Spalten entlang der Greiferkante × Zeilen, Abfall 0 = Einzelschnitt. */
export const StanzTeilungSchema = z.object({
  spalten: positiveZahl.max(20, 'höchstens 20'),
  zeilen: positiveZahl.max(20, 'höchstens 20'),
  abfallUm: z
    .number({ required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Zahl sein' })
    .int('muss eine ganze Zahl sein')
    .min(0, 'darf nicht negativ sein'),
});

export type StanzTeilung = z.infer<typeof StanzTeilungSchema>;

/** Woher der Tiegelbogen kommt: Druckbogen und (falls geteilt) die Teilung. */
export const StanzHerkunftSchema = z.object({
  druckbogen: FormatSchema,
  teilung: StanzTeilungSchema.optional(),
});

export type StanzHerkunft = z.infer<typeof StanzHerkunftSchema>;

const artFeld = z
  .enum(['stanzen', 'rillen', 'perforieren', 'praegen', 'kombiniert'], {
    message: 'Art muss stanzen, rillen, perforieren, praegen oder kombiniert sein',
  })
  .optional();

/** Höchstlänge eines Bildes als Daten-URL (etwa 300 KB Bilddaten). */
export const BILD_MAX_ZEICHEN = 400_000;

/** Foto/Bild zur Stanzform als Daten-URL (PNG oder JPEG), nur zur Anschauung. */
const bildFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/, 'Bild muss PNG oder JPEG sein')
  .max(BILD_MAX_ZEICHEN, 'Bild ist zu groß')
  .optional();

/** Passt das Format a (in einer der beiden Lagen) in das Format b? */
export function passtIn(
  a: { breiteUm: number; hoeheUm: number },
  b: { breiteUm: number; hoeheUm: number },
): boolean {
  return (
    (a.breiteUm <= b.breiteUm && a.hoeheUm <= b.hoeheUm) ||
    (a.breiteUm <= b.hoeheUm && a.hoeheUm <= b.breiteUm)
  );
}

/**
 * T185: Datei zur Stanzform (Stanzkontur als .ai/.svg/.dxf/.pdf, Fotos …). Der Inhalt liegt in der
 * Datenbank (Tabelle dateien, Schlüssel = SHA-256 des Inhalts); hier steht nur der Verweis.
 * Eine Datei hat Fassungen: neue Fassung = neuer Eintrag hinten, alte bleiben abrufbar.
 */
export const DateiFassungSchema = z
  .object({
    dateiId: z
      .string({ required_error: 'Datei fehlt' })
      .regex(/^[0-9a-f]{64}$/, 'Datei-Kennung ungültig'),
    name: pflichtText(200),
    typ: z.string().trim().max(120).optional(),
    groesse: z.number().int().min(0),
    am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT'),
    notiz: z.string().trim().max(200).optional(),
  })
  .strict();
export type DateiFassung = z.infer<typeof DateiFassungSchema>;

export const StanzAnhangSchema = z
  .object({
    titel: pflichtText(120),
    /** T186: aktuelle Fassung darf über /v1/shop (Shop, Bots) ausgeliefert werden. */
    freigegeben: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    fassungen: z.array(DateiFassungSchema).min(1, 'mindestens eine Fassung').max(50),
  })
  .strict();
export type StanzAnhang = z.infer<typeof StanzAnhangSchema>;

/**
 * Stanzform im Lager (Werkzeug). Sicher bekannt ist die Zahl der Nutzen je Form; die Lage der
 * Nutzen ist frei geformt und wird hier nicht gespeichert.
 * tiegelbogen = der Bogen, der in den Tiegel geht (Breite = Anlagekante): der Druckbogen
 * selbst oder ein Teil davon.
 */
export const LagerStanzformSchema = z
  .object({
    id: idFeld,
    name: pflichtText(120),
    nutzen: positiveZahl.max(1000, 'höchstens 1000'),
    formnummer: freiText(40),
    art: artFeld,
    tiegelbogen: FormatSchema.optional(),
    herkunft: StanzHerkunftSchema.optional(),
    endformat: FormatSchema.optional(),
    beschreibung: freiText(2000),
    kunde: freiText(120),
    lagerort: freiText(80),
    hersteller: freiText(80),
    /** T185: Hersteller als Partner (LF-…); der Text „hersteller“ bleibt als Anzeige. */
    herstellerId: z.string().trim().max(20).optional(),
    angeschafftAm: datumFeld,
    /** T149: Anschaffungspreis in Zehntelcent; „bezahlt“ = das Werkzeug ist schon berechnet –
     *  die Kalkulation setzt dann keine Werkzeugkosten mehr an (je Kalkulation umstellbar). */
    anschaffungZehntelcent: z
      .number({ invalid_type_error: 'muss eine Zahl sein' })
      .int('muss eine ganze Zahl sein')
      .min(0, 'darf nicht negativ sein')
      .optional(),
    bezahlt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    bild: bildFeld,
    /** Foto des eingerichteten Schließrahmens mit Form (Lage, Ausbrechhilfen, Zurichtung). */
    bildEingerichtet: bildFeld,
    leistungsaenderung: LeistungsaenderungSchema.optional(),
    /** T185: Dateien (Stanzkontur, Druckdaten, Fotos) mit Fassungen */
    anhaenge: z.array(StanzAnhangSchema).max(30, 'höchstens 30 Dateien').optional(),
  })
  .superRefine((form, ctx) => {
    if (form.tiegelbogen && form.herkunft && !passtIn(form.tiegelbogen, form.herkunft.druckbogen)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tiegelbogen'],
        message: 'Tiegelbogen ist größer als der Druckbogen',
      });
    }
    if (form.endformat && form.tiegelbogen && !passtIn(form.endformat, form.tiegelbogen)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endformat'],
        message: 'Endformat ist größer als der Tiegelbogen',
      });
    }
  });

export type LagerStanzform = z.infer<typeof LagerStanzformSchema>;
