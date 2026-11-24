import { z } from 'zod/v3';
import { EINHEITEN, GANZZAHLIGE_EINHEITEN } from '@druck/units';
import { AuspraegungSchema } from './auspraegung-schema';
import { KostenstelleSchema } from './kostenstelle-schema';
import { LieferantSchema, alteLieferantenfelder } from './lieferant-schema';
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
  return z
    .string({ invalid_type_error: 'muss ein Text sein' })
    .trim()
    .min(1, 'darf nicht leer sein')
    .max(max, `höchstens ${max} Zeichen`)
    .optional();
}

const einheitFeld = z.enum(EINHEITEN, {
  errorMap: (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
      return { message: 'Pflichtfeld' };
    }
    if (
      issue.code === z.ZodIssueCode.invalid_enum_value ||
      issue.code === z.ZodIssueCode.invalid_type
    ) {
      return { message: 'Einheit unbekannt' };
    }
    return { message: ctx.defaultError };
  },
});

const versionFeld = z.literal(1, {
  errorMap: (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_literal) {
      return { message: issue.received === undefined ? 'Pflichtfeld' : 'Version muss 1 sein' };
    }
    return { message: ctx.defaultError };
  },
});

const LISTE = { required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Liste sein' };

const zahlFeld = z.number({
  required_error: 'Pflichtfeld',
  invalid_type_error: 'muss eine Zahl sein',
});

/** Ganze Zahl ≥ 0 (µm, ms, Zehntelcent, Bogen). */
const ganzNichtNegativ = zahlFeld
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');

/** Ganze Zahl > 0. */
const ganzPositiv = zahlFeld.int('muss eine ganze Zahl sein').gt(0, 'muss größer als 0 sein');

const zahlPositiv = zahlFeld.gt(0, 'muss größer als 0 sein');

/** T164: „gültig ab“ eines Klickpreises (JJJJ-MM-TT); fehlt = gilt seit jeher. */
const gueltigAbFeld = z
  .string({ invalid_type_error: 'muss ein Text sein' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
  .refine((t) => {
    const [j, m, d] = t.split('-').map(Number);
    const x = new Date(Date.UTC(j!, m! - 1, d!));
    return x.getUTCFullYear() === j && x.getUTCMonth() === m! - 1 && x.getUTCDate() === d;
  }, 'Datum im Format JJJJ-MM-TT')
  .optional();

/**
 * Wann der Schritt im Arbeitsweg eines Artikels vorkommt (fehlt: nur von Hand in der
 * Kalkulation):
 * - druck: bei jedem bedruckten Teil
 * - schnitt: Schneiden nach dem Druck bei jedem Teil aus Papier, das im Haus entsteht
 *   (Vorschneiden kommt in der Kalkulation bei Bedarf dazu)
 * - merkmal: wenn ein Merkmal (am Teil oder am ganzen Produkt) einen der Werte hat; ein Wert
 *   passt, wenn der Wert des Merkmals so beginnt (ohne Groß-/Kleinschreibung: „gerundet“ passt
 *   zu „gerundet R5“); ohne Werte: bei jedem Wert
 */
/** T134: Erzeugnisse – was zwischen den Tätigkeiten weitergegeben wird („aus … wird …“). */
export const ERZEUGNISSE = [
  'rohbogen',
  'druckbogen',
  'nutzen',
  'falzbogen',
  'satz',
  'exemplar',
  'paket',
  'ware',
] as const;
export type Erzeugnis = (typeof ERZEUGNISSE)[number];

export const ImWegSchema = z.discriminatedUnion(
  'art',
  [
    z.object({ art: z.literal('druck') }),
    z.object({ art: z.literal('schnitt') }),
    /** T108: einmal je Auftrag (Datencheck, Auftrag anlegen), unabhängig von Teilen. */
    z.object({ art: z.literal('auftrag') }),
    z.object({
      art: z.literal('merkmal'),
      name: pflichtText(60),
      werte: z.array(pflichtText(120), LISTE).optional(),
    }),
  ],
  { errorMap: () => ({ message: 'Art unbekannt' }) },
);

export type ImWeg = z.infer<typeof ImWegSchema>;

/** Was ein Schritt im Arbeitsweg zählt (wie „Menge aus“ in der Kalkulation). */
export const WEG_MENGEN = [
  'druckbogen',
  'nutzen',
  'stapel',
  'endschnitt',
  'produkt',
  /** T111: Blätter je Produkt des Teils, einmal je Auftrag (z. B. Stanze aufbauen je Register) */
  'blaetter',
] as const;
export type WegMengeWert = (typeof WEG_MENGEN)[number];

/**
 * Menge im Arbeitsweg: Zahl aus dem Papierweg des Teils × Faktor, oder je Exemplar des
 * Produkts × Faktor ÷ Teiler; gestapelt bei Schnitten: Streifen aufeinander; jeAnzahl: dazu ×
 * die erste Zahl im Wert des Merkmals (z. B. „Rillen: 2“ → × 2, „Bohren: 4-fach, Ø 6 mm“ → × 4).
 */
export const WegMengeSchema = z.object({
  wert: z.enum(WEG_MENGEN, { errorMap: () => ({ message: 'Menge unbekannt' }) }),
  faktor: zahlPositiv.optional(),
  teiler: zahlPositiv.optional(),
  gestapelt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  jeAnzahl: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});

export type WegMenge = z.infer<typeof WegMengeSchema>;

/** Regel des Schritts für die Seiten der bedruckten Teile, z. B. Rückstichheftung: Vielfaches
 *  von 4, 8–64 Seiten. Gilt, sobald der Schritt im Arbeitsweg feststeht. */
export const SeitenRegelSchema = z
  .object({
    vielfaches: ganzPositiv.optional(),
    min: ganzPositiv.optional(),
    max: ganzPositiv.optional(),
    /** Erlaubte Seiten eines Teils, das um ein anderes liegt (Umschlag), z. B. 4 und 6 (mit
     *  Klappe) bei Rückstich; fehlt: es gilt dieselbe Regel wie für den Inhalt. */
    umschlag: z.array(ganzPositiv, LISTE).min(1, 'mindestens ein Wert').optional(),
  })
  .superRefine((r, ctx) => {
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: '„mindestens“ ist größer als „höchstens“',
      });
    }
  });

export type SeitenRegel = z.infer<typeof SeitenRegelSchema>;

/**
 * Wie weit der Schritt das Format öffnet (Falzen, Binden): so viele Seitenfelder liegen offen
 * nebeneinander quer zum Bund/Falz („seiten“: Seiten ÷ 2, z. B. Wickelfalz 6 Seiten → 3) und
 * untereinander (Kreuzbruch: 2); bogen: die Seiten verteilen sich auf mehrere Bogen je Exemplar
 * (Bindung: je Bogen Felder × 2 Seiten; ein Umschlag bleibt ein Bogen mit Seiten ÷ 2 Feldern).
 * Der Bund liegt links (Breiten addieren) oder oben (Höhen addieren), siehe Artikel.
 * ruecken: der Umschlag bekommt den Rücken der Inhaltsseiten (Klebebindung).
 */
export const OeffnetSchema = z.object({
  nebeneinander: z.union([ganzPositiv, z.literal('seiten')], {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union
        ? { message: 'Zahl oder „Seiten ÷ 2“' }
        : { message: ctx.defaultError },
  }),
  untereinander: ganzPositiv.optional(),
  bogen: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  /** Rücken bilden (Klebebindung): die Dicke der Inhaltsseiten kommt zum offenen Umschlag. */
  ruecken: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});

export type Oeffnet = z.infer<typeof OeffnetSchema>;

/**
 * Arbeitsschritt im Katalog („was“ gemacht wird), z. B. Rillen, Bohren, Mailing falten.
 * Einmal angelegt, kann er an mehreren Arbeitsplätzen hängen („wer“ es kann).
 * werkzeug = true: der Schritt braucht ein Werkzeug (z. B. Stanzform).
 * imWeg, menge, seiten: wann und mit welcher Menge der Schritt im Arbeitsweg eines Artikels
 * vorkommt und welche Seitenzahlen er erlaubt (Merkmale → Arbeitsschritte, Regeln am Schritt);
 * oeffnet: wie weit er das Format öffnet (offenes Format = Nutzen auf dem Druckbogen).
 */
export const ArbeitsschrittSchema = z.object({
  id: idFeld,
  name: pflichtText(80),
  einheit: einheitFeld,
  werkzeug: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  beschreibung: freiText(500),
  imWeg: ImWegSchema.optional(),
  menge: WegMengeSchema.optional(),
  seiten: SeitenRegelSchema.optional(),
  oeffnet: OeffnetSchema.optional(),
  /** In der Produktbeschreibung der Kalkulation zeigen (T95); fehlt: ja, außer bei Druck und
   *  Schneiden („Im Arbeitsweg“). */
  inBeschreibung: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  /** T111: der Schritt schneidet die Nutzen selbst aus (Stanzen) – der gerade Endschnitt des
   *  Teils fällt dann weg. */
  schneidetAus: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  /** T134: Zustandswechsel der Tätigkeit (AGENTS Regel 12) – was hineingeht (eins davon) und
   *  was herauskommt. Fehlt es, wird es aus „im Arbeitsweg“ und der Menge abgeleitet
   *  (schrittErzeugnis). Dient der Prüfung der Reihenfolge; rechnet nicht. */
  aus: z
    .array(z.enum(ERZEUGNISSE, { errorMap: () => ({ message: 'unbekannt' }) }), LISTE)
    .optional(),
  wird: z.enum(ERZEUGNISSE, { errorMap: () => ({ message: 'unbekannt' }) }).optional(),
});

export type Arbeitsschritt = z.infer<typeof ArbeitsschrittSchema>;

const FormatSchema = z.object({ breiteUm: ganzPositiv, hoeheUm: ganzPositiv });

/** Grenzen eines Arbeitsplatzes oder eines Schritts daran (alles freiwillig). */
/** Was ein Platz annimmt: einzelne Bogen, Stapel, Rolle, Stück (Objekte, fertige Teile). */
export const ANNAHMEN = ['bogen', 'stapel', 'rolle', 'stueck'] as const;
export type Annahme = (typeof ANNAHMEN)[number];

export const GrenzenSchema = z
  .object({
    /** Was der Platz annimmt; fehlt es, gilt `annahmeVon` (aus den übrigen Grenzen). */
    annahme: z
      .array(z.enum(ANNAHMEN, { errorMap: () => ({ message: 'unbekannt' }) }), LISTE)
      .optional(),
    formatMin: FormatSchema.optional(),
    formatMax: FormatSchema.optional(),
    grammaturMin: ganzPositiv.optional(),
    grammaturMax: ganzPositiv.optional(),
    dickeMaxUm: ganzPositiv.optional(),
    einlegehoeheUm: ganzPositiv.optional(),
    /** Nicht bedruckbarer Rand je Seite (Druckmaschinen), z. B. 4 mm. */
    randUm: ganzNichtNegativ.optional(),
    /** Abstand zwischen den Nutzen auf der Rolle (T105), z. B. 10 mm. */
    abstandUm: ganzNichtNegativ.optional(),
    /** T121: höchstens so viele Nutzen je Druckbogen, z. B. Lochen im Finisher: 1 (nur, wenn der
     *  Druckbogen das Endformat ist). Mehr Nutzen → Maschine ungeeignet für diesen Schritt. */
    nutzenMax: ganzPositiv.optional(),
    /** T143: Stationen zum Zusammentragen (Türme × Fächer), z. B. Duplo 20: so viele Blatt je
     *  Exemplar in einem Durchgang. Mehr Blatt → mehrere Durchgänge (Hinweis, kein Verbot). */
    stationen: ganzPositiv.optional(),
    /** T144: Fassung in Stück/Exemplaren je Durchgang (Paket, Schnittstapel, Leimstapel), z. B.
     *  250 je Paket. Geht dem festen Teiler der Tätigkeit im Katalog vor. */
    stueckJeDurchgang: ganzPositiv.optional(),
    /** T144: Fächer/Zuführungen (Druckmaschine): so viele Papiere ohne Umlegen; die Bogen
     *  laufen nacheinander – anders als Stationen, die gleichzeitig ziehen. */
    faecher: ganzPositiv.optional(),
  })
  .superRefine((g, ctx) => {
    if (
      g.formatMin &&
      g.formatMax &&
      (g.formatMin.breiteUm > g.formatMax.breiteUm || g.formatMin.hoeheUm > g.formatMax.hoeheUm)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['formatMin'],
        message: 'Mindestformat ist größer als das Höchstformat',
      });
    }
    if (
      g.grammaturMin !== undefined &&
      g.grammaturMax !== undefined &&
      g.grammaturMin > g.grammaturMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grammaturMin'],
        message: 'Mindestgrammatur ist größer als die Höchstgrammatur',
      });
    }
  });

export type Grenzen = z.infer<typeof GrenzenSchema>;

/**
 * Was der Platz annimmt: die Angabe `annahme`, sonst geschlossen aus den Grenzen – mit
 * Einlegehöhe Stapel, mit Format, Grammatur oder Dicke Bogen; ohne Grenzen nichts (= offen).
 */
export function annahmeVon(g: Grenzen | undefined): Annahme[] {
  if (!g) return [];
  if (g.annahme !== undefined) return [...g.annahme];
  if (g.einlegehoeheUm !== undefined) return ['stapel'];
  const bogen =
    g.formatMin !== undefined ||
    g.formatMax !== undefined ||
    g.grammaturMin !== undefined ||
    g.grammaturMax !== undefined ||
    g.dickeMaxUm !== undefined;
  return bogen ? ['bogen'] : [];
}

/**
 * Rüstbaustein: dauerMs × Anzahl. Anzahl = Menge in der Einheit „je“, bei „alle“ je angefangene
 * „alle“ Einheiten (z. B. 2 min je 150 Bogen). je = 'Auftrag' → einmal.
 */
export const RuestbausteinSchema = z.object({
  name: pflichtText(60),
  dauerMs: ganzNichtNegativ,
  je: einheitFeld,
  alle: ganzPositiv.optional(),
});

export type Ruestbaustein = z.infer<typeof RuestbausteinSchema>;

/** Leistung eines Schritts am Platz: menge Einheiten des Schritts in dauerMs. */
const LeistungSchema = z.object({
  menge: zahlFeld.gt(0, 'muss größer als 0 sein'),
  dauerMs: ganzPositiv,
});

/** Zuschuss in der Einheit des Schritts: fest und/oder Prozent der Menge. */
const ZuschussSchema = z.object({
  fest: ganzNichtNegativ.optional(),
  prozent: zahlFeld.min(0, 'darf nicht negativ sein').max(100, 'höchstens 100').optional(),
});

/**
 * Variante eines Schritts am Platz zur Auswahl im Arbeitsgang (früher „Leistungsprofil"), z. B.
 * „2-fach DIN" beim Lochen oder „6 Pass" beim Großformatdruck. Sie kann eine eigene Leistung
 * (Menge und Zeit), Rüstzeit (je Auftrag), Zuschuss, Beschreibung und Angaben haben; was fehlt,
 * erbt sie vom Schritt. Eigene Rüstzeit und eigener Zuschuss ersetzen die des Schritts.
 */
const LeistungsprofilSchema = z
  .object({
    name: pflichtText(40),
    menge: zahlFeld.gt(0, 'muss größer als 0 sein').optional(),
    dauerMs: ganzPositiv.optional(),
    beschreibung: freiText(200),
    angaben: z.array(pflichtText(80), LISTE).optional(),
    ruestenMs: ganzNichtNegativ.optional(),
    zuschuss: ZuschussSchema.optional(),
    /** Faktor der Menge mit dieser Variante, z. B. 2 Hübe je Stapel bei 4-fach auf einer
     *  2-Spindel-Bohrmaschine. Fehlt er, vervielfacht die Variante die Menge nicht. */
    faktor: zahlPositiv.optional(),
    /** T124: Standard – passen mehrere Varianten zum Merkmal-Wert, gilt diese. */
    standard: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.menge !== undefined && v.dauerMs === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dauerMs'], message: 'Zeit fehlt' });
    }
    if (v.menge === undefined && v.dauerMs !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['menge'], message: 'Menge fehlt' });
    }
  });

export type Variante = z.infer<typeof LeistungsprofilSchema>;

/**
 * Ein Arbeitsschritt am Arbeitsplatz mit Leistung (Standard; fehlt → rechnet nicht), weiteren
 * Leistungsprofilen, Rüsten, Zuschuss, Grenzen.
 */
/** Farbe einer bedruckten Seite für den Klickpreis. */
export const KLICK_FARBEN = ['farbig', 'schwarz', 'sonderfarbe'] as const;
export type KlickFarbe = (typeof KLICK_FARBEN)[number];

const deckungFeld = zahlFeld.gt(0, 'muss größer als 0 sein').max(100, 'höchstens 100');

/**
 * Toner zusätzlich zum Klick (Service-Klick ohne Toner, z. B. Sonderfarbe): Kartuschenpreis und
 * Reichweite in Seiten A4 bei `bezugDeckungProzent` (Datenblatt, ohne Angabe 5 %). Daraus die
 * Kosten je m² bei voller Deckung. `standardDeckungProzent` gilt, wenn die Kalkulation keine
 * Deckung angibt (ohne Angabe: 100 %).
 */
export const TonerSchema = z.object({
  kartuscheZehntelcent: ganzPositiv,
  reichweiteSeiten: ganzPositiv,
  bezugDeckungProzent: deckungFeld.optional(),
  standardDeckungProzent: deckungFeld.optional(),
});

export type Toner = z.infer<typeof TonerSchema>;

/** Klickpreis je bedruckte Seite: Farbe, bis zu welchem Bogenformat (fehlt: jedes), Preis;
 *  optional Toner extra (nach Fläche und Deckung). */
export const KlickpreisSchema = z.object({
  farbe: z.enum(KLICK_FARBEN, { errorMap: () => ({ message: 'Farbe unbekannt' }) }),
  bisFormat: FormatSchema.optional(),
  zehntelcent: ganzNichtNegativ,
  toner: TonerSchema.optional(),
  /** T164: gilt ab diesem Tag; ein späterer Eintrag gleicher Farbe und Größe löst ihn ab. */
  gueltigAb: gueltigAbFeld,
});

export type Klickpreis = z.infer<typeof KlickpreisSchema>;

/** Art einer Farbe im Farbwerk: eine der vier Prozessfarben oder eine Sonderfarbe. */
export const FARB_ARTEN = ['cyan', 'magenta', 'gelb', 'schwarz', 'sonder'] as const;
export type FarbArt = (typeof FARB_ARTEN)[number];

/** Farbe im Pool der Maschine, z. B. „Cyan“ (cyan) oder „Weiß“ (sonder); Toner extra wahlweise. */
export const FarbeSchema = z.object({
  name: pflichtText(30),
  art: z.enum(FARB_ARTEN, { errorMap: () => ({ message: 'Art unbekannt' }) }),
  toner: TonerSchema.optional(),
});

export type Farbe = z.infer<typeof FarbeSchema>;

/** Station im Farbwerk in Druckreihenfolge: feste Farbe aus dem Pool; ohne Farbe = wechselbar
 *  (nimmt jede Sonderfarbe des Pools). */
export const StationSchema = z.object({ farbe: pflichtText(30).optional() });

export type Station = z.infer<typeof StationSchema>;

/** Klickpreis einer Farbgruppe je bedruckte Seite und Durchgang. Gilt bis zur Bogenlänge
 *  (längere Seite des Bogens, µm) oder bis zum Bogenformat; ohne beides: jede Größe. Gewählt wird
 *  die kleinste Stufe, in die der Bogen passt („bis 297 mm“, „bis 487 mm“, „darüber“). */
export const GruppenKlickSchema = z.object({
  bisLaengeUm: ganzPositiv.optional(),
  bisFormat: FormatSchema.optional(),
  zehntelcent: ganzNichtNegativ,
  /** T164: gilt ab diesem Tag; ein späterer Eintrag gleicher Größe löst ihn ab. */
  gueltigAb: gueltigAbFeld,
});

export type GruppenKlick = z.infer<typeof GruppenKlickSchema>;

/** Farbgruppe mit Klickpreis, z. B. „4c“ = Cyan, Magenta, Gelb, Schwarz. */
export const FarbgruppeSchema = z.object({
  name: pflichtText(40),
  farben: z.array(pflichtText(30), LISTE).min(1, 'mindestens eine Farbe'),
  klicks: z.array(GruppenKlickSchema, LISTE).min(1, 'mindestens ein Klickpreis'),
});

export type Farbgruppe = z.infer<typeof FarbgruppeSchema>;

/**
 * Farbwerk der Maschine (EVA: Verarbeitung): Pool der Farben, Stationen in Druckreihenfolge,
 * Gruppen mit Klickpreis, Rüstzeit je Wechsel einer wechselbaren Station. Je Seite und
 * Durchgang zahlt die günstigste Auswahl an Gruppen, die alle Farben des Durchgangs enthält;
 * eine Farbe ohne Gruppe kostet nur ihren Toner.
 */
export const FarbwerkSchema = z
  .object({
    farben: z.array(FarbeSchema, LISTE).min(1, 'mindestens eine Farbe'),
    stationen: z.array(StationSchema, LISTE).min(1, 'mindestens eine Station'),
    gruppen: z.array(FarbgruppeSchema, LISTE).max(12, 'höchstens 12 Gruppen').optional(),
    wechselMs: ganzNichtNegativ.optional(),
  })
  .superRefine((w, ctx) => {
    const namen = new Set<string>();
    w.farben.forEach((f, i) => {
      const n = f.name.toLowerCase();
      if (namen.has(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['farben', i, 'name'],
          message: `Farbe doppelt: ${f.name}`,
        });
      }
      namen.add(n);
    });
    w.stationen.forEach((s, i) => {
      if (s.farbe !== undefined && !namen.has(s.farbe.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stationen', i, 'farbe'],
          message: `Farbe ${s.farbe} nicht im Farbwerk`,
        });
      }
    });
    const gruppen = new Set<string>();
    (w.gruppen ?? []).forEach((g, i) => {
      const n = g.name.toLowerCase();
      if (gruppen.has(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gruppen', i, 'name'],
          message: `Klickart doppelt: ${g.name}`,
        });
      }
      gruppen.add(n);
      g.farben.forEach((f, k) => {
        if (!namen.has(f.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['gruppen', i, 'farben', k],
            message: `Farbe ${f} nicht im Farbwerk`,
          });
        }
      });
    });
  });

export type Farbwerk = z.infer<typeof FarbwerkSchema>;

/**
 * Verbrauch eines Schritts (Material außer Papier, z. B. Ösen, Heftklammern, Folie): Material
 * aus dem Lager, Menge je Einheit (`je` = Einheit des Schritts, eine andere Einheit wie Stapel
 * oder „Auftrag“). Bogen und Stück rechnen je Stück (Preis je 1.000), Rollen je m².
 */
export const VerbrauchSchema = z.object({
  materialId: idFeld,
  menge: zahlPositiv,
  je: einheitFeld,
  /** T181: Kostenquelle „enthalten in“ – im Stundensatz der Maschine, nicht gerechnet. */
  imStundensatz: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});

export type Verbrauch = z.infer<typeof VerbrauchSchema>;

/**
 * T115: Verbrauchsmaterial der Maschine (Folie, Klammern, Banderole, Öl …). Einträge derselben
 * Gruppe sind Alternativen (Folie matt | glänzend | Softtouch) – gerechnet wird je Gruppe eines:
 * gewählt in der Kalkulation, sonst über den Merkmal-Wert (`wert`, z. B. „matt“), sonst der
 * Standard, sonst der erste. Menge je Einheit wie beim Verbrauch am Schritt; „Stunde“ = je
 * Betriebsstunde (Laufzeit). `schritte`: nur bei diesen Arbeitsschritten; fehlt: bei allen.
 */
export const MaschinenVerbrauchSchema = z.object({
  id: idFeld,
  materialId: idFeld,
  gruppe: pflichtText(60),
  menge: zahlPositiv,
  je: einheitFeld,
  schritte: z.array(idFeld, LISTE).optional(),
  standard: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  wert: pflichtText(60).optional(),
  /** T181: im Stundensatz enthalten – nur zur Information (Lieferant, Preis), nicht gerechnet. */
  imStundensatz: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
});

export type MaschinenVerbrauch = z.infer<typeof MaschinenVerbrauchSchema>;

/**
 * Läuft im selben Durchlauf mit einem anderen Schritt dieses Platzes (z. B. Heften im Duplo mit
 * Zusammentragen): sind beide in der Kalkulation, hat dieser keine eigene Laufzeit (nur Rüsten),
 * und der andere Schritt läuft wahlweise langsamer (Leistung ± %).
 */
export const LaeuftMitSchema = z.object({
  schrittId: idFeld,
  leistungProzent: zahlFeld.gt(-100, 'größer als −100').max(1000, 'höchstens 1000').optional(),
});

export const PlatzSchrittSchema = z.object({
  schrittId: idFeld,
  leistung: LeistungSchema.optional(),
  profile: z.array(LeistungsprofilSchema, LISTE).optional(),
  ruesten: z.array(RuestbausteinSchema, LISTE).optional(),
  zuschuss: ZuschussSchema.optional(),
  grenzen: GrenzenSchema.optional(),
  verbrauch: z.array(VerbrauchSchema, LISTE).optional(),
  laeuftMit: LaeuftMitSchema.optional(),
  /** T156: Wartezeit nach dieser Tätigkeit (Trocknen, Aushärten) in ms – kostet nichts, zählt
   *  für die Durchlaufzeit; steht in der Kalkulation als Angabe am Schritt. */
  wartezeitMs: ganzPositiv.optional(),
  /** Klickpreise nur für diesen Schritt (älterer Stand); sonst gelten die der Maschine. Gewählt
   *  nach Farbe und kleinster passender Klickgröße. */
  klickpreise: z.array(KlickpreisSchema, LISTE).optional(),
});

export type PlatzSchritt = z.infer<typeof PlatzSchrittSchema>;

/** T146: Leistung der Tätigkeit – ihre eigene, sonst die Nettogeschwindigkeit der Maschine. */
export function schrittLeistung(
  platz: { leistungJeStunde?: number | undefined },
  s: Pick<PlatzSchritt, 'leistung'>,
): { menge: number; dauerMs: number } | undefined {
  if (s.leistung !== undefined) return s.leistung;
  return platz.leistungJeStunde === undefined
    ? undefined
    : { menge: platz.leistungJeStunde, dauerMs: 3_600_000 };
}

/**
 * Fremdarbeit (Zukauf bei einem Lieferanten, z. B. Offsetdruck): Angaben am Platz.
 * Die Staffelpreise (angefragte Mengen, im Formular bis zu 6) kommen je Anfrage – siehe rechneFremdarbeit.
 * einheit = Einheit der Staffelmengen (ohne Angabe: Stück). Geld in Zehntelcent.
 */
export const FremdarbeitSchema = z.object({
  /** Lieferant aus der Liste (Produktion.lieferanten); lieferant = Name frei, wenn nicht in der Liste. */
  lieferantId: idFeld.optional(),
  lieferant: freiText(80),
  einheit: einheitFeld.optional(),
  lieferzeitTage: ganzNichtNegativ.optional(),
  grundpreisZehntelcent: ganzNichtNegativ.optional(),
  aufschlagProzent: zahlFeld
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000')
    .optional(),
  aufschlagFestZehntelcent: ganzNichtNegativ.optional(),
});

export type Fremdarbeit = z.infer<typeof FremdarbeitSchema>;

/**
 * Arbeitsplatz („wo“): eine Maschine, mehrere kleine Maschinen, Handarbeit, Fremdarbeit.
 * bereich = Einordnung für die Übersicht, z. B. Vorstufe, Druck, Verarbeitung, Verpacken, Versand.
 * Stundensätze in Zehntelcent je Stunde: Vollkosten und (freiwillig) Teilkosten.
 * ruesten = Bausteine, die für jeden Schritt am Platz gelten.
 * fremdarbeit = gesetzt (auch leer), wenn der Platz ein Lieferant ist (Zukauf statt Zeit × Satz).
 */
export const ArbeitsplatzSchema = z
  .object({
    id: idFeld,
    name: pflichtText(80),
    bereich: freiText(40),
    kostenstelle: freiText(40),
    hersteller: freiText(80),
    modell: freiText(80),
    standort: freiText(80),
    beschreibung: freiText(2000),
    stundensatzVollZehntelcent: ganzNichtNegativ.optional(),
    stundensatzTeilZehntelcent: ganzNichtNegativ.optional(),
    stundensatzVorlaeufig: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    /** Kostenstelle, die den Stundensatz trägt; dann hat der Platz keinen eigenen Satz. */
    kostenstelleId: idFeld.optional(),
    /** Anteil Personal im Stundensatz (Zehntelcent je Stunde) und Besatzung beim Lauf (0–1,
     *  z. B. 0 = läuft ohne Bediener, 0,25 = ein Viertel); Rüsten immer mit vollem Personal. */
    personalZehntelcent: ganzNichtNegativ.optional(),
    besatzungLauf: zahlFeld.min(0, 'darf nicht negativ sein').max(1, 'höchstens 1').optional(),
    /** Mindestzeit je Arbeitsgang und Abrechnungstakt (je angefangene …), in ms. */
    mindestzeitMs: ganzNichtNegativ.optional(),
    taktMs: ganzPositiv.optional(),
    /** T146: Nettogeschwindigkeit der Maschine je Stunde, in der Einheit der jeweiligen
     *  Tätigkeit (Bogen, Nutzen, Stück …). Gilt für jede Tätigkeit ohne eigene Leistung. */
    leistungJeStunde: ganzPositiv.optional(),
    /** Ersatzgerät, gesperrt: wird nicht mehr vorgeschlagen; rechnet mit Hinweis. */
    inaktiv: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    grenzen: GrenzenSchema.optional(),
    /** Klickpreise der Maschine (Wartungsvertrag), für alle Druckschritte; ein Schritt mit
     *  eigenen Klickpreisen geht vor. */
    klickpreise: z.array(KlickpreisSchema, LISTE).optional(),
    /** Farbwerk (Farben, Stationen, Gruppen); gesetzt, rechnet der Druck danach statt nach
     *  den Klickpreisen der Maschine. */
    farbwerk: FarbwerkSchema.optional(),
    ausstattung: z.array(pflichtText(80), LISTE).optional(),
    ruesten: z.array(RuestbausteinSchema, LISTE).optional(),
    schritte: z.array(PlatzSchrittSchema, LISTE),
    /** T115: Verbrauchsmaterial der Maschine. */
    verbrauchsmaterial: z.array(MaschinenVerbrauchSchema, LISTE).optional(),
    auspraegungen: z.array(AuspraegungSchema, LISTE).optional(),
    fremdarbeit: FremdarbeitSchema.optional(),
  })
  .superRefine((platz, ctx) => {
    // T115: Verbrauchsmaterial – IDs eindeutig, Schritte an diesem Platz, je Gruppe ein Standard
    // (nur, wenn sich die Schritte überschneiden – gleiche Gruppe an verschiedenen Schritten ist
    // keine Alternative)
    const vIds = new Set<string>();
    const standards: { gruppe: string; schritte: readonly string[] }[] = [];
    const ueberschneiden = (a: readonly string[], b: readonly string[]) =>
      a.length === 0 || b.length === 0 || a.some((x) => b.includes(x));
    (platz.verbrauchsmaterial ?? []).forEach((v, i) => {
      if (vIds.has(v.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['verbrauchsmaterial', i, 'id'],
          message: `${v.id} doppelt`,
        });
      }
      vIds.add(v.id);
      (v.schritte ?? []).forEach((s, k) => {
        if (!platz.schritte.some((x) => x.schrittId === s)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['verbrauchsmaterial', i, 'schritte', k],
            message: `${s} gibt es an dieser Maschine nicht`,
          });
        }
      });
      if (v.standard) {
        const g = v.gruppe.trim().toLowerCase();
        const schritte = v.schritte ?? [];
        const doppelt = standards.some(
          (x) => x.gruppe === g && ueberschneiden(x.schritte, schritte),
        );
        standards.push({ gruppe: g, schritte });
        if (doppelt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['verbrauchsmaterial', i, 'standard'],
            message: `In der Gruppe „${v.gruppe}“ ist schon ein Standard`,
          });
        }
      }
    });
    if (
      platz.stundensatzVollZehntelcent !== undefined &&
      platz.stundensatzTeilZehntelcent !== undefined &&
      platz.stundensatzTeilZehntelcent > platz.stundensatzVollZehntelcent
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stundensatzTeilZehntelcent'],
        message: 'Teilkosten sind größer als Vollkosten',
      });
    }
    if (
      platz.personalZehntelcent !== undefined &&
      platz.stundensatzVollZehntelcent !== undefined &&
      platz.personalZehntelcent > platz.stundensatzVollZehntelcent
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['personalZehntelcent'],
        message: 'Personal ist größer als der Stundensatz',
      });
    }
    if (platz.kostenstelleId !== undefined) {
      const eigen =
        platz.stundensatzVollZehntelcent !== undefined ||
        platz.stundensatzTeilZehntelcent !== undefined ||
        platz.stundensatzVorlaeufig !== undefined ||
        platz.personalZehntelcent !== undefined;
      if (platz.fremdarbeit !== undefined || eigen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kostenstelleId'],
          message:
            platz.fremdarbeit !== undefined
              ? 'Fremdarbeit hat keinen Stundensatz'
              : 'Stundensatz entweder am Platz oder über die Kostenstelle, nicht beides',
        });
      }
    } else if (platz.besatzungLauf !== undefined && platz.personalZehntelcent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['personalZehntelcent'],
        message: 'Für die Besatzung beim Lauf den Anteil Personal angeben',
      });
    }
    const gesehen = new Set<string>();
    platz.schritte.forEach((s, index) => {
      if (gesehen.has(s.schrittId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schritte', index, 'schrittId'],
          message: `Schritt doppelt: ${s.schrittId}`,
        });
      }
      gesehen.add(s.schrittId);
      const profilNamen = new Set<string>();
      (s.profile ?? []).forEach((profil, p) => {
        const schluessel = profil.name.toLowerCase();
        if (profilNamen.has(schluessel)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schritte', index, 'profile', p, 'name'],
            message: `Ausführung doppelt: ${profil.name}`,
          });
        }
        profilNamen.add(schluessel);
      });
    });
    platz.schritte.forEach((s, index) => {
      const mit = s.laeuftMit?.schrittId;
      if (mit === undefined) return;
      if (mit === s.schrittId || !gesehen.has(mit)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schritte', index, 'laeuftMit', 'schrittId'],
          message:
            mit === s.schrittId
              ? 'Ein Schritt kann nicht mit sich selbst laufen'
              : `Schritt ${mit} ist an diesem Platz nicht möglich`,
        });
      }
    });
    (platz.auspraegungen ?? []).forEach((a, index) => {
      if (a.schrittId !== undefined && !gesehen.has(a.schrittId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['auspraegungen', index, 'schrittId'],
          message: `Schritt ${a.schrittId} ist an diesem Platz nicht möglich`,
        });
      }
    });
  });

export type Arbeitsplatz = z.infer<typeof ArbeitsplatzSchema>;

/** Name für den Vergleich: getrimmt, Kleinbuchstaben, Leerraum zusammengefasst. */
function nameSchluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Meldet doppelte IDs und Namen (ohne Groß-/Kleinschreibung) an jedem betroffenen Eintrag. */
function doppelteMelden(
  liste: readonly { id: string; name: string }[],
  feld: string,
  ctx: z.RefinementCtx,
): void {
  const idZahl = new Map<string, number>();
  const nameZahl = new Map<string, number>();
  for (const eintrag of liste) {
    idZahl.set(eintrag.id, (idZahl.get(eintrag.id) ?? 0) + 1);
    const schluessel = nameSchluessel(eintrag.name);
    nameZahl.set(schluessel, (nameZahl.get(schluessel) ?? 0) + 1);
  }
  liste.forEach((eintrag, index) => {
    if ((idZahl.get(eintrag.id) ?? 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [feld, index, 'id'],
        message: `ID doppelt: ${eintrag.id}`,
      });
    }
    if ((nameZahl.get(nameSchluessel(eintrag.name)) ?? 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [feld, index, 'name'],
        message: `Name doppelt: ${eintrag.name}`,
      });
    }
  });
}

/**
 * Produktion: eigene Datei neben dem Lager – Katalog der Arbeitsschritte und Arbeitsplätze.
 * Doppelte IDs und Namen werden an jedem betroffenen Eintrag gemeldet. Ein Schritt am Platz muss
 * im Katalog stehen; ist seine Einheit ganzzahlig, muss die Leistungsmenge ganzzahlig sein.
 */
const ProduktionBasis = z
  .object({
    version: versionFeld,
    arbeitsschritte: z.array(ArbeitsschrittSchema),
    arbeitsplaetze: z.array(ArbeitsplatzSchema).optional(),
    lieferanten: z.array(LieferantSchema).optional(),
    kostenstellen: z.array(KostenstelleSchema).optional(),
  })
  .superRefine((produktion, ctx) => {
    doppelteMelden(produktion.arbeitsschritte, 'arbeitsschritte', ctx);
    const plaetze = produktion.arbeitsplaetze ?? [];
    doppelteMelden(plaetze, 'arbeitsplaetze', ctx);
    const kostenstellen = produktion.kostenstellen ?? [];
    doppelteMelden(kostenstellen, 'kostenstellen', ctx);
    const kostenstellenNachId = new Map(kostenstellen.map((k) => [k.id, k]));
    plaetze.forEach((platz, p) => {
      const id = platz.kostenstelleId;
      if (id === undefined) return;
      const kostenstelle = kostenstellenNachId.get(id);
      if (!kostenstelle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['arbeitsplaetze', p, 'kostenstelleId'],
          message: `Kostenstelle ${id} nicht gefunden`,
        });
      } else if (
        platz.besatzungLauf !== undefined &&
        kostenstelle.personalZehntelcent === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['arbeitsplaetze', p, 'besatzungLauf'],
          message: 'Für die Besatzung beim Lauf den Anteil Personal an der Kostenstelle angeben',
        });
      }
    });
    const katalog = new Map(produktion.arbeitsschritte.map((s) => [s.id, s]));
    const lieferanten = produktion.lieferanten ?? [];
    doppelteMelden(lieferanten, 'lieferanten', ctx);
    const lieferantIds = new Set(lieferanten.map((l) => l.id));
    plaetze.forEach((platz, p) => {
      const id = platz.fremdarbeit?.lieferantId;
      if (id !== undefined && !lieferantIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['arbeitsplaetze', p, 'fremdarbeit', 'lieferantId'],
          message: `Lieferant ${id} nicht gefunden`,
        });
      }
    });
    plaetze.forEach((platz, p) => {
      platz.schritte.forEach((s, i) => {
        const schritt = katalog.get(s.schrittId);
        if (!schritt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['arbeitsplaetze', p, 'schritte', i, 'schrittId'],
            message: `Arbeitsschritt ${s.schrittId} nicht gefunden`,
          });
          return;
        }
        const ganz = (GANZZAHLIGE_EINHEITEN as readonly string[]).includes(schritt.einheit);
        if (s.leistung && ganz && !Number.isInteger(s.leistung.menge)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['arbeitsplaetze', p, 'schritte', i, 'leistung', 'menge'],
            message: 'muss eine ganze Zahl sein',
          });
        }
        (s.profile ?? []).forEach((profil, k) => {
          if (ganz && profil.menge !== undefined && !Number.isInteger(profil.menge)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['arbeitsplaetze', p, 'schritte', i, 'profile', k, 'menge'],
              message: 'muss eine ganze Zahl sein',
            });
          }
        });
      });
    });
  });

/** Produktion mit Umstellung alter Lieferantenfelder (T38) vor der Prüfung. */
export const ProduktionSchema = z.preprocess(alteLieferantenfelder, ProduktionBasis);

export type Produktion = z.infer<typeof ProduktionBasis>;

export function pruefeProduktion(input: unknown): PruefErgebnis<Produktion> {
  return ausZod(ProduktionSchema.safeParse(input));
}
