import type { Farbe, SchriftSchnitt } from "../schema";

export type Schwere = "fehler" | "warnung";

export type MeldungCode =
  | "pflicht_leer"
  | "zu_lang"
  | "text_passt_nicht"
  | "zeichen_fehlt"
  | "barcode_ungueltig"
  | "qr_zu_gross"
  | "schrift_fehlt"
  | "farbe_fehlt"
  | "bild_fehlt"
  | "unbekannte_variable"
  | "text_verkleinert"
  | "design_groesse"
  | "sonderfarbe_fallback";

/** Strukturierte, deutsch formulierte Meldung; die UI zeigt `text` direkt an. */
export interface Meldung {
  schwere: Schwere;
  code: MeldungCode;
  /** 1-basierte Nummer des Datensatzes (Tabellenzeile ohne Kopf); null = gilt für die Vorlage. */
  datensatz: number | null;
  feld: string | null;
  variable: string | null;
  text: string;
}

export interface SchriftDatei {
  familie: string;
  schnitt: SchriftSchnitt;
  bytes: Uint8Array;
}

/** Alle Binärdaten, die die Engine braucht (der Aufrufer lädt sie aus dem Speicher bzw. dem Browser). */
export interface Ressourcen {
  design: Uint8Array | null;
  ueberlagerung?: Uint8Array | null;
  schriften: SchriftDatei[];
  bilder: Record<string, Uint8Array>;
  farben: Farbe[];
}

export interface Messer {
  breite(text: string, groesse: number): number;
  ascent(groesse: number): number;
  descent(groesse: number): number;
  hatZeichen(codePoint: number): boolean;
}
