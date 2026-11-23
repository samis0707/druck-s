/**
 * Vorlagen-Schema der Personalisierung: einzige Quelle für Editor, Vorschau, Erzeugung und Import.
 *
 * Koordinaten: Millimeter, Ursprung OBEN LINKS im Endformat (ohne Beschnitt), y wächst nach unten.
 * Felder sind Rechtecke (x, y, breite, hoehe). Negative Werte bis -beschnitt sind erlaubt, damit
 * Elemente in den Beschnitt hineinragen können.
 * Variablen sind explizit (`variablen`); Vorlagen-Texte verweisen mit {{schluessel}} darauf.
 * Isomorph: keine Node- oder Browser-APIs.
 */
import { z } from "zod/v4";

export const SCHEMA_VERSION = 1;

export const VARIABLEN_SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
/** Schlüssel, die als Spaltenname eine eigene Bedeutung haben (Auflage je Datensatz). */
export const RESERVIERTE_SCHLUESSEL = ["auflage"] as const;
const PLATZHALTER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export const SEITEN = ["vorne", "hinten"] as const;
export type Seite = (typeof SEITEN)[number];

export const SYMBOLOGIEN = [
  "code128",
  "ean13",
  "ean8",
  "upca",
  "code39",
  "code93",
  "interleaved2of5",
  "itf14",
  "gs1-128",
  "datamatrix",
  "gs1datamatrix",
  "pdf417",
  "azteccode",
] as const;
export type Symbologie = (typeof SYMBOLOGIEN)[number];

/** Anzeigenamen für die Auswahl im Editor. */
export const SYMBOLOGIE_NAMEN: Record<Symbologie, string> = {
  code128: "Code 128",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  code39: "Code 39",
  code93: "Code 93",
  interleaved2of5: "Interleaved 2 of 5",
  itf14: "ITF-14",
  "gs1-128": "GS1-128",
  datamatrix: "Data Matrix",
  gs1datamatrix: "GS1 Data Matrix",
  pdf417: "PDF417",
  azteccode: "Aztec",
};

/** Gängige Bogenformate (mm), für die Auswahl im Editor. */
export const BOGENFORMATE = [
  { name: "SRA3", breite: 320, hoehe: 450 },
  { name: "SRA3+ (330 × 487)", breite: 330, hoehe: 487 },
  { name: "A3", breite: 297, hoehe: 420 },
  { name: "A3+ (329 × 483)", breite: 329, hoehe: 483 },
  { name: "SRA4", breite: 225, hoehe: 320 },
  { name: "A4", breite: 210, hoehe: 297 },
  { name: "A5", breite: 148, hoehe: 210 },
] as const;

const mm = z.number().finite().min(-100).max(2000);
const mmPos = z.number().finite().gt(0).max(2000);
const text = (max: number) => z.string().max(max);
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Nur Kleinbuchstaben, Ziffern, _ und -");

export const FarbeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Prozentwerte 0–100 */
  cmyk: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100)]),
  /** Name der Sonderfarbe (Separation im PDF); leer = Prozessfarbe. */
  sonderfarbe: z.string().trim().min(1).max(60).nullish(),
});
export type Farbe = z.infer<typeof FarbeSchema>;

export const SCHRIFT_SCHNITTE = ["regular", "bold", "italic", "bolditalic"] as const;
export type SchriftSchnitt = (typeof SCHRIFT_SCHNITTE)[number];

export const SchriftRefSchema = z.object({
  /** Familie aus der Schriftbibliothek; "Helvetica" ist die eingebaute Standardschrift. */
  familie: z.string().trim().min(1).max(80).default("Helvetica"),
  fett: z.boolean().default(false),
  kursiv: z.boolean().default(false),
});
export type SchriftRef = z.infer<typeof SchriftRefSchema>;

export const VariableSchema = z.object({
  schluessel: z.string().regex(VARIABLEN_SCHLUESSEL, "Kleinbuchstaben, Ziffern und _, beginnend mit einem Buchstaben"),
  /** Bezeichnung für Kunden (Spaltenkopf, Formularfeld). */
  bezeichnung: z.string().trim().min(1).max(80),
  pflicht: z.boolean().default(false),
  beispiel: text(300).default(""),
  maxLaenge: z.number().int().min(1).max(2000).nullable().default(null),
  hilfe: text(300).default(""),
});
export type Variable = z.infer<typeof VariableSchema>;

const rechteck = {
  id,
  seite: z.enum(SEITEN).default("vorne"),
  /** Name im Editor (Ebenenliste). */
  name: z.string().trim().max(80).default(""),
  x: mm,
  y: mm,
  breite: mmPos,
  hoehe: mmPos,
};

const farbRef = z.string().trim().min(1).max(60);
const HINTERGRUND = { hintergrund: farbRef.nullable().default(null) } as const;

export const TextFeldSchema = z.object({
  typ: z.literal("text"),
  ...rechteck,
  /** Mehrere Zeilen mit \n; jede Zeile darf {{variablen}} enthalten. */
  vorlage: text(2000).min(1),
  /** einzeilig: kein Umbruch (zu breit = verkleinern oder Fehler); mehrzeilig: Umbruch an der Breite. */
  umbruch: z.enum(["einzeilig", "mehrzeilig"]).default("mehrzeilig"),
  ausrichtung: z.enum(["links", "zentriert", "rechts", "block"]).default("links"),
  vertikal: z.enum(["oben", "mitte", "unten"]).default("oben"),
  schrift: SchriftRefSchema.default({ familie: "Helvetica", fett: false, kursiv: false }),
  groesse: z.number().min(2).max(500).default(10),
  /** Faktor der Schriftgröße (1.2 = 120 %). */
  zeilenabstand: z.number().min(0.7).max(3).default(1.2),
  farbe: farbRef.default("Schwarz"),
  grossschreibung: z.enum(["keine", "gross"]).default("keine"),
  /** Mindestgröße in pt; gesetzt = "automatisch verkleinern, bis es passt". */
  verkleinernBis: z.number().min(2).max(500).nullable().default(null),
});
export type TextFeld = z.infer<typeof TextFeldSchema>;

export const BarcodeFeldSchema = z.object({
  typ: z.literal("barcode"),
  ...rechteck,
  symbologie: z.enum(SYMBOLOGIEN).default("code128"),
  /** Inhalt als Vorlage, z. B. "{{artikelnummer}}". */
  inhalt: text(500).min(1),
  /** Klartext unter dem Strichcode (nur lineare Codes). */
  klartext: z.boolean().default(true),
  schrift: SchriftRefSchema.default({ familie: "Helvetica", fett: false, kursiv: false }),
  farbe: farbRef.default("Schwarz"),
  /** Heller Untergrund hinter dem Code (Ruhezone); null = transparent. */
  ...HINTERGRUND,
  /** Ruhezone in Modulen, innerhalb des Rechtecks. */
  ruhezone: z.number().min(0).max(10).default(0),
  ausrichtung: z.enum(["links", "zentriert", "rechts"]).default("zentriert"),
});
export type BarcodeFeld = z.infer<typeof BarcodeFeldSchema>;

export const QrFeldSchema = z.object({
  typ: z.literal("qr"),
  ...rechteck,
  /** Freitext mit {{variablen}}, z. B. "https://example.com/p/{{id}}". */
  inhalt: text(1000).min(1),
  fehlerkorrektur: z.enum(["L", "M", "Q", "H"]).default("M"),
  farbe: farbRef.default("Schwarz"),
  ...HINTERGRUND,
  ruhezone: z.number().min(0).max(10).default(0),
});
export type QrFeld = z.infer<typeof QrFeldSchema>;

export const VCARD_EIGENSCHAFTEN = [
  "vorname",
  "nachname",
  "firma",
  "funktion",
  "telefon",
  "mobil",
  "fax",
  "email",
  "web",
  "strasse",
  "plz",
  "ort",
  "land",
  "notiz",
] as const;
export type VCardEigenschaft = (typeof VCARD_EIGENSCHAFTEN)[number];

export const VCardFeldSchema = z.object({
  typ: z.literal("vcard"),
  ...rechteck,
  /** Je vCard-Eigenschaft eine Vorlage, z. B. { vorname: "{{vorname}}", telefon: "+49 {{telefon}}" }. */
  zuordnung: z.partialRecord(z.enum(VCARD_EIGENSCHAFTEN), text(300)).default({}),
  fehlerkorrektur: z.enum(["L", "M", "Q", "H"]).default("M"),
  farbe: farbRef.default("Schwarz"),
  ...HINTERGRUND,
  ruhezone: z.number().min(0).max(10).default(0),
});
export type VCardFeld = z.infer<typeof VCardFeldSchema>;

export const BildFeldSchema = z.object({
  typ: z.literal("bild"),
  ...rechteck,
  /** Datei aus dem Dateispeicher (PNG oder JPEG), z. B. ein Logo. */
  dateiId: z.string().uuid().nullable().default(null),
  anpassung: z.enum(["einpassen", "fuellen"]).default("einpassen"),
});
export type BildFeld = z.infer<typeof BildFeldSchema>;

export const FeldSchema = z.discriminatedUnion("typ", [
  TextFeldSchema,
  BarcodeFeldSchema,
  QrFeldSchema,
  VCardFeldSchema,
  BildFeldSchema,
]);
export type Feld = z.infer<typeof FeldSchema>;
export type FeldTyp = Feld["typ"];

export const AusgabeSchema = z.object({
  modus: z.enum(["ausgeschossen", "einzeln"]).default("ausgeschossen"),
  bogen: z
    .object({ breite: mmPos, hoehe: mmPos })
    .default({ breite: 320, hoehe: 450 }),
  rand: z
    .object({
      oben: z.number().min(0).max(200),
      unten: z.number().min(0).max(200),
      links: z.number().min(0).max(200),
      rechts: z.number().min(0).max(200),
    })
    .default({ oben: 5, unten: 5, links: 5, rechts: 5 }),
  abstand: z
    .object({ spalten: z.number().min(0).max(100), zeilen: z.number().min(0).max(100) })
    .default({ spalten: 0, zeilen: 0 }),
  /** PDF mit Stanzkontur/Schnittmarken, wird (Seite 1) über jeden Bogen gelegt. */
  ueberlagerung: z.object({ dateiId: z.string().uuid(), nurVorderseite: z.boolean().default(false) }).nullable().default(null),
});
export type Ausgabe = z.infer<typeof AusgabeSchema>;

export const DesignSchema = z.object({
  /** Mehrseitiges Design-PDF im Dateispeicher; null solange noch nichts hochgeladen ist. */
  dateiId: z.string().uuid().nullable().default(null),
  /** Seitennummern (ab 1) im Design-PDF. */
  vorne: z.number().int().min(1).default(1),
  hinten: z.number().int().min(1).nullable().default(null),
  /** true: die Seiten sind Endformat + Beschnitt rundum groß; false: genau Endformat. */
  mitBeschnitt: z.boolean().default(false),
});
export type Design = z.infer<typeof DesignSchema>;

/** Struktur ohne Querprüfungen (Editor: halbfertige Arbeitskopien müssen ladbar sein). */
export const VorlageBasisSchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
    name: z.string().trim().min(1).max(120),
    beschreibung: text(1000).default(""),
    endformat: z.object({ breite: mmPos, hoehe: mmPos }),
    /** Beschnitt in mm rundum. */
    beschnitt: z.number().min(0).max(20).default(3),
    design: DesignSchema.default({ dateiId: null, vorne: 1, hinten: null, mitBeschnitt: false }),
    variablen: z.array(VariableSchema).max(60).default([]),
    felder: z.array(FeldSchema).max(200).default([]),
    ausgabe: AusgabeSchema.default({
      modus: "ausgeschossen",
      bogen: { breite: 320, hoehe: 450 },
      rand: { oben: 5, unten: 5, links: 5, rechts: 5 },
      abstand: { spalten: 0, zeilen: 0 },
      ueberlagerung: null,
    }),
  });

export const VorlageSchema = VorlageBasisSchema
  .superRefine((v, ctx) => {
    const schluessel = new Set<string>();
    v.variablen.forEach((va, i) => {
      if ((RESERVIERTE_SCHLUESSEL as readonly string[]).includes(va.schluessel)) {
        ctx.addIssue({ code: "custom", path: ["variablen", i, "schluessel"], message: `„${va.schluessel}“ ist reserviert` });
      }
      if (schluessel.has(va.schluessel)) {
        ctx.addIssue({ code: "custom", path: ["variablen", i, "schluessel"], message: `Variable „${va.schluessel}“ ist doppelt` });
      }
      schluessel.add(va.schluessel);
    });
    const ids = new Set<string>();
    v.felder.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: "custom", path: ["felder", i, "id"], message: `Feld-ID „${f.id}“ ist doppelt` });
      ids.add(f.id);
      if (f.seite === "hinten" && v.design.hinten === null) {
        ctx.addIssue({ code: "custom", path: ["felder", i, "seite"], message: "Die Vorlage hat keine Rückseite" });
      }
      const grenze = v.beschnitt;
      if (f.x < -grenze - 1e-6 || f.y < -grenze - 1e-6 || f.x + f.breite > v.endformat.breite + grenze + 1e-6 || f.y + f.hoehe > v.endformat.hoehe + grenze + 1e-6) {
        ctx.addIssue({ code: "custom", path: ["felder", i], message: `Feld „${f.name || f.id}“ liegt außerhalb des Formats` });
      }
      for (const key of variablenInFeld(f)) {
        if (!schluessel.has(key)) {
          ctx.addIssue({ code: "custom", path: ["felder", i], message: `Feld „${f.name || f.id}“ nutzt die unbekannte Variable {{${key}}}` });
        }
      }
    });
    if (v.design.hinten !== null && v.design.hinten === v.design.vorne && v.design.dateiId) {
      // erlaubt (gleiche Seite doppelt), aber ungewöhnlich – kein Fehler
    }
  });
export type Vorlage = z.infer<typeof VorlageSchema>;
/** Eingabeform (Defaults optional), z. B. für den Editor und Importer. */
export type VorlageEingabe = z.input<typeof VorlageSchema>;

/** Alle {{variablen}} in einem Text, in Reihenfolge des ersten Auftretens. */
export function variablenInText(vorlage: string): string[] {
  const out: string[] = [];
  for (const m of vorlage.matchAll(PLATZHALTER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Alle Variablen, die ein Feld verwendet. */
export function variablenInFeld(f: Feld): string[] {
  switch (f.typ) {
    case "text":
    case "barcode":
    case "qr":
      return variablenInText(f.typ === "text" ? f.vorlage : f.inhalt);
    case "vcard": {
      const out: string[] = [];
      for (const t of Object.values(f.zuordnung)) for (const k of variablenInText(t ?? "")) if (!out.includes(k)) out.push(k);
      return out;
    }
    default:
      return [];
  }
}

export function seiteVonFeld(f: Feld): Seite {
  return f.seite;
}

/** Namen aller Farben, die in der Vorlage vorkommen. */
export function farbenInVorlage(v: Vorlage): string[] {
  const out = new Set<string>();
  for (const f of v.felder) {
    if ("farbe" in f) out.add(f.farbe);
    if ("hintergrund" in f && f.hintergrund) out.add(f.hintergrund);
  }
  return [...out];
}

/** Familien (mit Schnitt), die in der Vorlage vorkommen. */
export function schriftenInVorlage(v: Vorlage): SchriftRef[] {
  const out = new Map<string, SchriftRef>();
  for (const f of v.felder) {
    if ("schrift" in f) out.set(`${f.schrift.familie}|${f.schrift.fett}|${f.schrift.kursiv}`, f.schrift);
  }
  return [...out.values()];
}

/** Bereitet eine Vorlage ohne Formfehler für die Aktivierung auf: was fehlt noch? */
export function aktivierungsProbleme(v: Vorlage): string[] {
  const p: string[] = [];
  if (!v.design.dateiId) p.push("Es ist noch kein Design-PDF hochgeladen.");
  if (v.felder.length === 0) p.push("Die Vorlage hat noch kein Feld.");
  if (v.variablen.length === 0) p.push("Die Vorlage hat keine Variablen.");
  return p;
}

/** Sichtbarkeit und Status gehören zum Vorlagen-Stamm, nicht zum versionierten Inhalt. */
export const STATUS = ["entwurf", "aktiv"] as const;
export type VorlagenStatus = (typeof STATUS)[number];
export const SICHTBARKEIT = ["mitarbeiter", "kunden", "oeffentlich"] as const;
export type Sichtbarkeit = (typeof SICHTBARKEIT)[number];

export const SICHTBARKEIT_NAMEN: Record<Sichtbarkeit, string> = {
  mitarbeiter: "Nur Mitarbeiter",
  kunden: "Bestimmte Kunden",
  oeffentlich: "Öffentlich per Link",
};

/** Ein Datensatz: Werte je Variablen-Schlüssel (immer Text) und Auflage. */
export const DatensatzSchema = z.object({
  werte: z.record(z.string().regex(VARIABLEN_SCHLUESSEL), z.string().max(2000)),
  /** Stückzahl dieses Datensatzes (Ausgeschossen: so viele Nutzen). */
  auflage: z.number().int().min(1).max(100000).default(1),
});
export type Datensatz = z.infer<typeof DatensatzSchema>;
export type DatensatzEingabe = z.input<typeof DatensatzSchema>;

/** Standardfarbe, falls die Palette keine "Schwarz"-Farbe enthält. */
export const STANDARD_FARBEN: Farbe[] = [
  { name: "Schwarz", cmyk: [0, 0, 0, 100], sonderfarbe: null },
  { name: "Weiß", cmyk: [0, 0, 0, 0], sonderfarbe: null },
];

/** Hilfsfunktion: Vorlage prüfen und mit Defaults auffüllen; Fehler als deutsche Liste. */
export function parseVorlage(eingabe: unknown): { ok: true; vorlage: Vorlage } | { ok: false; fehler: { pfad: string; text: string }[] } {
  const r = VorlageSchema.safeParse(eingabe);
  if (r.success) return { ok: true, vorlage: r.data };
  return { ok: false, fehler: r.error.issues.map((i) => ({ pfad: i.path.join("."), text: i.message })) };
}
