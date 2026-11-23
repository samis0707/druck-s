/**
 * Logik des visuellen Feld-Editors (rein, ohne React und ohne Browser-APIs, daher testbar):
 * Verlauf (Rückgängig/Wiederholen), Maßstab (mm ↔ px), Einrasten, Größe ändern, Felder und Eingaben
 * anlegen, Platzhalter einfügen, Warnungen. Koordinaten wie im Schema: mm, Ursprung oben links im Endformat.
 */
import {
  VCARD_EIGENSCHAFTEN,
  VARIABLEN_SCHLUESSEL,
  RESERVIERTE_SCHLUESSEL,
  variablenInFeld,
  type Feld,
  type FeldTyp,
  type Seite,
  type Variable,
  type Vorlage,
} from "../schema";

// ---------------------------------------------------------------------------------------------
// Verlauf

export interface Verlauf<T> {
  vergangen: T[];
  aktuell: T;
  zukunft: T[];
  /** Schlüssel und Zeit der letzten Änderung, damit Tippen in einem Feld nur einen Schritt ergibt */
  letzte: { schluessel: string; zeit: number } | null;
}

export const MAX_VERLAUF = 100;
const ZUSAMMENFASSEN_MS = 1200;

export function neuerVerlauf<T>(start: T): Verlauf<T> {
  return { vergangen: [], aktuell: start, zukunft: [], letzte: null };
}

/**
 * Neuen Stand setzen. Mit `schluessel` werden schnell aufeinanderfolgende Änderungen derselben Art
 * (z. B. Tippen in „Bezeichnung“) zu einem Schritt zusammengefasst.
 */
export function setze<T>(v: Verlauf<T>, neu: T, opt: { schluessel?: string; jetzt?: number } = {}): Verlauf<T> {
  if (Object.is(neu, v.aktuell)) return v;
  const jetzt = opt.jetzt ?? Date.now();
  const fasse = !!opt.schluessel && v.letzte?.schluessel === opt.schluessel && jetzt - v.letzte.zeit < ZUSAMMENFASSEN_MS && v.vergangen.length > 0;
  const vergangen = fasse ? v.vergangen : [...v.vergangen, v.aktuell].slice(-MAX_VERLAUF);
  return { vergangen, aktuell: neu, zukunft: [], letzte: opt.schluessel ? { schluessel: opt.schluessel, zeit: jetzt } : null };
}

/** Wie `setze`, aber ohne Schritt im Verlauf (während des Ziehens); `festhalten` macht daraus einen Schritt. */
export function setzeLive<T>(v: Verlauf<T>, neu: T): Verlauf<T> {
  return { ...v, aktuell: neu };
}

export function festhalten<T>(v: Verlauf<T>, vorher: T): Verlauf<T> {
  if (Object.is(vorher, v.aktuell)) return v;
  return { vergangen: [...v.vergangen, vorher].slice(-MAX_VERLAUF), aktuell: v.aktuell, zukunft: [], letzte: null };
}

export function rueckgaengig<T>(v: Verlauf<T>): Verlauf<T> {
  if (v.vergangen.length === 0) return v;
  const vergangen = v.vergangen.slice(0, -1);
  return { vergangen, aktuell: v.vergangen[v.vergangen.length - 1], zukunft: [v.aktuell, ...v.zukunft], letzte: null };
}

export function wiederholen<T>(v: Verlauf<T>): Verlauf<T> {
  if (v.zukunft.length === 0) return v;
  const [naechste, ...rest] = v.zukunft;
  return { vergangen: [...v.vergangen, v.aktuell], aktuell: naechste, zukunft: rest, letzte: null };
}

// ---------------------------------------------------------------------------------------------
// Maßstab: mm im Endformat (Ursprung oben links, ohne Beschnitt) ↔ Pixel auf der Arbeitsfläche,
// die das Endformat PLUS Beschnitt rundum zeigt.

export interface Massstab {
  pxProMm: number;
  beschnitt: number;
}

export function mmZuPx(mm: number, m: Massstab): number {
  return (mm + m.beschnitt) * m.pxProMm;
}
export function pxZuMm(px: number, m: Massstab): number {
  return px / m.pxProMm - m.beschnitt;
}
/** Längen (Breite/Höhe, Verschiebungen) ohne Beschnittversatz */
export function laengeZuPx(mm: number, m: Massstab): number {
  return mm * m.pxProMm;
}
export function laengeZuMm(px: number, m: Massstab): number {
  return px / m.pxProMm;
}

/** Auf 0,1 mm runden (so genau drucken die Maschinen; vermeidet 12.3000000001 in der Anzeige). */
export function rundeMm(v: number, schritt = 0.1): number {
  const r = Number((Math.round(v / schritt) * schritt).toFixed(3));
  return r === 0 ? 0 : r; // kein -0
}

export function anzeigeMm(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

// ---------------------------------------------------------------------------------------------
// Rechtecke und Einrasten

export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export interface Format {
  breite: number;
  hoehe: number;
  beschnitt: number;
}

export interface Hilfslinie {
  achse: "x" | "y";
  /** Position in mm */
  pos: number;
}

export const EINRAST_SCHWELLE_PX = 6;

/** Zielpositionen auf einer Achse: Seitenränder, -mitte, Beschnittkante und Kanten/Mitten anderer Felder. */
export function einrastZiele(achse: "x" | "y", format: Format, andere: Rechteck[]): number[] {
  const laenge = achse === "x" ? format.breite : format.hoehe;
  const ziele = [0, laenge / 2, laenge, -format.beschnitt, laenge + format.beschnitt];
  for (const r of andere) {
    const p = achse === "x" ? r.x : r.y;
    const l = achse === "x" ? r.breite : r.hoehe;
    ziele.push(p, p + l / 2, p + l);
  }
  return ziele;
}

/**
 * Kleinste Verschiebung, mit der einer der `werte` (Kante oder Mitte des bewegten Felds) auf ein Ziel rastet;
 * null, wenn nichts innerhalb der Schwelle liegt.
 */
export function besterRastversatz(werte: number[], ziele: number[], schwelle: number): { versatz: number; ziel: number } | null {
  let best: { versatz: number; ziel: number } | null = null;
  for (const w of werte) {
    for (const z of ziele) {
      const d = z - w;
      if (Math.abs(d) <= schwelle && (!best || Math.abs(d) < Math.abs(best.versatz) - 1e-9)) best = { versatz: d, ziel: z };
    }
  }
  return best;
}

export interface RastErgebnis {
  rechteck: Rechteck;
  linien: Hilfslinie[];
}

/** Beim Verschieben: linke Kante, Mitte und rechte Kante bzw. obere, Mitte, untere rasten an Zielen ein. */
export function rasteVerschieben(r: Rechteck, format: Format, andere: Rechteck[], schwelleMm: number): RastErgebnis {
  const linien: Hilfslinie[] = [];
  let { x, y } = r;
  const bx = besterRastversatz([r.x, r.x + r.breite / 2, r.x + r.breite], einrastZiele("x", format, andere), schwelleMm);
  if (bx) {
    x += bx.versatz;
    linien.push({ achse: "x", pos: bx.ziel });
  }
  const by = besterRastversatz([r.y, r.y + r.hoehe / 2, r.y + r.hoehe], einrastZiele("y", format, andere), schwelleMm);
  if (by) {
    y += by.versatz;
    linien.push({ achse: "y", pos: by.ziel });
  }
  return { rechteck: { ...r, x, y }, linien };
}

export type Griff = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const GRIFFE: Griff[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const MIN_GROESSE_MM = 2;

/**
 * Größe an einem Griff ändern. `dx`/`dy` in mm (bereits gerastet oder roh). Mit `quadrat` bleibt das Feld
 * quadratisch (QR, vCard, Data Matrix). Die Mindestgröße wird nie unterschritten; die gegenüberliegende Kante bleibt fest.
 */
export function groesseAendern(start: Rechteck, griff: Griff, dx: number, dy: number, opt: { quadrat?: boolean; min?: number } = {}): Rechteck {
  const min = opt.min ?? MIN_GROESSE_MM;
  let links = start.x;
  let oben = start.y;
  let rechts = start.x + start.breite;
  let unten = start.y + start.hoehe;
  if (griff.includes("w")) links = Math.min(links + dx, rechts - min);
  if (griff.includes("e")) rechts = Math.max(rechts + dx, links + min);
  if (griff.includes("n")) oben = Math.min(oben + dy, unten - min);
  if (griff.includes("s")) unten = Math.max(unten + dy, oben + min);
  if (opt.quadrat) {
    const kante = Math.max(rechts - links, unten - oben);
    // Die dem Griff gegenüberliegende Ecke bleibt stehen.
    const festLinks = griff.includes("e") || (!griff.includes("w") && !griff.includes("e"));
    const festOben = griff.includes("s") || (!griff.includes("n") && !griff.includes("s"));
    const nx = festLinks ? start.x : start.x + start.breite - kante;
    const ny = festOben ? start.y : start.y + start.hoehe - kante;
    return { x: nx, y: ny, breite: kante, hoehe: kante };
  }
  return { x: links, y: oben, breite: rechts - links, hoehe: unten - oben };
}

/** Beim Größenändern rasten die bewegten Kanten an Zielen ein. */
export function rasteGroesse(start: Rechteck, griff: Griff, dx: number, dy: number, format: Format, andere: Rechteck[], schwelleMm: number, opt: { quadrat?: boolean } = {}): RastErgebnis {
  const linien: Hilfslinie[] = [];
  let ddx = dx;
  let ddy = dy;
  if (!opt.quadrat) {
    if (griff.includes("w") || griff.includes("e")) {
      const kante = griff.includes("w") ? start.x + dx : start.x + start.breite + dx;
      const b = besterRastversatz([kante], einrastZiele("x", format, andere), schwelleMm);
      if (b) {
        ddx = dx + b.versatz;
        linien.push({ achse: "x", pos: b.ziel });
      }
    }
    if (griff.includes("n") || griff.includes("s")) {
      const kante = griff.includes("n") ? start.y + dy : start.y + start.hoehe + dy;
      const b = besterRastversatz([kante], einrastZiele("y", format, andere), schwelleMm);
      if (b) {
        ddy = dy + b.versatz;
        linien.push({ achse: "y", pos: b.ziel });
      }
    }
  }
  return { rechteck: groesseAendern(start, griff, ddx, ddy, opt), linien };
}

/** Pfeiltasten: 0,1 mm, mit Umschalt 1 mm. */
export function pfeilSchritt(shift: boolean): number {
  return shift ? 1 : 0.1;
}

export function verschiebe(r: Rechteck, dx: number, dy: number): Rechteck {
  return { ...r, x: rundeMm(r.x + dx), y: rundeMm(r.y + dy) };
}

// ---------------------------------------------------------------------------------------------
// Eingaben (Variablen)

const UMLAUTE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };

/** Platzhalter-Name aus der Bezeichnung: „Telefon (mobil)“ → telefon_mobil. Eindeutig unter `vorhandene`. */
export function schluesselAusBezeichnung(bezeichnung: string, vorhandene: Iterable<string> = []): string {
  const belegt = new Set(vorhandene);
  let s = bezeichnung
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTE[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = "feld";
  if (!/^[a-z]/.test(s)) s = `f_${s}`;
  s = s.slice(0, 36);
  if ((RESERVIERTE_SCHLUESSEL as readonly string[]).includes(s)) s = `${s}_1`;
  let kandidat = s;
  for (let n = 2; belegt.has(kandidat); n++) kandidat = `${s}_${n}`;
  if (!VARIABLEN_SCHLUESSEL.test(kandidat)) return "feld";
  return kandidat;
}

function ersetzeInText(text: string, alt: string, neu: string): string {
  return text.replace(new RegExp(`\\{\\{\\s*${alt}\\s*\\}\\}`, "g"), `{{${neu}}}`);
}

function ersetzeInFeld(f: Feld, alt: string, neu: string): Feld {
  switch (f.typ) {
    case "text":
      return { ...f, vorlage: ersetzeInText(f.vorlage, alt, neu) };
    case "barcode":
    case "qr":
      return { ...f, inhalt: ersetzeInText(f.inhalt, alt, neu) };
    case "vcard":
      return { ...f, zuordnung: Object.fromEntries(Object.entries(f.zuordnung).map(([k, t]) => [k, ersetzeInText(t ?? "", alt, neu)])) };
    default:
      return f;
  }
}

/** Platzhalter-Name ändern und alle Verweise in Feldern mitziehen. */
export function benenneVariableUm(v: Vorlage, alt: string, neu: string): Vorlage {
  if (alt === neu) return v;
  return {
    ...v,
    variablen: v.variablen.map((x) => (x.schluessel === alt ? { ...x, schluessel: neu } : x)),
    felder: v.felder.map((f) => ersetzeInFeld(f, alt, neu)),
  };
}

/** Bezeichnung ändern; der Platzhalter-Name folgt automatisch (und bleibt eindeutig). */
export function setzeBezeichnung(v: Vorlage, schluessel: string, bezeichnung: string): Vorlage {
  const andere = v.variablen.map((x) => x.schluessel).filter((k) => k !== schluessel);
  const neuerKey = schluesselAusBezeichnung(bezeichnung, andere);
  const mitText: Vorlage = { ...v, variablen: v.variablen.map((x) => (x.schluessel === schluessel ? { ...x, bezeichnung } : x)) };
  return benenneVariableUm(mitText, schluessel, neuerKey);
}

export function aktualisiereVariable(v: Vorlage, schluessel: string, teil: Partial<Omit<Variable, "schluessel">>): Vorlage {
  return { ...v, variablen: v.variablen.map((x) => (x.schluessel === schluessel ? { ...x, ...teil } : x)) };
}

/** Neue Eingabe (Variable) mit der Bezeichnung; liefert Vorlage und den vergebenen Schlüssel. */
export function fuegeVariableHinzu(v: Vorlage, bezeichnung: string, beispiel = ""): { vorlage: Vorlage; schluessel: string } {
  const schluessel = schluesselAusBezeichnung(bezeichnung, v.variablen.map((x) => x.schluessel));
  return { vorlage: { ...v, variablen: [...v.variablen, { schluessel, bezeichnung, pflicht: false, beispiel, maxLaenge: null, hilfe: "" }] }, schluessel };
}

/** In welchen Feldern wird die Variable verwendet? */
export function felderMitVariable(v: Vorlage, schluessel: string): Feld[] {
  return v.felder.filter((f) => variablenInFeld(f).includes(schluessel));
}

/** Variablen entfernen, die kein Feld mehr nutzt – aber nur aus der Menge `kandidaten`. */
function raeumeVariablenAuf(v: Vorlage, kandidaten: string[]): Vorlage {
  const benutzt = new Set(v.felder.flatMap((f) => variablenInFeld(f)));
  return { ...v, variablen: v.variablen.filter((x) => !kandidaten.includes(x.schluessel) || benutzt.has(x.schluessel)) };
}

export function entferneVariable(v: Vorlage, schluessel: string): Vorlage {
  const felder = v.felder.map((f) => ersetzeInFeld(f, schluessel, "__entfernt__"));
  // Verweise entfernen statt dangling lassen: {{x}} → leer
  const ohne = felder.map((f) => {
    const leer = (t: string) => t.replace(/\{\{\s*__entfernt__\s*\}\}/g, "");
    if (f.typ === "text") return { ...f, vorlage: leer(f.vorlage) || " " };
    if (f.typ === "barcode" || f.typ === "qr") return { ...f, inhalt: leer(f.inhalt) || " " };
    if (f.typ === "vcard") return { ...f, zuordnung: Object.fromEntries(Object.entries(f.zuordnung).filter(([, t]) => leer(t ?? "").trim() !== "")) };
    return f;
  }) as Feld[];
  return { ...v, variablen: v.variablen.filter((x) => x.schluessel !== schluessel), felder: ohne };
}

// ---------------------------------------------------------------------------------------------
// Felder

export type FeldArt = "text" | "mehrzeilig" | "qr" | "vcard" | "barcode";

export const FELD_ARTEN: { art: FeldArt; name: string; hilfe: string; beispiel: string }[] = [
  { art: "text", name: "Text", hilfe: "Eine Zeile, z. B. ein Name", beispiel: "Erika Mustermann" },
  { art: "mehrzeilig", name: "Mehrzeiliger Text", hilfe: "Mehrere Zeilen mit Umbruch, z. B. eine Adresse", beispiel: "Musterstraße 1\n74076 Heilbronn" },
  { art: "qr", name: "QR-Code", hilfe: "Link oder Text als QR-Code", beispiel: "https://example.com" },
  { art: "vcard", name: "vCard-QR", hilfe: "Kontakt zum Speichern im Handy", beispiel: "" },
  { art: "barcode", name: "Barcode", hilfe: "Strichcode, z. B. EAN oder Code 128", beispiel: "4006381333931" },
];

const STANDARD_GROESSE: Record<FeldArt, { breite: number; hoehe: number }> = {
  text: { breite: 50, hoehe: 7 },
  mehrzeilig: { breite: 50, hoehe: 20 },
  qr: { breite: 20, hoehe: 20 },
  vcard: { breite: 20, hoehe: 20 },
  barcode: { breite: 40, hoehe: 14 },
};

function eindeutigeFeldId(v: Vorlage, basis: string): string {
  const ids = new Set(v.felder.map((f) => f.id));
  const b = basis.replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "feld";
  let id = b;
  for (let n = 2; ids.has(id); n++) id = `${b}-${n}`;
  return id;
}

function anzahlArt(v: Vorlage, art: FeldArt): number {
  return v.felder.filter((f) => (art === "mehrzeilig" ? f.typ === "text" && f.umbruch === "mehrzeilig" : art === "text" ? f.typ === "text" && f.umbruch === "einzeilig" : f.typ === art)).length;
}

/** Feld mittig auf der Seite anlegen (mit passender Eingabe), liefert die neue Vorlage und die Feld-ID. */
export function fuegeFeldHinzu(v: Vorlage, art: FeldArt, seite: Seite): { vorlage: Vorlage; id: string } {
  const g = STANDARD_GROESSE[art];
  const breite = Math.min(g.breite, v.endformat.breite);
  const hoehe = Math.min(g.hoehe, v.endformat.hoehe);
  const info = FELD_ARTEN.find((a) => a.art === art)!;
  const nr = anzahlArt(v, art) + 1;
  const grund = {
    seite,
    x: rundeMm((v.endformat.breite - breite) / 2),
    y: rundeMm((v.endformat.hoehe - hoehe) / 2),
    breite,
    hoehe,
  };
  let w = v;
  let feld: Feld;
  const id = eindeutigeFeldId(v, art === "mehrzeilig" ? "text" : art);
  const name = `${info.name} ${nr}`;
  if (art === "text" || art === "mehrzeilig") {
    const r = fuegeVariableHinzu(w, name, info.beispiel);
    w = r.vorlage;
    feld = { typ: "text", id, name, ...grund, vorlage: `{{${r.schluessel}}}`, umbruch: art === "text" ? "einzeilig" : "mehrzeilig", ausrichtung: "links", vertikal: "oben", schrift: { familie: "Helvetica", fett: false, kursiv: false }, groesse: 10, zeilenabstand: 1.2, farbe: "Schwarz", grossschreibung: "keine", verkleinernBis: null };
  } else if (art === "qr") {
    const r = fuegeVariableHinzu(w, "QR-Inhalt", info.beispiel);
    w = r.vorlage;
    feld = { typ: "qr", id, name, ...grund, inhalt: `{{${r.schluessel}}}`, fehlerkorrektur: "M", farbe: "Schwarz", hintergrund: null, ruhezone: 0 };
  } else if (art === "barcode") {
    const r = fuegeVariableHinzu(w, "Artikelnummer", info.beispiel);
    w = r.vorlage;
    feld = { typ: "barcode", id, name, ...grund, symbologie: "code128", inhalt: `{{${r.schluessel}}}`, klartext: true, schrift: { familie: "Helvetica", fett: false, kursiv: false }, farbe: "Schwarz", hintergrund: null, ruhezone: 0, ausrichtung: "zentriert" };
  } else {
    // vCard: bereits vorhandene Eingaben mit passendem Namen werden automatisch zugeordnet.
    const zuordnung: Record<string, string> = {};
    for (const e of VCARD_EIGENSCHAFTEN) {
      const treffer = w.variablen.find((x) => x.schluessel === e || schluesselAusBezeichnung(x.bezeichnung) === e);
      if (treffer) zuordnung[e] = `{{${treffer.schluessel}}}`;
    }
    feld = { typ: "vcard", id, name, ...grund, zuordnung, fehlerkorrektur: "M", farbe: "Schwarz", hintergrund: null, ruhezone: 0 };
  }
  return { vorlage: { ...w, felder: [...w.felder, feld] }, id };
}

export function aktualisiereFeld(v: Vorlage, id: string, teil: Partial<Feld>): Vorlage {
  return { ...v, felder: v.felder.map((f) => (f.id === id ? ({ ...f, ...teil } as Feld) : f)) };
}

export function setzeRechteck(v: Vorlage, id: string, r: Rechteck): Vorlage {
  return aktualisiereFeld(v, id, { x: rundeMm(r.x), y: rundeMm(r.y), breite: rundeMm(r.breite), hoehe: rundeMm(r.hoehe) });
}

/** Feld löschen; Eingaben, die nur dieses Feld nutzte, verschwinden mit (Rückgängig bringt alles zurück). */
export function entferneFeld(v: Vorlage, id: string): Vorlage {
  const feld = v.felder.find((f) => f.id === id);
  if (!feld) return v;
  const ohne: Vorlage = { ...v, felder: v.felder.filter((f) => f.id !== id) };
  return raeumeVariablenAuf(ohne, variablenInFeld(feld));
}

/** Feld duplizieren (leicht versetzt); Eingaben bleiben gemeinsam. */
export function dupliziereFeld(v: Vorlage, id: string): { vorlage: Vorlage; id: string } | null {
  const f = v.felder.find((x) => x.id === id);
  if (!f) return null;
  const neueId = eindeutigeFeldId(v, f.id.replace(/-\d+$/, ""));
  const kopie = { ...f, id: neueId, name: f.name ? `${f.name} (Kopie)` : "", x: rundeMm(f.x + 3), y: rundeMm(f.y + 3) } as Feld;
  return { vorlage: { ...v, felder: [...v.felder, kopie] }, id: neueId };
}

/** Reihenfolge (Ebene) ändern: -1 nach hinten, +1 nach vorn. */
export function verschiebeEbene(v: Vorlage, id: string, richtung: -1 | 1): Vorlage {
  const i = v.felder.findIndex((f) => f.id === id);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= v.felder.length) return v;
  const felder = [...v.felder];
  [felder[i], felder[j]] = [felder[j], felder[i]];
  return { ...v, felder };
}

export function istQuadratisch(typ: FeldTyp | string): boolean {
  return typ === "qr" || typ === "vcard";
}

// ---------------------------------------------------------------------------------------------
// Platzhalter einfügen

/** `{{schluessel}}` an der Cursorposition (oder ersetzt die Markierung) einfügen. */
export function fuegePlatzhalterEin(text: string, start: number, ende: number, schluessel: string): { text: string; cursor: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(ende, text.length));
  const ph = `{{${schluessel}}}`;
  return { text: text.slice(0, s) + ph + text.slice(e), cursor: s + ph.length };
}

// ---------------------------------------------------------------------------------------------
// Warnungen

export interface FeldWarnung {
  feldId: string | null;
  schwere: "fehler" | "hinweis";
  text: string;
}

/** Sicherheitsabstand zum Schnittrand für Text, in mm */
export const SICHERHEITSABSTAND_MM = 3;

/** Verständliche Warnungen zu Lage und Größe der Felder (die Engine meldet „Text passt nicht“ extra). */
export function feldWarnungen(v: Vorlage): FeldWarnung[] {
  const w: FeldWarnung[] = [];
  const b = v.beschnitt;
  const W = v.endformat.breite;
  const H = v.endformat.hoehe;
  for (const f of v.felder) {
    const name = f.name || f.id;
    const links = f.x;
    const rechts = f.x + f.breite;
    const oben = f.y;
    const unten = f.y + f.hoehe;
    if (links < -b - 1e-6 || oben < -b - 1e-6 || rechts > W + b + 1e-6 || unten > H + b + 1e-6) {
      w.push({ feldId: f.id, schwere: "fehler", text: `„${name}“ liegt außerhalb des Druckbereichs. Bitte nach innen schieben.` });
    } else if (links < -1e-6 || oben < -1e-6 || rechts > W + 1e-6 || unten > H + 1e-6) {
      w.push({ feldId: f.id, schwere: "hinweis", text: `„${name}“ ragt in den Beschnitt. Das ist nur für Hintergründe gedacht; Text und Codes können abgeschnitten werden.` });
    } else if (f.typ !== "bild" && (links < SICHERHEITSABSTAND_MM || oben < SICHERHEITSABSTAND_MM || W - rechts < SICHERHEITSABSTAND_MM || H - unten < SICHERHEITSABSTAND_MM)) {
      w.push({ feldId: f.id, schwere: "hinweis", text: `„${name}“ liegt näher als ${SICHERHEITSABSTAND_MM} mm am Rand und könnte beim Schneiden angeschnitten werden.` });
    }
    if (f.breite < MIN_GROESSE_MM || f.hoehe < MIN_GROESSE_MM) {
      w.push({ feldId: f.id, schwere: "hinweis", text: `„${name}“ ist sehr klein.` });
    }
    if ((f.typ === "qr" || f.typ === "vcard") && Math.min(f.breite, f.hoehe) < 15) {
      w.push({ feldId: f.id, schwere: "hinweis", text: `„${name}“ ist kleiner als 15 mm; so kleine QR-Codes lassen sich schlecht scannen.` });
    }
    if (f.typ === "vcard" && Object.keys(f.zuordnung).length === 0) {
      w.push({ feldId: f.id, schwere: "fehler", text: `„${name}“ hat noch keine Kontaktdaten. Bitte unter „Eigenschaften“ zuordnen.` });
    }
    const unbekannt = variablenInFeld(f).filter((k) => !v.variablen.some((x) => x.schluessel === k));
    if (unbekannt.length) w.push({ feldId: f.id, schwere: "fehler", text: `„${name}“ nutzt eine Eingabe, die es nicht gibt: ${unbekannt.map((k) => `{{${k}}}`).join(", ")}.` });
    if (f.typ === "text" && variablenInFeld(f).length === 0) {
      w.push({ feldId: f.id, schwere: "hinweis", text: `„${name}“ enthält keine Eingabe, der Text ist für alle Kunden gleich.` });
    }
    if (f.seite === "hinten" && v.design.hinten === null) {
      w.push({ feldId: f.id, schwere: "fehler", text: `„${name}“ liegt auf der Rückseite, aber die Vorlage hat keine Rückseite.` });
    }
  }
  // Eingaben ohne Feld
  for (const x of v.variablen) {
    if (!v.felder.some((f) => variablenInFeld(f).includes(x.schluessel))) {
      w.push({ feldId: null, schwere: "hinweis", text: `Die Eingabe „${x.bezeichnung}“ wird in keinem Feld verwendet.` });
    }
  }
  return w;
}

/** Wurde die Vorlage so weit bearbeitet, dass sie veröffentlicht werden kann? Liste der Gründe (leer = ja). */
export function veroeffentlichungsProbleme(v: Vorlage): string[] {
  const p: string[] = [];
  if (!v.design.dateiId) p.push("Es ist noch kein Design-PDF hochgeladen.");
  if (v.felder.length === 0) p.push("Die Vorlage hat noch kein Feld. Fügen Sie im Schritt „Felder“ mindestens eines hinzu.");
  if (v.variablen.length === 0) p.push("Die Vorlage hat keine Eingaben für Kunden.");
  for (const x of feldWarnungen(v)) if (x.schwere === "fehler") p.push(x.text);
  return p;
}
