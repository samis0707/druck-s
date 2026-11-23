import { z } from 'zod';
import { EINHEITEN } from '@druck/units';
import { DruckSchema } from './kalkulation-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

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

/** Freiwilliger Text: fehlt oder ist nicht leer (leere Felder lässt das Formular weg). */
function freiText(max: number) {
  return pflichtText(max).optional();
}

const zahlFeld = z.number({
  required_error: 'Pflichtfeld',
  invalid_type_error: 'muss eine Zahl sein',
});
const zahlPositiv = zahlFeld.gt(0, 'muss größer als 0 sein');
const ganzNichtNegativ = zahlFeld
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');
const ganzPositiv = zahlFeld.int('muss eine ganze Zahl sein').gt(0, 'muss größer als 0 sein');
const LISTE = { required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Liste sein' };

const ZUSTAND_FEHLER = { errorMap: () => ({ message: 'Zustand unbekannt' }) };

/**
 * Eigenschaft eines Artikels in einem von drei Zuständen (Konkretisieren, konzept-artikel 2a):
 * - fest: ein Wert („immer so“)
 * - waehlbar: erlaubte Werte, gewählt wird im Auftrag
 * - offen: noch nichts eingeschränkt
 * Jede Kopie darf nur einengen (offen → wählbar → fest), geprüft wird das nicht hier.
 */
function eigenschaft<T extends z.ZodTypeAny>(wert: T) {
  return z.discriminatedUnion(
    'zustand',
    [
      z.object({ zustand: z.literal('fest'), wert }),
      z.object({
        zustand: z.literal('waehlbar'),
        werte: z.array(wert, LISTE).min(1, 'mindestens ein Wert'),
      }),
      z.object({ zustand: z.literal('offen') }),
    ],
    ZUSTAND_FEHLER,
  );
}

export const FormatSchema = z.object({ breiteUm: ganzPositiv, hoeheUm: ganzPositiv });

/** Bereich erlaubter Seitenzahlen, z. B. 8–64 in Schritten von 4. */
export const SeitenBereichSchema = z
  .object({ von: ganzPositiv, bis: ganzPositiv, schritt: ganzPositiv.optional() })
  .superRefine((b, ctx) => {
    if (b.von > b.bis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bis'],
        message: '„bis“ ist kleiner als „von“',
      });
    }
  });

/** Seitenzahl (Umfang): fest, wählbar als Liste und/oder Bereich, oder offen. */
export const SeitenSchema = z.discriminatedUnion(
  'zustand',
  [
    z.object({ zustand: z.literal('fest'), wert: ganzPositiv }),
    // „Werte oder Bereich“ prüft das Teil (discriminatedUnion verträgt keine Verfeinerung)
    z.object({
      zustand: z.literal('waehlbar'),
      werte: z.array(ganzPositiv, LISTE).min(1, 'mindestens ein Wert').optional(),
      bereich: SeitenBereichSchema.optional(),
    }),
    z.object({ zustand: z.literal('offen') }),
  ],
  ZUSTAND_FEHLER,
);

/**
 * Woraus? – Sorte (Sorte + Grammatur; das Format sucht die Kalkulation über alle Lagerformate),
 * bestimmtes Lagermaterial, ein anderer Artikel (mehrstufig, wie eine Stückliste) oder nur
 * beschrieben (z. B. fertig gekauftes Teil ohne Lagermaterial).
 */
export const QuelleSchema = z.discriminatedUnion(
  'art',
  [
    z.object({ art: z.literal('sorte'), sorte: pflichtText(80), grammatur: zahlPositiv }),
    z.object({ art: z.literal('material'), materialId: idFeld }),
    z.object({ art: z.literal('artikel'), artikelId: idFeld }),
    z.object({ art: z.literal('beschrieben'), text: pflichtText(500) }),
  ],
  { errorMap: () => ({ message: 'Art unbekannt' }) },
);

export type Quelle = z.infer<typeof QuelleSchema>;

/** Bedruckt? – „ohne“ (nicht bedruckt) oder Druck vorne/hinten wie in der Kalkulation. */
export const DruckWertSchema = z.union([z.literal('ohne'), DruckSchema]);

export type DruckWert = z.infer<typeof DruckWertSchema>;

/** Wer macht es? – im Haus, Lieferant (Teil fertig gekauft) oder aus dem Lager (Bestand). */
export const WER = ['haus', 'lieferant', 'lager'] as const;
export type Wer = (typeof WER)[number];

/** Bund/Falz eines Produkts: links (Seiten nebeneinander) oder oben (untereinander). */
export const BUND = ['links', 'oben'] as const;
export type Bund = (typeof BUND)[number];

/** Merkmal „Name: Wert“, z. B. Ecken: gerundet R5; der Wert fest, wählbar oder offen. */
export const ArtikelMerkmalSchema = z.object({
  name: pflichtText(60),
  wert: eigenschaft(pflichtText(120)),
});

export type ArtikelMerkmal = z.infer<typeof ArtikelMerkmalSchema>;

function merkmaleEindeutig(
  merkmale: readonly ArtikelMerkmal[] | undefined,
  pfad: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const gesehen = new Set<string>();
  (merkmale ?? []).forEach((m, i) => {
    const schluessel = m.name.trim().toLowerCase();
    if (gesehen.has(schluessel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pfad, i, 'name'],
        message: `Merkmal doppelt: ${m.name}`,
      });
    }
    gesehen.add(schluessel);
  });
}

/**
 * Teil – etwas, das man anfassen kann (Umschlag, Inhalt, Beileger, Kuvert). Drei Fragen:
 * woraus, druck (bedruckt?), wer; dazu Stück je Produkt, Seiten (bei bedruckten Teilen),
 * Beschnitt, Lieferant und Anfragetext (bei „lieferant“), Merkmale des Teils, offenes Format
 * von Hand.
 */
export const ArtikelTeilSchema = z
  .object({
    id: idFeld,
    name: pflichtText(80),
    jeProdukt: ganzPositiv,
    woraus: eigenschaft(QuelleSchema),
    druck: eigenschaft(DruckWertSchema),
    seiten: SeitenSchema.optional(),
    beschnittUm: ganzNichtNegativ.optional(),
    wer: eigenschaft(z.enum(WER, { errorMap: () => ({ message: 'unbekannt' }) })),
    lieferantId: idFeld.optional(),
    anfrageText: freiText(2000),
    /** Variante beim Druck (T106), z. B. „10 Pass“ am Latex oder „Tüte“ am Objektdruck; gilt,
     *  wenn die Druckmaschine die Variante hat. */
    variante: freiText(40),
    /** Ware vom Kunden gestellt (T101): ohne Material, gerechnet je Stück; Text, was gestellt wird. */
    wareGestellt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    wareText: freiText(500),
    /** T148: kein Endschnitt nötig (z. B. wird ausgestanzt und ausgebrochen) – der Vorschlag
     *  plant für dieses Teil kein Schneiden auf Endformat ein. */
    ohneEndschnitt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    /** T155: vorhandene Stanzform (Reiter Werkzeuge) für dieses Teil – Schritte mit Werkzeug
     *  bekommen sie im Vorschlag; Nachbestellungen kennen so die Form (und ob sie bezahlt ist). */
    stanzformId: idFeld.optional(),
    merkmale: z.array(ArtikelMerkmalSchema, LISTE).optional(),
    /** Teil liegt um ein anderes (Umschlag um den Inhalt): für Bindungsregeln und Rücken. */
    liegtUm: idFeld.optional(),
    /** Offenes Format von Hand (z. B. Klappe 2 mm schmaler); sonst aus den Schritten. */
    offenesFormat: FormatSchema.optional(),
    /** T125: Lieferant liefert Bogen in diesem Format (z. B. Offset-Planobogen), die
     *  Verarbeitung (Schneiden, Bohren …) geschieht im Haus. Fehlt: Lieferant liefert fertig. */
    lieferform: z.object({ format: FormatSchema }).optional(),
  })
  .superRefine((t, ctx) => {
    merkmaleEindeutig(t.merkmale, ['merkmale'], ctx);
    if (
      t.seiten?.zustand === 'waehlbar' &&
      t.seiten.werte === undefined &&
      t.seiten.bereich === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seiten', 'werte'],
        message: 'Werte oder Bereich angeben',
      });
    }
  });

export type ArtikelTeil = z.infer<typeof ArtikelTeilSchema>;

/**
 * Artikel (konzept-artikel.md): Kopf, Endformat (gilt für alle Teile), Teile, Merkmale,
 * „auf Lager führen“ mit Losgröße, Herkunft der Kopie, Archiv. Prüft: Teil-IDs und
 * Merkmalnamen eindeutig, ein Teil nennt nicht den eigenen Artikel.
 */
export const ArtikelSchema = z
  .object({
    id: idFeld,
    titel: pflichtText(120),
    einheit: z.enum(EINHEITEN, { errorMap: () => ({ message: 'Einheit unbekannt' }) }),
    kunde: freiText(120),
    beschreibung: freiText(4000),
    endformat: eigenschaft(FormatSchema),
    /** Wo der Bund/Falz liegt: links (Standard, Breiten addieren) oder oben (Höhen addieren). */
    bund: z.enum(BUND, { errorMap: () => ({ message: 'unbekannt' }) }).optional(),
    teile: z.array(ArtikelTeilSchema, LISTE).min(1, 'mindestens ein Teil'),
    merkmale: z.array(ArtikelMerkmalSchema, LISTE).optional(),
    lager: z
      .object({ losgroesse: ganzPositiv, mindestbestand: ganzNichtNegativ.optional() })
      .optional(),
    entstandenAus: idFeld.optional(),
    archiviert: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    /** T186: im Shop und für Bots sichtbar (Schnittstelle /v1/shop); fehlt = nur intern. */
    freigegeben: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    /** T186: Text für Shop und Bots (die Beschreibung bleibt intern). */
    shopText: freiText(2000),
  })
  .superRefine((a, ctx) => {
    merkmaleEindeutig(a.merkmale, ['merkmale'], ctx);
    const ids = new Set<string>();
    a.teile.forEach((t, i) => {
      if (ids.has(t.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teile', i, 'id'],
          message: `Teil-ID doppelt: ${t.id}`,
        });
      }
      ids.add(t.id);
      if (
        t.liegtUm !== undefined &&
        (t.liegtUm === t.id || !a.teile.some((x) => x.id === t.liegtUm))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teile', i, 'liegtUm'],
          message:
            t.liegtUm === t.id
              ? 'Ein Teil kann nicht um sich selbst liegen'
              : `Teil ${t.liegtUm} nicht vorhanden`,
        });
      }
      if (artikelVerweise(t).includes(a.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teile', i, 'woraus'],
          message: 'Ein Teil kann nicht der eigene Artikel sein',
        });
      }
    });
  });

export type Artikel = z.infer<typeof ArtikelSchema>;

/** Artikel-IDs, die ein Teil als „Woraus?“ nennt (fest oder wählbar). */
export function artikelVerweise(t: Pick<ArtikelTeil, 'woraus'>): string[] {
  const quellen =
    t.woraus.zustand === 'fest'
      ? [t.woraus.wert]
      : t.woraus.zustand === 'waehlbar'
        ? t.woraus.werte
        : [];
  return quellen.flatMap((q) => (q.art === 'artikel' ? [q.artikelId] : []));
}

/** Datei aller Artikel. Prüft: IDs eindeutig, kein Artikel enthält sich über Teile selbst. */
export const ArtikelbestandSchema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: 'Version muss 1 sein' }) }),
    artikel: z.array(ArtikelSchema, LISTE),
  })
  .superRefine((d, ctx) => {
    const zahl = new Map<string, number>();
    for (const a of d.artikel) zahl.set(a.id, (zahl.get(a.id) ?? 0) + 1);
    const verweise = new Map(d.artikel.map((a) => [a.id, a.teile.flatMap(artikelVerweise)]));
    d.artikel.forEach((a, i) => {
      if ((zahl.get(a.id) ?? 0) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['artikel', i, 'id'],
          message: `ID doppelt: ${a.id}`,
        });
      }
      // Kreis über mehrere Stufen (A enthält B, B enthält A)
      const besucht = new Set<string>();
      const offen = [...(verweise.get(a.id) ?? [])];
      while (offen.length > 0) {
        const naechster = offen.pop();
        if (naechster === undefined || besucht.has(naechster)) continue;
        if (naechster === a.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['artikel', i, 'teile'],
            message: `${a.id} enthält sich über seine Teile selbst`,
          });
          break;
        }
        besucht.add(naechster);
        offen.push(...(verweise.get(naechster) ?? []));
      }
    });
  });

export type Artikelbestand = z.infer<typeof ArtikelbestandSchema>;

export function pruefeArtikelbestand(input: unknown): PruefErgebnis<Artikelbestand> {
  return ausZod(ArtikelbestandSchema.safeParse(input));
}
