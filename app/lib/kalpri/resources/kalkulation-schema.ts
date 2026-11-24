import { z } from 'zod/v3';
import { EINHEITEN } from '@druck/units';
import { LeistungsaenderungSchema } from './auspraegung-schema';
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
const zahlNichtNegativ = zahlFeld.min(0, 'darf nicht negativ sein');
const zahlPositiv = zahlFeld.gt(0, 'muss größer als 0 sein');
const ganzNichtNegativ = zahlFeld
  .int('muss eine ganze Zahl sein')
  .min(0, 'darf nicht negativ sein');
const ganzPositiv = zahlFeld.int('muss eine ganze Zahl sein').gt(0, 'muss größer als 0 sein');
const LISTE = { required_error: 'Pflichtfeld', invalid_type_error: 'muss eine Liste sein' };

function istEchtesDatum(wert: string): boolean {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!treffer) return false;
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
  .refine(istEchtesDatum, 'Datum im Format JJJJ-MM-TT');

const einheitFeld = z.enum(EINHEITEN, {
  errorMap: (issue, ctx) =>
    issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined'
      ? { message: 'Pflichtfeld' }
      : issue.code === z.ZodIssueCode.invalid_enum_value ||
          issue.code === z.ZodIssueCode.invalid_type
        ? { message: 'Einheit unbekannt' }
        : { message: ctx.defaultError },
});

/**
 * Ist-Wert einer Zeile je Auflage (Nachkalkulation). Wird nur angehängt; der zuletzt
 * angehängte Wert gilt. Abweichungen sind Anzeige, keine Korrektur der Kalkulation.
 */
export const IstWertSchema = z.object({
  zeileId: idFeld,
  auflage: ganzPositiv,
  menge: zahlNichtNegativ.optional(),
  zeitMs: ganzNichtNegativ.optional(),
  notiz: freiText(500),
  erfasstAm: datumFeld,
});

export type IstWert = z.infer<typeof IstWertSchema>;

/** Welche Zahl des Papierwegs eine Zeile nimmt. */
export const PAPIERWEG_WERTE = [
  'nutzen',
  'druckbogen',
  'rohbogen',
  'vorschneiden',
  'endschnitt',
  'stapel',
] as const;
export type PapierwegWert = (typeof PAPIERWEG_WERTE)[number];

/**
 * Woher die Menge einer Zeile kommt. Listen „je Auflage“: ein Wert gilt für alle Auflagen,
 * sonst ein Wert je Auflage.
 * - hand: Mengen von Hand
 * - auflage: Auflage × faktor ÷ teiler (aufgerundet) + fest, z. B. Bogen = Auflage ÷ 24 Nutzen
 * - papierweg: Zahl aus dem Papierweg eines Teils (Rückwärtskalkulation: Netto + Zuschüsse
 *   dieses und aller späteren Schritte) × faktor, z. B. Nutzen × 4 Ecken; bei Schnitten
 *   je Stapel × Stapel (gestapelt: Streifen/Hälften aufeinander); stapel = Stapel der fertigen
 *   Nutzen nach Einlegehöhe (z. B. Ecken runden: Stapel × 4 Ecken)
 * - produkt: Exemplare des ganzen Produkts an diesem Schritt (Auflage + Zuschüsse aller späteren
 *   Produkt-Schritte) × faktor ÷ teiler, aufgerundet – für Schritte nach dem Zusammenführen der
 *   Teile (Zusammentragen, Heften, Verpacken). Ihre Zuschüsse erhöhen die Nutzen jedes Teils.
 */
export const MengenquelleSchema = z.discriminatedUnion(
  'art',
  [
    z.object({ art: z.literal('hand'), mengen: z.array(zahlNichtNegativ, LISTE) }),
    /** T106: einmal je Auftrag (Datencheck, Druckdaten), in jeder Auflage 1. T111: mit Teil
     *  „je Blatt“: so oft, wie das Teil Blätter je Produkt hat (z. B. Stanze aufbauen je
     *  Registerblatt), unabhängig von der Auflage. */
    z.object({ art: z.literal('auftrag'), teilId: idFeld.optional() }),
    z.object({
      art: z.literal('auflage'),
      faktor: zahlPositiv.optional(),
      teiler: zahlPositiv.optional(),
      fest: zahlNichtNegativ.optional(),
    }),
    z.object({
      art: z.literal('papierweg'),
      teilId: idFeld,
      wert: z.enum(PAPIERWEG_WERTE, {
        errorMap: (issue, ctx) =>
          issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined'
            ? { message: 'Pflichtfeld' }
            : issue.code === z.ZodIssueCode.invalid_enum_value
              ? { message: 'Wert unbekannt' }
              : { message: ctx.defaultError },
      }),
      faktor: zahlPositiv.optional(),
      gestapelt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
    }),
    z.object({
      art: z.literal('produkt'),
      faktor: zahlPositiv.optional(),
      teiler: zahlPositiv.optional(),
    }),
  ],
  {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union_discriminator
        ? { message: 'Mengenquelle unbekannt' }
        : issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined'
          ? { message: 'Pflichtfeld' }
          : { message: ctx.defaultError },
  },
);

export type Mengenquelle = z.infer<typeof MengenquelleSchema>;

const gemein = {
  id: idFeld,
  bezeichnung: freiText(120),
  notiz: freiText(2000),
  /** T118: vom Programm vorgeschlagen (aus dem Produkt); fehlt: selbst angelegt. */
  vorschlag: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  /** T118: vorgeschlagen, aber von Hand geändert – bleibt beim nächsten Vorschlag. */
  geaendert: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
};

/** Gewinnaufschlag zusätzlich zum Zeilenaufschlag (fehlt: vom Material/Lieferanten, sonst ja). */
const gewinnZusaetzlichFeld = z
  .boolean({ invalid_type_error: 'muss ja oder nein sein' })
  .optional();

/** Abgerechnete Menge: auf ein Vielfaches aufrunden (z. B. 50 Bogen) oder auf ganze Packungen. */
export const RundungSchema = z.discriminatedUnion(
  'art',
  [
    z.object({ art: z.literal('vielfaches'), auf: ganzPositiv }),
    z.object({ art: z.literal('packung') }),
  ],
  {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union_discriminator
        ? { message: 'Rundung unbekannt' }
        : { message: ctx.defaultError },
  },
);

/** Preis von Hand: Betrag in Zehntelcent je Bogen/Stück, je 1.000 oder je 100 kg. */
export const PreisVonHandSchema = z.object({
  zehntelcent: ganzNichtNegativ,
  je: z.enum(['einheit', 'tausend', 'hundertKg'], {
    errorMap: () => ({ message: 'Preisbasis unbekannt' }),
  }),
});

/**
 * Material aus dem Lager; Menge = benötigt (in Bogen/Stück/Rolle). lieferant = nur dessen
 * Preise; preisVonHand ersetzt die Lagerpreise; rundung → abgerechnete (einkalkulierte) Menge.
 */
const MaterialZeileSchema = z.object({
  ...gemein,
  art: z.literal('material'),
  materialId: idFeld,
  menge: MengenquelleSchema,
  lieferant: freiText(80),
  preisVonHand: PreisVonHandSchema.optional(),
  rundung: RundungSchema.optional(),
  /** Aufschlag nur in dieser Zeile; sonst gilt der Aufschlag am Material. */
  aufschlagProzent: zahlFeld
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000')
    .optional(),
  aufschlagFestZehntelcent: ganzNichtNegativ.optional(),
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
});

const deckungFeld = zahlFeld.gt(0, 'muss größer als 0 sein').max(100, 'höchstens 100');

/** Sonderfarbe einer Druckseite mit Namen aus dem Farbwerk der Maschine. lage „unter“ = vor
 *  4c/1c gedruckt (z. B. Weiß unterlegt), „ueber“ = danach (Standard, z. B. Lack). */
const SonderfarbeSchema = z.object({
  name: pflichtText(30),
  lage: z.enum(['unter', 'ueber'], { errorMap: () => ({ message: 'Lage unbekannt' }) }).optional(),
  deckungProzent: deckungFeld.optional(),
});

/** Farbe einer Druckseite: farbig (4c) oder schwarz (1c), dazu Sonderfarben (je eigener Klick). */
const DruckseiteSchema = z.object({
  farbe: z.enum(['farbig', 'schwarz'], { errorMap: () => ({ message: 'Farbe unbekannt' }) }),
  sonderfarben: ganzNichtNegativ.optional(),
  /** Deckung der Sonderfarbe(n) dieser Seite in % (Schätzung) für Toner extra; leer = Standard
   *  am Klickpreis der Maschine. */
  deckungProzent: deckungFeld.optional(),
  /** Sonderfarben mit Namen (Farbwerk der Maschine), in Druckreihenfolge. */
  sonder: z.array(SonderfarbeSchema, LISTE).optional(),
  /** Deckung je Prozessfarbe (4c oder 1c) in % für Toner extra; leer = Standard der Farbe. */
  grundDeckungProzent: deckungFeld.optional(),
});

export type Sonderfarbe = z.infer<typeof SonderfarbeSchema>;

/** Druck: Vorderseite, Rückseite (fehlt: einseitig). Jede bedruckte Seite = ein Durchgang. */
export const DruckSchema = z.object({
  vorne: DruckseiteSchema,
  hinten: DruckseiteSchema.optional(),
});

export type Druck = z.infer<typeof DruckSchema>;

/** Arbeitsgang: Arbeitsplatz + Schritt + Menge; Angaben wie in der Probe-Rechnung. */
const ArbeitsgangZeileSchema = z.object({
  ...gemein,
  art: z.literal('arbeitsgang'),
  platzId: idFeld,
  schrittId: idFeld,
  menge: MengenquelleSchema,
  materialId: idFeld.optional(),
  stanzformId: idFeld.optional(),
  /** T149: Werkzeug einmalig. berechnen: von Hand gewählt (fehlt: Vorgabe – vorhandene Form
   *  rechnet, solange sie nicht „bezahlt“ ist; neue Form rechnet). neuZehntelcent: Preis einer
   *  Form, die es noch nicht im Lager gibt. */
  werkzeug: z
    .object({
      berechnen: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
      neuZehntelcent: ganzNichtNegativ.optional(),
    })
    .optional(),
  profil: freiText(40),
  faecher: ganzNichtNegativ.optional(),
  farben: ganzNichtNegativ.optional(),
  nutzen: ganzNichtNegativ.optional(),
  einstellungen: z.array(pflichtText(80), LISTE).optional(),
  /** Freie Angaben, z. B. „4-fach“, „Ø 6 mm“, „Abstand 8 mm“; die erste Zahl zählt. */
  angaben: z.array(pflichtText(80), LISTE).optional(),
  stapel: MengenquelleSchema.optional(),
  /** T115: gewähltes Verbrauchsmaterial je Gruppe der Maschine (Gruppe → Material-ID). */
  verbrauchWahl: z.record(pflichtText(60), idFeld).optional(),
  /** Druck: Seiten und Farben → Durchgänge (Laufzeit) und Klicks (Kosten je Seite). */
  druck: DruckSchema.optional(),
  aenderung: LeistungsaenderungSchema.optional(),
  handwerte: z
    .object({
      leistungJeStunde: zahlPositiv.optional(),
      ruestenMs: ganzNichtNegativ.optional(),
      zuschuss: zahlNichtNegativ.optional(),
      /** Stundensatz von Hand (Vollkosten), Zehntelcent je Stunde – nur für diese Zeile (T97). */
      stundensatzZehntelcent: ganzNichtNegativ.optional(),
      /** T154: Menge von Hand (z. B. 2 Schnitte nach dem Stanzen) – ersetzt die berechnete
       *  Menge dieser Zeile; die berechnete steht weiter im Rechenweg. */
      menge: zahlPositiv.optional(),
    })
    .optional(),
});

/** Zukauf: Lieferant (Liste oder frei), Einkaufspreis je Auflage, interne Beschreibung. */
const ZukaufZeileSchema = z.object({
  ...gemein,
  art: z.literal('zukauf'),
  /** Teil, für das zugekauft wird (z. B. Umschlag extern gedruckt); zeigt die Bestellmenge. */
  teilId: idFeld.optional(),
  lieferantId: idFeld.optional(),
  lieferant: freiText(80),
  beschreibung: freiText(4000),
  preise: z.array(ganzNichtNegativ, LISTE),
  aufschlagProzent: zahlFeld
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000')
    .optional(),
  aufschlagFestZehntelcent: ganzNichtNegativ.optional(),
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
});

/** Sonstiges: Betrag (z. B. Versand, Pauschale), einer für alle oder je Auflage; eigener
 *  Aufschlag fest und/oder % (sonst gilt der Gewinnaufschlag). */
const SonstigesZeileSchema = z.object({
  ...gemein,
  art: z.literal('sonstiges'),
  betraege: z.array(ganzNichtNegativ, LISTE),
  aufschlagProzent: zahlFeld
    .min(0, 'darf nicht negativ sein')
    .max(1000, 'höchstens 1000')
    .optional(),
  aufschlagFestZehntelcent: ganzNichtNegativ.optional(),
  gewinnZusaetzlich: gewinnZusaetzlichFeld,
});

export const ZeileSchema = z.discriminatedUnion(
  'art',
  [MaterialZeileSchema, ArbeitsgangZeileSchema, ZukaufZeileSchema, SonstigesZeileSchema],
  {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_union_discriminator
        ? { message: 'Zeilenart unbekannt' }
        : { message: ctx.defaultError },
  },
);

export type Zeile = z.infer<typeof ZeileSchema>;
export type ZeilenArt = Zeile['art'];

/** Listen je Auflage einer Zeile (für die Prüfung der Anzahl). */
function listenJeAuflage(z: Zeile): { pfad: (string | number)[]; laenge: number }[] {
  const listen: { pfad: (string | number)[]; laenge: number }[] = [];
  const menge = (pfad: string, q: Mengenquelle | undefined) => {
    if (q?.art === 'hand') listen.push({ pfad: [pfad, 'mengen'], laenge: q.mengen.length });
  };
  if (z.art === 'material' || z.art === 'arbeitsgang') menge('menge', z.menge);
  if (z.art === 'arbeitsgang') menge('stapel', z.stapel);
  if (z.art === 'zukauf') listen.push({ pfad: ['preise'], laenge: z.preise.length });
  if (z.art === 'sonstiges') listen.push({ pfad: ['betraege'], laenge: z.betraege.length });
  return listen;
}

const FormatFeld = z.object({ breiteUm: ganzPositiv, hoeheUm: ganzPositiv });

/** Seitenfolge: ineinandergesteckt (Rückstich), gefalzte Bogen zusammengetragen, einzelne Blätter. */
export const SEITENFOLGEN = ['rueckstich', 'zusammengetragen', 'einzelblatt'] as const;
export type Seitenfolge = (typeof SEITENFOLGEN)[number];

/** Farbe einzelner Seiten eines Teils: „1c“ oder der Name einer Sonderfarbe, dazu die Seiten. */
const SeitenFarbeSchema = z.object({
  farbe: pflichtText(30),
  seiten: z.array(ganzPositiv, LISTE).min(1, 'mindestens eine Seite'),
});

export type SeitenFarbe = z.infer<typeof SeitenFarbeSchema>;

/**
 * Teil eines Produkts mit eigenem Papier, z. B. „Karte“, „Umschlag“, „Inhalt“.
 * - endformat: fertiges Format (beschnitten), z. B. 85 × 55 mm oder A4 210 × 297 mm
 * - offenesFormat: schon ausgeschossenes, offenes Format, z. B. A4-Doppelseite 420 × 297 mm;
 *   ist es angegeben, werden die Nutzen damit gerechnet
 * - jeProdukt: Nutzen je Produkt (1 Karte, 4 offene Bogen Inhalt, 10 Registerblätter)
 * - druckbogen: Format für die Druckmaschine; fehlt es, wird auf dem Rohbogen gedruckt
 * - nutzenJeBogen: von Hand; fehlt es, wird es berechnet (offenes Format bzw. Endformat +
 *   Beschnitt auf dem Druckbogen ohne den Rand der Druckmaschine)
 * - beschnittUm: je Seite um jeden Nutzen (Standard 3 mm)
 * - schemaId: Ausschießschema; es kann Beschnitt, Steg, Raster, Ränder und Druckbogen vorgeben
 * Zuschuss und nicht bedruckbarer Rand gehören zur Druckmaschine, nicht zum Teil.
 */
export const TeilSchema = z.object({
  id: idFeld,
  name: pflichtText(80),
  materialId: idFeld.optional(),
  endformat: FormatFeld,
  offenesFormat: FormatFeld.optional(),
  jeProdukt: ganzPositiv,
  druckbogen: FormatFeld.optional(),
  nutzenJeBogen: ganzPositiv.optional(),
  beschnittUm: ganzNichtNegativ.optional(),
  /** Ware vom Kunden gestellt (T101): kein Material, gerechnet je Stück (kein Bogen, kein
   *  Schneiden); die Anliefermenge steht im Rechenweg. wareText: was gestellt wird. */
  wareGestellt: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  wareText: freiText(500),
  /** T125: Bogen kommen bedruckt vom Lieferanten (Format = druckbogen); kein Material und kein
   *  Druck im Haus; das Material (materialId) gibt nur Stärke und Grammatur für Stapel. */
  geliefert: z.boolean({ invalid_type_error: 'muss ja oder nein sein' }).optional(),
  /** Ausschießschema (gespeichert im Ausschießen); fehlt: automatisch. */
  schemaId: idFeld.optional(),
  /**
   * Farben einzelner Seiten (Nutzer 28.10.): „1c“ = diese Seiten nur schwarz (alle anderen wie
   * der Druck, z. B. 4c); Name einer Sonderfarbe des Drucks = nur diese Seiten haben sie (ohne
   * Eintrag hat jede Seite sie). Seiten ab 1.
   */
  seitenFarben: z.array(SeitenFarbeSchema, LISTE).optional(),
  /** Wie die Seiten auf die Druckbogen kommen; fehlt: aus dem offenen Format (seitenfolgeVon). */
  seitenfolge: z
    .enum(SEITENFOLGEN, { errorMap: () => ({ message: 'Seitenfolge unbekannt' }) })
    .optional(),
});

export type Teil = z.infer<typeof TeilSchema>;
export type Format = z.infer<typeof FormatFeld>;

/**
 * Kalkulation (intern): Titel, Kunde, Stichtag für Materialpreise, 1–6 Auflagen in einer
 * Einheit, Zeilen, Teile (Papierweg), Gewinnaufschlag %. Prüft: Auflagen nicht doppelt,
 * Zeilen- und Teil-IDs eindeutig, Listen je Auflage mit 1 oder genau so vielen Werten wie
 * Auflagen, Sonstiges mit Bezeichnung.
 */
export const KalkulationSchema = z
  .object({
    id: idFeld,
    titel: pflichtText(120),
    kunde: freiText(120),
    erstelltAm: datumFeld.optional(),
    stichtag: datumFeld.optional(),
    auflagen: z
      .array(ganzPositiv, LISTE)
      .min(1, 'mindestens eine Auflage')
      .max(6, 'höchstens 6 Auflagen'),
    einheit: einheitFeld,
    zeilen: z.array(ZeileSchema, LISTE),
    teile: z.array(TeilSchema, LISTE).optional(),
    /** Artikel, aus dem die Kalkulation angelegt wurde. */
    artikelId: idFeld.optional(),
    /** T118: Produktbeschreibung (Form eines Artikels, alle Werte fest) – daraus „Weg
     *  vorschlagen“. Geprüft wird sie mit dem Artikel-Schema beim Lesen (produktVon). */
    produkt: z.record(z.string(), z.unknown()).optional(),
    /** Ist-Werte der Nachkalkulation, nur angehängt (Regel 14). */
    ist: z.array(IstWertSchema, LISTE).optional(),
    gewinnProzent: zahlFeld
      .min(0, 'darf nicht negativ sein')
      .max(1000, 'höchstens 1000')
      .optional(),
    notiz: freiText(4000),
    /** T112: Arbeitsanweisung für die Produktion (z. B. „Digitaldruck umgekehrt 20 → 1“). */
    arbeitsanweisung: freiText(4000),
    /** Eigene Fassung der Produktbeschreibung für Paginanet (T95); fehlt: aus der Kalkulation
     *  erzeugt (kalkulationBeschreibung). */
    beschreibung: freiText(4000),
    /** T119: Stichworte zum Suchen (z. B. Kunde, Anlass), höchstens 30. */
    stichworte: z.array(pflichtText(40), LISTE).max(30, 'höchstens 30 Stichworte').optional(),
  })
  .superRefine((k, ctx) => {
    const auflagen = new Set<number>();
    k.auflagen.forEach((a, i) => {
      if (auflagen.has(a)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['auflagen', i],
          message: 'Auflage doppelt',
        });
      }
      auflagen.add(a);
    });
    const teilIds = new Set<string>();
    (k.teile ?? []).forEach((teil, i) => {
      if (teilIds.has(teil.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teile', i, 'id'],
          message: `Teil doppelt: ${teil.id}`,
        });
      }
      teilIds.add(teil.id);
    });
    const ids = new Set<string>();
    k.zeilen.forEach((zeile, i) => {
      if (
        (zeile.art === 'material' || zeile.art === 'arbeitsgang') &&
        (zeile.menge.art === 'papierweg' || zeile.menge.art === 'auftrag') &&
        zeile.menge.teilId !== undefined &&
        !teilIds.has(zeile.menge.teilId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['zeilen', i, 'menge', 'teilId'],
          message: `Teil ${zeile.menge.teilId} nicht vorhanden`,
        });
      }
      if (zeile.art === 'zukauf' && zeile.teilId !== undefined && !teilIds.has(zeile.teilId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['zeilen', i, 'teilId'],
          message: `Teil ${zeile.teilId} nicht vorhanden`,
        });
      }
      if (ids.has(zeile.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['zeilen', i, 'id'],
          message: `Zeile doppelt: ${zeile.id}`,
        });
      }
      ids.add(zeile.id);
      if (zeile.art === 'sonstiges' && zeile.bezeichnung === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['zeilen', i, 'bezeichnung'],
          message: 'Pflichtfeld',
        });
      }
      for (const liste of listenJeAuflage(zeile)) {
        if (k.auflagen.length === 0) break;
        if (liste.laenge !== 1 && liste.laenge !== k.auflagen.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['zeilen', i, ...liste.pfad],
            message:
              k.auflagen.length === 1
                ? 'genau ein Wert'
                : `ein Wert für alle oder ${k.auflagen.length} Werte (je Auflage)`,
          });
        }
      }
    });
    (k.ist ?? []).forEach((eintrag, i) => {
      if (!ids.has(eintrag.zeileId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ist', i, 'zeileId'],
          message: `Zeile ${eintrag.zeileId} nicht vorhanden`,
        });
      }
      if (!auflagen.has(eintrag.auflage)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ist', i, 'auflage'],
          message: `Auflage ${eintrag.auflage} ist nicht in der Kalkulation`,
        });
      }
    });
  });

export type Kalkulation = z.infer<typeof KalkulationSchema>;

/** Datei der Kalkulationen (neben Lager, Produktion). */
export const KalkulationenSchema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: 'Version muss 1 sein' }) }),
    kalkulationen: z.array(KalkulationSchema, LISTE),
  })
  .superRefine((d, ctx) => {
    const zahl = new Map<string, number>();
    for (const k of d.kalkulationen) zahl.set(k.id, (zahl.get(k.id) ?? 0) + 1);
    d.kalkulationen.forEach((k, i) => {
      if ((zahl.get(k.id) ?? 0) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kalkulationen', i, 'id'],
          message: `ID doppelt: ${k.id}`,
        });
      }
    });
  });

export type Kalkulationen = z.infer<typeof KalkulationenSchema>;

export function pruefeKalkulationen(input: unknown): PruefErgebnis<Kalkulationen> {
  return ausZod(KalkulationenSchema.safeParse(input));
}
