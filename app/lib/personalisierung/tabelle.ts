/**
 * Tabellen-Import und -Export für Personalisierungs-Datensätze (CSV und XLSX). Isomorph.
 *
 * Bibliothekswahl: das npm-Paket `xlsx` (SheetJS) 0.18.x hat bekannte Schwachstellen (Prototype
 * Pollution CVE-2023-30533, ReDoS CVE-2024-22363) und wird auf npm nicht mehr gepflegt; `exceljs`
 * zieht einen großen, teils veralteten Abhängigkeitsbaum nach. Stattdessen lesen und schreiben wir
 * das schmale Format selbst auf Basis von `fflate` (ZIP) und `fast-xml-parser`, die ohnehin
 * Abhängigkeiten sind: reines JS, keine nativen Module, volle Kontrolle über Größenlimits
 * (Zip-Bomben) und darüber, dass ALLE Werte als Text gelesen werden (führende Nullen bleiben,
 * Zellen werden nie als Formel ausgewertet; gelesen wird nur der gespeicherte Wert).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { Datensatz, Variable, Vorlage } from "./schema";

export const TABELLEN_GRENZEN = {
  maxBytes: 10 * 1024 * 1024,
  /** Entpackte Größe aller Teile (Schutz vor Zip-Bomben) */
  maxEntpackt: 60 * 1024 * 1024,
  maxZeilen: 5000,
  maxSpalten: 100,
  maxZelleZeichen: 2000,
};

export class TabellenFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TabellenFehler";
  }
}

export interface Tabelle {
  format: "csv" | "xlsx";
  kopf: string[];
  /** Datenzeilen, alle Werte als Text; jede Zeile hat so viele Zellen wie `kopf`. */
  zeilen: string[][];
  /** nur CSV */
  trennzeichen?: string;
  kodierung?: "utf-8" | "windows-1252" | "utf-16";
}

// ---------------------------------------------------------------------------------------------
// Dekodierung und CSV

export function dekodiereText(bytes: Uint8Array): { text: string; kodierung: "utf-8" | "windows-1252" | "utf-16" } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), kodierung: "utf-16" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), kodierung: "utf-16" };
  const ohneBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(ohneBom), kodierung: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(ohneBom), kodierung: "windows-1252" };
  }
}

/** Trennzeichen aus den ersten Zeilen erkennen (außerhalb von Anführungszeichen). */
export function erkenneTrennzeichen(text: string): string {
  const kandidaten = [";", ",", "\t", "|"];
  const zeilen: string[] = [];
  let aktuell = "";
  let inQuote = false;
  for (const ch of text.slice(0, 20000)) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && (ch === "\n" || ch === "\r")) {
      if (aktuell) zeilen.push(aktuell);
      aktuell = "";
      if (zeilen.length >= 10) break;
    } else aktuell += ch;
  }
  if (aktuell && zeilen.length < 10) zeilen.push(aktuell);
  let best = ";";
  let bestScore = -1;
  for (const k of kandidaten) {
    const counts = zeilen.map((z) => {
      let n = 0;
      let q = false;
      for (const ch of z) {
        if (ch === '"') q = !q;
        else if (ch === k && !q) n++;
      }
      return n;
    });
    if (counts.length === 0 || counts[0] === 0) continue;
    const gleich = counts.filter((c) => c === counts[0]).length;
    const score = counts[0] * 10 + gleich; // viele Spalten und gleichmäßig
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best;
}

export function parseCsvText(text: string, trenn: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === trenn) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      if (rows.length > TABELLEN_GRENZEN.maxZeilen + 2) throw new TabellenFehler(`Die Tabelle hat zu viele Zeilen (höchstens ${TABELLEN_GRENZEN.maxZeilen}).`);
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalisiereTabelle(roh: string[][], format: "csv" | "xlsx"): Tabelle {
  const g = TABELLEN_GRENZEN;
  const nichtLeer = (r: string[]) => r.some((c) => c.trim() !== "");
  const zeilenRoh = roh.filter(nichtLeer);
  if (zeilenRoh.length === 0) throw new TabellenFehler("Die Tabelle ist leer.");
  const kopfRoh = zeilenRoh[0].map((c) => c.trim());
  let breite = kopfRoh.length;
  while (breite > 0 && kopfRoh[breite - 1] === "") breite--;
  if (breite === 0) throw new TabellenFehler("Die erste Zeile muss die Spaltenüberschriften enthalten.");
  if (breite > g.maxSpalten) throw new TabellenFehler(`Die Tabelle hat zu viele Spalten (höchstens ${g.maxSpalten}).`);
  if (zeilenRoh.length - 1 > g.maxZeilen) throw new TabellenFehler(`Die Tabelle hat zu viele Zeilen (höchstens ${g.maxZeilen}).`);
  const kopf = kopfRoh.slice(0, breite);
  const zeilen = zeilenRoh.slice(1).map((r) => {
    const z: string[] = [];
    for (let i = 0; i < breite; i++) {
      const v = (r[i] ?? "").replace(/\u0000/g, "");
      if (v.length > g.maxZelleZeichen) throw new TabellenFehler(`Eine Zelle ist zu lang (höchstens ${g.maxZelleZeichen} Zeichen).`);
      z.push(v);
    }
    return z;
  });
  return { format, kopf, zeilen };
}

export function leseCsv(bytes: Uint8Array): Tabelle {
  const { text, kodierung } = dekodiereText(bytes);
  const trenn = erkenneTrennzeichen(text);
  const t = normalisiereTabelle(parseCsvText(text, trenn), "csv");
  return { ...t, trennzeichen: trenn, kodierung };
}

// ---------------------------------------------------------------------------------------------
// XLSX lesen

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (name) => ["row", "c", "si", "r", "sheet", "Relationship", "t"].includes(name),
});

type Knoten = Record<string, unknown>;

function textVon(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string") return n;
  if (typeof n === "number" || typeof n === "boolean") return String(n);
  if (Array.isArray(n)) return n.map(textVon).join("");
  const o = n as Knoten;
  if ("t" in o) return textVon(o.t);
  if ("#text" in o) return textVon(o["#text"]);
  return "";
}

/** Rich-Text-Zeichenkette (<si>): <t> oder mehrere <r><t>; Phonetik (<rPh>) wird übergangen. */
function stringItem(si: Knoten): string {
  if (si.t !== undefined) return textVon(si.t);
  if (Array.isArray(si.r)) return si.r.map((r) => textVon((r as Knoten).t)).join("");
  return "";
}

function spaltenIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function leseXlsx(bytes: Uint8Array): Tabelle {
  const g = TABELLEN_GRENZEN;
  if (bytes.length > g.maxBytes) throw new TabellenFehler("Die Datei ist zu groß.");
  let gesamt = 0;
  let teile: Record<string, Uint8Array>;
  try {
    teile = unzipSync(bytes, {
      filter: (f) => {
        gesamt += f.originalSize;
        if (gesamt > g.maxEntpackt) throw new TabellenFehler("Die Datei ist entpackt zu groß.");
        return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof TabellenFehler) throw e;
    throw new TabellenFehler("Die Datei ist keine gültige Excel-Datei (.xlsx).");
  }
  const wb = teile["xl/workbook.xml"];
  if (!wb) throw new TabellenFehler("Die Datei ist keine gültige Excel-Datei (.xlsx).");
  const wbXml = xml.parse(strFromU8(wb)) as Knoten;
  const sheets = ((wbXml.workbook as Knoten)?.sheets as Knoten)?.sheet as Knoten[] | undefined;
  const erstes = sheets?.[0];
  if (!erstes) throw new TabellenFehler("Die Excel-Datei enthält kein Tabellenblatt.");
  const rid = erstes["@r:id"] ?? erstes["@id"];
  let sheetPfad = "xl/worksheets/sheet1.xml";
  const rels = teile["xl/_rels/workbook.xml.rels"];
  if (rels && rid) {
    const relXml = xml.parse(strFromU8(rels)) as Knoten;
    const list = ((relXml.Relationships as Knoten)?.Relationship as Knoten[]) ?? [];
    const ziel = list.find((r) => r["@Id"] === rid)?.["@Target"];
    if (typeof ziel === "string") sheetPfad = ziel.startsWith("/") ? ziel.slice(1) : `xl/${ziel.replace(/^\.\//, "")}`;
  }
  const blatt = teile[sheetPfad];
  if (!blatt) throw new TabellenFehler("Das erste Tabellenblatt der Excel-Datei konnte nicht gelesen werden.");
  const shared: string[] = [];
  if (teile["xl/sharedStrings.xml"]) {
    const ss = xml.parse(strFromU8(teile["xl/sharedStrings.xml"])) as Knoten;
    for (const si of ((ss.sst as Knoten)?.si as Knoten[]) ?? []) shared.push(stringItem(si));
  }
  const sx = xml.parse(strFromU8(blatt)) as Knoten;
  const rowsXml = (((sx.worksheet as Knoten)?.sheetData as Knoten)?.row as Knoten[]) ?? [];
  const roh: string[][] = [];
  for (const row of rowsXml) {
    const zeile: string[] = [];
    let naechste = 0;
    for (const c of (row.c as Knoten[]) ?? []) {
      const ref = typeof c["@r"] === "string" ? (c["@r"] as string) : "";
      const idx = ref ? spaltenIndex(ref) : naechste;
      if (idx < 0 || idx >= g.maxSpalten * 2) continue;
      naechste = idx + 1;
      const typ = c["@t"];
      let wert = "";
      if (typ === "s") wert = shared[Number(textVon(c.v))] ?? "";
      else if (typ === "inlineStr") wert = stringItem((c.is as Knoten) ?? {});
      else if (typ === "b") wert = textVon(c.v) === "1" ? "WAHR" : "FALSCH";
      else if (typ === "e") wert = "";
      else wert = textVon(c.v); // Zahl oder str: gespeicherter Wert, unverändert als Text
      while (zeile.length < idx) zeile.push("");
      zeile[idx] = wert.replace(/\r\n?/g, "\n");
    }
    const rowNr = typeof row["@r"] === "string" ? Number(row["@r"]) : roh.length + 1;
    while (roh.length + 1 < rowNr && roh.length < g.maxZeilen + 2) roh.push([]);
    roh.push(zeile);
    if (roh.length > g.maxZeilen + 2) throw new TabellenFehler(`Die Tabelle hat zu viele Zeilen (höchstens ${g.maxZeilen}).`);
  }
  return normalisiereTabelle(roh, "xlsx");
}

/** Format an der Dateisignatur erkennen (ZIP = XLSX), sonst CSV. */
export function leseTabelle(bytes: Uint8Array): Tabelle {
  if (bytes.length > TABELLEN_GRENZEN.maxBytes) throw new TabellenFehler("Die Datei ist zu groß.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return leseXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new TabellenFehler("Das alte Excel-Format (.xls) wird nicht unterstützt. Bitte als .xlsx oder .csv speichern.");
  return leseCsv(bytes);
}

// ---------------------------------------------------------------------------------------------
// Spaltenzuordnung

const AUFLAGE_NAMEN = ["auflage", "anzahl", "menge", "stueckzahl", "stueck", "stk", "exemplare", "qty", "quantity"];

/** Vergleichsform: klein, Umlaute aufgelöst, ohne Satz-/Leerzeichen und Pflicht-Markierungen. */
export function normalisiereName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((optional|pflicht)\)/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface Spaltenzuordnung {
  /** je Variablen-Schlüssel der Spaltenindex oder null */
  variablen: Record<string, number | null>;
  auflage: number | null;
  /** Spalten der Tabelle, die keiner Variablen zugeordnet wurden */
  unbenutzt: number[];
  /** Variablen ohne Spalte; `pflicht` nur die, die ausgefüllt sein müssen */
  fehlend: { schluessel: string; bezeichnung: string; pflicht: boolean }[];
}

/** Spalten automatisch zuordnen (Schlüssel, Bezeichnung, tolerant). Die UI lässt das bestätigen/ändern. */
export function ordneSpalten(kopf: string[], variablen: Variable[]): Spaltenzuordnung {
  const norm = kopf.map(normalisiereName);
  const benutzt = new Set<number>();
  const zuordnung: Record<string, number | null> = {};
  const finde = (pred: (n: string) => boolean): number | null => {
    const i = norm.findIndex((n, idx) => !benutzt.has(idx) && n !== "" && pred(n));
    return i === -1 ? null : i;
  };
  // 1. exakt (Schlüssel oder Bezeichnung)
  for (const v of variablen) {
    const namen = [normalisiereName(v.schluessel), normalisiereName(v.bezeichnung)];
    const i = finde((n) => namen.includes(n));
    zuordnung[v.schluessel] = i;
    if (i !== null) benutzt.add(i);
  }
  const auflage = finde((n) => AUFLAGE_NAMEN.includes(n));
  if (auflage !== null) benutzt.add(auflage);
  // 2. eindeutiges Enthaltensein (z. B. "Telefonnummer" für "Telefon"), nur wenn genau eine Variable passt
  for (const v of variablen) {
    if (zuordnung[v.schluessel] !== null) continue;
    const namen = [normalisiereName(v.schluessel), normalisiereName(v.bezeichnung)].filter((n) => n.length >= 3);
    const kandidaten = norm.map((n, i) => i).filter((i) => !benutzt.has(i) && norm[i] !== "" && namen.some((n) => norm[i].includes(n) || (norm[i].length >= 3 && n.includes(norm[i]))));
    if (kandidaten.length === 1) {
      const andere = variablen.filter((o) => o !== v && zuordnung[o.schluessel] === null).some((o) => {
        const on = [normalisiereName(o.schluessel), normalisiereName(o.bezeichnung)].filter((n) => n.length >= 3);
        return on.some((n) => norm[kandidaten[0]].includes(n) || n.includes(norm[kandidaten[0]]));
      });
      if (!andere) {
        zuordnung[v.schluessel] = kandidaten[0];
        benutzt.add(kandidaten[0]);
      }
    }
  }
  return {
    variablen: zuordnung,
    auflage,
    unbenutzt: kopf.map((_k, i) => i).filter((i) => !benutzt.has(i)),
    fehlend: variablen.filter((v) => zuordnung[v.schluessel] === null).map((v) => ({ schluessel: v.schluessel, bezeichnung: v.bezeichnung, pflicht: v.pflicht })),
  };
}

export interface TabellenDatensaetze {
  datensaetze: Datensatz[];
  /** Hinweise zum Import (deutsch), z. B. ungültige Auflage */
  warnungen: string[];
}

/** Tabelle mit (bestätigter) Zuordnung in Datensätze umwandeln. Datensatz 1 = erste Datenzeile. */
export function tabelleZuDatensaetzen(t: Tabelle, z: Spaltenzuordnung): TabellenDatensaetze {
  const warnungen: string[] = [];
  const datensaetze = t.zeilen.map((zeile, i) => {
    const werte: Record<string, string> = {};
    for (const [key, idx] of Object.entries(z.variablen)) werte[key] = idx === null ? "" : (zeile[idx] ?? "").trim();
    let auflage = 1;
    if (z.auflage !== null) {
      const roh = (zeile[z.auflage] ?? "").trim();
      if (roh !== "") {
        const n = Number(roh.replace(",", "."));
        if (Number.isInteger(n) && n >= 1 && n <= 100000) auflage = n;
        else warnungen.push(`Datensatz ${i + 1}: Die Auflage „${roh.slice(0, 20)}“ ist keine ganze Zahl ab 1; es wird 1 verwendet.`);
      }
    }
    return { werte, auflage };
  });
  return { datensaetze, warnungen };
}

// ---------------------------------------------------------------------------------------------
// Export (Beispieltabelle, Datentabelle)

/**
 * Formel-Injection verhindern (CSV wird von Excel geöffnet und ausgewertet): Werte, die mit
 * = @ Tab oder CR beginnen, und + oder - gefolgt von etwas, das keine Zahl/Telefonnummer ist,
 * bekommen ein vorangestelltes Hochkomma.
 */
export function entschaerfeZelle(wert: string): string {
  if (wert === "") return wert;
  const c = wert[0];
  if (c === "=" || c === "@" || c === "\t" || c === "\r") return `'${wert}`;
  if ((c === "+" || c === "-") && !/^[+-]?[\d\s().\/-]+$/.test(wert)) return `'${wert}`;
  return wert;
}

export function schreibeCsv(kopf: string[], zeilen: string[][]): Uint8Array {
  const zelle = (v: string) => {
    const s = entschaerfeZelle(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [kopf, ...zeilen].map((r) => r.map(zelle).join(";")).join("\r\n") + "\r\n";
  const body = strToU8(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

function xmlEsc(s: string): string {
  // Steuerzeichen sind in XML 1.0 unzulässig
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spaltenBuchstabe(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * XLSX schreiben. Alle Zellen sind Textzellen (Textformat „@“, auch für leere Spalten), so
 * bleiben führende Nullen erhalten und nichts wird als Formel ausgewertet.
 */
export function schreibeXlsx(kopf: string[], zeilen: string[][], blattName = "Daten"): Uint8Array {
  const zelle = (v: string, r: number, c: number, stil: number) =>
    v === "" ? `<c r="${spaltenBuchstabe(c)}${r}" s="${stil}"/>` : `<c r="${spaltenBuchstabe(c)}${r}" s="${stil}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  const rows = [kopf, ...zeilen]
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => zelle(v, ri + 1, ci, ri === 0 ? 2 : 1)).join("")}</row>`)
    .join("");
  const spalten = kopf.length;
  const breiten = Array.from({ length: spalten }, (_v, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(40, Math.max(14, kopf[i].length + 4))}" style="1" customWidth="1"/>`).join("");
  const dateien: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(blattName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${breiten}</cols><sheetData>${rows}</sheetData></worksheet>`,
    ),
  };
  return zipSync(dateien, { level: 6 });
}

/** Kopf und Beispielzeile einer Vorlage: Spalten = Bezeichnungen der Variablen, plus „Auflage“. */
export function beispielTabelle(vorlage: Pick<Vorlage, "variablen">): { kopf: string[]; zeilen: string[][] } {
  const kopf = [...vorlage.variablen.map((v) => v.bezeichnung + (v.pflicht ? " *" : "")), "Auflage"];
  const zeilen = [[...vorlage.variablen.map((v) => v.beispiel), "100"]];
  return { kopf, zeilen };
}

export function beispielXlsx(vorlage: Pick<Vorlage, "variablen">): Uint8Array {
  const t = beispielTabelle(vorlage);
  return schreibeXlsx(t.kopf, t.zeilen);
}

export function beispielCsv(vorlage: Pick<Vorlage, "variablen">): Uint8Array {
  const t = beispielTabelle(vorlage);
  return schreibeCsv(t.kopf, t.zeilen);
}

/** Datentabelle der Datensätze (für die Ablage bei der Anfrage). Spalten: Schlüssel-Bezeichnungen + Auflage. */
export function datensaetzeXlsx(vorlage: Pick<Vorlage, "variablen">, datensaetze: Datensatz[]): Uint8Array {
  const kopf = [...vorlage.variablen.map((v) => v.bezeichnung), "Auflage"];
  const zeilen = datensaetze.map((d) => [...vorlage.variablen.map((v) => d.werte[v.schluessel] ?? ""), String(d.auflage)]);
  return schreibeXlsx(kopf, zeilen);
}
