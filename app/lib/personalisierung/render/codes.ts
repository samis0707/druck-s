/** Strichcodes, QR-Codes und vCard als Vektor-Rechtecke (keine Bitmaps). Isomorph. */
import bwipjs from "bwip-js/generic";
import * as QRCode from "qrcode";
import type { Symbologie, VCardEigenschaft } from "../schema";

/** Rechtecke in Modul-Einheiten, Ursprung oben links, y nach unten. */
export interface CodeForm {
  art: "linear" | "matrix";
  breite: number;
  hoehe: number;
  /** [x, y, breite, hoehe] */
  rechtecke: [number, number, number, number][];
  /** Seitenverhältnis eines Moduls (Höhe/Breite), meist 1; bei PDF417 etwa 3. */
  modulAspekt: number;
}

const ZIFFERN = /^\d+$/;

function pruefziffer(ziffern: string): number {
  // GS1-Modulo-10: von rechts mit 3,1,3,1 ... gewichten
  let summe = 0;
  for (let i = 0; i < ziffern.length; i++) {
    const z = Number(ziffern[ziffern.length - 1 - i]);
    summe += z * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (summe % 10)) % 10;
}

export interface BarcodePruefung {
  ok: boolean;
  /** Deutsche Fehlermeldung (ohne den Inhalt zu nennen) */
  fehler: string | null;
  /** Inhalt, wie er gedruckt wird (z. B. mit ergänzter Prüfziffer) */
  text: string;
}

/** Inhalt vorab prüfen; ergänzt fehlende Prüfziffern (EAN, UPC, ITF-14). */
export function pruefeBarcodeInhalt(sym: Symbologie, roh: string): BarcodePruefung {
  const t = roh.trim();
  const fehler = (f: string): BarcodePruefung => ({ ok: false, fehler: f, text: t });
  const gtin = (laengen: number[], name: string): BarcodePruefung => {
    if (!ZIFFERN.test(t)) return fehler(`${name} darf nur Ziffern enthalten.`);
    const ohne = Math.min(...laengen);
    const mit = Math.max(...laengen);
    if (t.length === ohne) return { ok: true, fehler: null, text: t + pruefziffer(t) };
    if (t.length !== mit) return fehler(`${name} braucht ${ohne} oder ${mit} Ziffern (angegeben: ${t.length}).`);
    if (pruefziffer(t.slice(0, -1)) !== Number(t.slice(-1))) {
      return fehler(`Die Prüfziffer von ${name} stimmt nicht (richtig wäre ${pruefziffer(t.slice(0, -1))}).`);
    }
    return { ok: true, fehler: null, text: t };
  };
  if (t === "") return fehler("Der Inhalt ist leer.");
  switch (sym) {
    case "ean13":
      return gtin([12, 13], "EAN-13");
    case "ean8":
      return gtin([7, 8], "EAN-8");
    case "upca":
      return gtin([11, 12], "UPC-A");
    case "itf14":
      return gtin([13, 14], "ITF-14");
    case "interleaved2of5":
      if (!ZIFFERN.test(t)) return fehler("Interleaved 2 of 5 darf nur Ziffern enthalten.");
      if (t.length % 2 !== 0) return fehler("Interleaved 2 of 5 braucht eine gerade Anzahl Ziffern.");
      return { ok: true, fehler: null, text: t };
    case "code39":
      if (!/^[A-Z0-9 \-.$/+%]+$/.test(t)) return fehler("Code 39 erlaubt nur Großbuchstaben A–Z, Ziffern und - . $ / + % und Leerzeichen.");
      return { ok: true, fehler: null, text: t };
    case "code128":
    case "code93":
    case "pdf417":
    case "azteccode":
    case "datamatrix":
      if (/[^\u0000-\u00ff]/.test(t)) return fehler("Der Code unterstützt nur Zeichen aus dem westeuropäischen Zeichensatz.");
      return { ok: true, fehler: null, text: t };
    case "gs1-128":
    case "gs1datamatrix":
      if (!/^(\(\d{2,4}\)[^()]+)+$/.test(t)) return fehler("GS1-Codes brauchen Datenbezeichner in Klammern, z. B. (01)09501101530003(10)A123.");
      return { ok: true, fehler: null, text: t };
    default:
      return { ok: true, fehler: null, text: t };
  }
}

const cache = new Map<string, CodeForm | string>();

/** Strichcode als Rechtecke. Wirft `Error` mit deutscher Meldung bei ungültigem Inhalt. */
export function barcodeForm(sym: Symbologie, text: string): CodeForm {
  const key = `${sym}\u0000${text}`;
  const hit = cache.get(key);
  if (typeof hit === "string") throw new Error(hit);
  if (hit) return hit;
  try {
    const raw = bwipjs.raw({ bcid: sym, text, includetext: false })[0] as Record<string, unknown>;
    const form = rawZuForm(raw);
    if (cache.size > 500) cache.clear();
    cache.set(key, form);
    return form;
  } catch {
    const msg = "Der Inhalt ist für diesen Codetyp ungültig.";
    if (cache.size > 500) cache.clear();
    cache.set(key, msg);
    throw new Error(msg);
  }
}

function rawZuForm(raw: Record<string, unknown>): CodeForm {
  if (Array.isArray(raw.pixs)) {
    const pixs = raw.pixs as number[];
    const bx = raw.pixx as number;
    const by = raw.pixy as number;
    const aspekt = typeof raw.width === "number" && typeof raw.height === "number" && raw.width > 0 ? raw.height / by / (raw.width / bx) : 1;
    return { art: "matrix", breite: bx, hoehe: by * aspekt, rechtecke: matrixRechtecke((x, y) => pixs[y * bx + x] === 1, bx, by, aspekt), modulAspekt: aspekt };
  }
  const sbs = raw.sbs as number[];
  const bhs = raw.bhs as number[];
  const bbs = raw.bbs as number[];
  const basis = Math.min(...bhs);
  const unten = Math.min(...bbs.map((b) => b / basis));
  const oben = Math.max(...bhs.map((h, i) => (bbs[i] + h) / basis));
  const rechtecke: [number, number, number, number][] = [];
  let x = 0;
  let balken = 0;
  for (let i = 0; i < sbs.length; i++) {
    if (i % 2 === 0) {
      const h = bhs[balken] / basis;
      const y0 = bbs[balken] / basis - unten;
      rechtecke.push([x, oben - unten - y0 - h, sbs[i], h]);
      balken++;
    }
    x += sbs[i];
  }
  return { art: "linear", breite: x, hoehe: oben - unten, rechtecke, modulAspekt: 1 };
}

/** Dunkle Module zeilenweise zu Rechtecken zusammenfassen. */
function matrixRechtecke(dunkel: (x: number, y: number) => boolean, w: number, h: number, aspekt: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!dunkel(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && dunkel(x, y)) x++;
      out.push([start, y * aspekt, x - start, aspekt]);
    }
  }
  return out;
}

/** QR-Code als Rechtecke. Wirft `Error` mit deutscher Meldung, wenn der Inhalt zu lang ist. */
export function qrForm(inhalt: string, fehlerkorrektur: "L" | "M" | "Q" | "H"): CodeForm {
  let qr: ReturnType<typeof QRCode.create>;
  try {
    qr = QRCode.create(inhalt, { errorCorrectionLevel: fehlerkorrektur });
  } catch {
    throw new Error("Der Inhalt ist für einen QR-Code zu lang.");
  }
  const n = qr.modules.size;
  const data = qr.modules.data;
  return { art: "matrix", breite: n, hoehe: n, rechtecke: matrixRechtecke((x, y) => data[y * n + x] === 1, n, n, 1), modulAspekt: 1 };
}

function vcEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\;").replace(/,/g, "\\,");
}

/** vCard 3.0 (breit kompatibel). `felder` enthält die bereits eingesetzten Werte. Leer = null. */
export function baueVCard(felder: Partial<Record<VCardEigenschaft, string>>): string | null {
  const f = (k: VCardEigenschaft) => (felder[k] ?? "").trim();
  const name = [f("vorname"), f("nachname")].filter(Boolean).join(" ");
  const anzeige = name || f("firma");
  if (!anzeige) return null;
  const z: string[] = ["BEGIN:VCARD", "VERSION:3.0", `N:${vcEscape(f("nachname"))};${vcEscape(f("vorname"))};;;`, `FN:${vcEscape(anzeige)}`];
  if (f("firma")) z.push(`ORG:${vcEscape(f("firma"))}`);
  if (f("funktion")) z.push(`TITLE:${vcEscape(f("funktion"))}`);
  if (f("telefon")) z.push(`TEL;TYPE=WORK,VOICE:${vcEscape(f("telefon"))}`);
  if (f("mobil")) z.push(`TEL;TYPE=CELL:${vcEscape(f("mobil"))}`);
  if (f("fax")) z.push(`TEL;TYPE=WORK,FAX:${vcEscape(f("fax"))}`);
  if (f("email")) z.push(`EMAIL;TYPE=INTERNET,WORK:${vcEscape(f("email"))}`);
  if (f("web")) z.push(`URL:${vcEscape(f("web"))}`);
  if (f("strasse") || f("plz") || f("ort") || f("land")) {
    z.push(`ADR;TYPE=WORK:;;${vcEscape(f("strasse"))};${vcEscape(f("ort"))};;${vcEscape(f("plz"))};${vcEscape(f("land"))}`);
  }
  if (f("notiz")) z.push(`NOTE:${vcEscape(f("notiz"))}`);
  z.push("END:VCARD");
  return z.join("\r\n");
}
