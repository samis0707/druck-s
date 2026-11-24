/** Prüfung hochgeladener Dateien (Design-PDF, Überlagerung, Bilder, Schriften). Nur Node (Server). */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { MM } from "./render/geometrie";
import type { SchriftSchnitt } from "./schema";

export class PersFehler extends Error {
  constructor(
    message: string,
    /** HTTP-nahe Einordnung für die Routen */
    public readonly status: 400 | 403 | 404 | 409 | 413 | 429 | 503 = 400,
    public readonly code = "ungueltig",
  ) {
    super(message);
    this.name = "PersFehler";
  }
}

export interface PdfInfo {
  seiten: number;
  /** Maße der ersten Seite in mm */
  breiteMm: number;
  hoeheMm: number;
  /** Maße je Seite (mm), damit die UI „mit Beschnitt“ vorschlagen kann */
  seitenMasse: {
    breiteMm: number;
    hoeheMm: number;
    /** Endformat laut TrimBox, wenn das PDF eine kleinere TrimBox als die MediaBox enthält (mm) */
    trim?: { breiteMm: number; hoeheMm: number; beschnittMm: number | null };
  }[];
}

export const MAX_PDF_SEITEN = 50;

export async function pruefePdf(bytes: Uint8Array, maxBytes: number): Promise<PdfInfo> {
  if (bytes.length > maxBytes) throw new PersFehler(`Die Datei ist zu groß (höchstens ${Math.floor(maxBytes / 1024 / 1024)} MB).`, 413, "zu_gross");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new PersFehler("Die Datei ist kein PDF.");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new PersFehler("Das PDF ist beschädigt oder verschlüsselt und kann nicht gelesen werden.");
  }
  const n = doc.getPageCount();
  if (n < 1) throw new PersFehler("Das PDF hat keine Seiten.");
  if (n > MAX_PDF_SEITEN) throw new PersFehler(`Das PDF hat zu viele Seiten (höchstens ${MAX_PDF_SEITEN}).`);
  const seitenMasse = doc.getPages().map((p) => {
    const { x, y, width, height } = p.getMediaBox();
    const mm = (v: number) => Math.round((v / MM) * 100) / 100;
    const out: PdfInfo["seitenMasse"][number] = { breiteMm: mm(width), hoeheMm: mm(height) };
    const t = p.getTrimBox();
    const kleiner = t.width < width - 0.5 * MM || t.height < height - 0.5 * MM;
    if (kleiner && t.width > 0 && t.height > 0) {
      const rand = [t.x - x, y + height - (t.y + t.height), x + width - (t.x + t.width), t.y - y].map(mm);
      const gleich = rand.every((r) => Math.abs(r - rand[0]) <= 0.3 && r >= 0);
      out.trim = { breiteMm: mm(t.width), hoeheMm: mm(t.height), beschnittMm: gleich ? Math.round(rand[0] * 10) / 10 : null };
    }
    return out;
  });
  return { seiten: n, breiteMm: seitenMasse[0].breiteMm, hoeheMm: seitenMasse[0].hoeheMm, seitenMasse };
}

export async function pruefeBild(bytes: Uint8Array, maxBytes: number): Promise<{ mime: "image/png" | "image/jpeg"; breite: number; hoehe: number }> {
  if (bytes.length > maxBytes) throw new PersFehler(`Das Bild ist zu groß (höchstens ${Math.floor(maxBytes / 1024 / 1024)} MB).`, 413, "zu_gross");
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!png && !jpg) throw new PersFehler("Es werden nur PNG- und JPEG-Bilder unterstützt.");
  try {
    const doc = await PDFDocument.create();
    const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    return { mime: png ? "image/png" : "image/jpeg", breite: img.width, hoehe: img.height };
  } catch {
    throw new PersFehler("Das Bild konnte nicht gelesen werden.");
  }
}

export interface SchriftInfo {
  familie: string;
  schnitt: SchriftSchnitt;
}

/** TTF/OTF prüfen und Familie/Schnitt aus den Namenstabellen lesen (Vorschlag für die UI). */
export function pruefeSchrift(bytes: Uint8Array, maxBytes: number): SchriftInfo {
  if (bytes.length > maxBytes) throw new PersFehler(`Die Schrift ist zu groß (höchstens ${Math.floor(maxBytes / 1024 / 1024)} MB).`, 413, "zu_gross");
  const magic = Buffer.from(bytes.subarray(0, 4)).toString("latin1");
  const ok = magic === "\u0000\u0001\u0000\u0000" || magic === "OTTO" || magic === "true";
  if (!ok) throw new PersFehler("Es werden nur TTF- und OTF-Schriften unterstützt.");
  try {
    const f = fontkit.create(Buffer.from(bytes)) as unknown as { familyName?: string; subfamilyName?: string };
    const familie = (f.familyName ?? "").trim();
    if (!familie) throw new Error("kein Name");
    const sub = (f.subfamilyName ?? "").toLowerCase();
    const fett = /bold|black|heavy/.test(sub);
    const kursiv = /italic|oblique/.test(sub);
    return { familie, schnitt: fett && kursiv ? "bolditalic" : fett ? "bold" : kursiv ? "italic" : "regular" };
  } catch {
    throw new PersFehler("Die Schriftdatei ist beschädigt und kann nicht gelesen werden.");
  }
}
