/**
 * Render-Engine: Vorlage + Datensätze -> PDF. Isomorph (Browser für die Live-Vorschau, Node für die
 * finale Erzeugung). Nur pdf-lib, @pdf-lib/fontkit, bwip-js, qrcode. Keine Bitmaps für Codes.
 *
 * Sonderfarben werden als Separation-Farbraum mit CMYK-Ersatz geschrieben (Low-Level-Objekte).
 */
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFPage,
  StandardFonts,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import {
  STANDARD_FARBEN,
  variablenInFeld,
  type BarcodeFeld,
  type BildFeld,
  type Datensatz,
  type DatensatzEingabe,
  type Farbe,
  type Feld,
  type QrFeld,
  type SchriftRef,
  type TextFeld,
  type VCardFeld,
  type Vorlage,
} from "../schema";
import { barcodeForm, baueVCard, pruefeBarcodeInhalt, qrForm, type CodeForm } from "./codes";
import { berechneNutzen, MM, zellenPosition } from "./geometrie";
import { fuelleInhalt, fuelleVorlage, ordneText, saeubereWert, type TextLayout } from "./text";
import type { Messer, Meldung, MeldungCode, Ressourcen, Schwere } from "./typen";

export const STANDARD_GRENZEN = {
  /** Datensätze je Erzeugung */
  maxDatensaetze: 2000,
  /** Nutzen insgesamt (Datensätze × Auflage) */
  maxNutzen: 20000,
};
export type Grenzen = typeof STANDARD_GRENZEN;

/** Fehler, der dem Nutzer verständlich erklärt werden kann (Grenzwert, unpassendes Layout). */
export class RenderFehler extends Error {
  constructor(
    message: string,
    public readonly code: "zu_viele_datensaetze" | "zu_viele_nutzen" | "nutzen_passt_nicht" | "design_fehlt" | "design_ungueltig" | "seite_fehlt",
  ) {
    super(message);
    this.name = "RenderFehler";
  }
}

export interface ErzeugOptionen {
  modus?: "ausgeschossen" | "einzeln";
  grenzen?: Partial<Grenzen>;
  /** Auch bei Fehlern ein PDF liefern (Vorschau). Standard: nein. */
  trotzFehlern?: boolean;
}

export interface Ergebnis {
  /** null, wenn Fehler-Meldungen vorliegen und `trotzFehlern` nicht gesetzt ist */
  pdf: Uint8Array | null;
  meldungen: Meldung[];
  /** Anzahl Seiten im PDF */
  seiten: number;
  /** Anzahl Nutzen (Datensätze × Auflage), ausgeschossen: gedruckte Nutzen */
  nutzen: number;
  /** Druckbögen (nur ausgeschossen; Vorder- und Rückseite zählen je als Seite) */
  boegen: number | null;
}

// ---------------------------------------------------------------------------------------------
// Kontext: Schriften, Farben, Bilder, Design

interface Kontext {
  doc: PDFDocument;
  vorlage: Vorlage;
  farben: Map<string, Farbe>;
  fontCache: Map<string, { font: PDFFont; messer: Messer }>;
  ressourcen: Ressourcen;
  spots: Map<string, { name: string; ref: PDFRef }>;
  fontNamen: Map<PDFFont, string>;
  bildNamen: Map<PDFImage, string>;
  bilder: Map<string, PDFImage | null>;
  vorlagenMeldungen: Meldung[];
}

const SPOT_UNGUELTIG = /[^A-Za-z0-9 _.-]/g;

function meldung(schwere: Schwere, code: MeldungCode, datensatz: number | null, feld: string | null, variable: string | null, text: string): Meldung {
  return { schwere, code, datensatz, feld, variable, text };
}

function feldName(f: Feld): string {
  return f.name || f.id;
}

function standardFont(ref: SchriftRef): StandardFonts {
  if (ref.fett && ref.kursiv) return StandardFonts.HelveticaBoldOblique;
  if (ref.fett) return StandardFonts.HelveticaBold;
  if (ref.kursiv) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function schnittVon(ref: SchriftRef): "regular" | "bold" | "italic" | "bolditalic" {
  return ref.fett && ref.kursiv ? "bolditalic" : ref.fett ? "bold" : ref.kursiv ? "italic" : "regular";
}

async function holeSchrift(ctx: Kontext, ref: SchriftRef, fuerFeld: string): Promise<{ font: PDFFont; messer: Messer }> {
  const schnitt = schnittVon(ref);
  const key = `${ref.familie}|${schnitt}`;
  const hit = ctx.fontCache.get(key);
  if (hit) return hit;
  let font: PDFFont;
  if (ref.familie === "Helvetica") {
    font = await ctx.doc.embedFont(standardFont(ref));
  } else {
    const familie = ctx.ressourcen.schriften.filter((s) => s.familie === ref.familie);
    let datei = familie.find((s) => s.schnitt === schnitt);
    if (!datei && familie.length > 0) {
      datei = familie.find((s) => s.schnitt === "regular") ?? familie[0];
      ctx.vorlagenMeldungen.push(
        meldung("warnung", "schrift_fehlt", null, fuerFeld, null, `Von der Schrift „${ref.familie}“ gibt es den Schnitt „${schnitt}“ nicht; es wird ein anderer Schnitt verwendet.`),
      );
    }
    if (!datei) {
      ctx.vorlagenMeldungen.push(
        meldung("warnung", "schrift_fehlt", null, fuerFeld, null, `Die Schrift „${ref.familie}“ ist nicht in der Schriftbibliothek; es wird Helvetica verwendet.`),
      );
      font = await ctx.doc.embedFont(standardFont(ref));
    } else {
      try {
        font = await ctx.doc.embedFont(datei.bytes, { subset: true });
      } catch {
        ctx.vorlagenMeldungen.push(
          meldung("fehler", "schrift_fehlt", null, fuerFeld, null, `Die Schriftdatei „${ref.familie}“ ist beschädigt und konnte nicht geladen werden.`),
        );
        font = await ctx.doc.embedFont(standardFont(ref));
      }
    }
  }
  // Breite = Summe der Zeichenbreiten (ohne Kerning): so wird der Text tatsächlich gesetzt
  // (pdf-lib schreibt Glyphen ohne Positionskorrektur) und Messungen bleiben billig.
  const zeichenBreiten = new Map<string, number>();
  let zeichen: Set<number> | null = null;
  const messer: Messer = {
    breite(text, groesse) {
      let summe = 0;
      for (const ch of text) {
        let w = zeichenBreiten.get(ch);
        if (w === undefined) {
          w = font.widthOfTextAtSize(ch, 1000);
          zeichenBreiten.set(ch, w);
        }
        summe += w;
      }
      return (summe * groesse) / 1000;
    },
    ascent: (g) => font.heightAtSize(g, { descender: false }),
    descent: (g) => font.heightAtSize(g) - font.heightAtSize(g, { descender: false }),
    hatZeichen(cp) {
      if (cp <= 32) return true;
      zeichen ??= new Set(font.getCharacterSet());
      return zeichen.has(cp);
    },
  };
  const eintrag = { font, messer };
  ctx.fontCache.set(key, eintrag);
  return eintrag;
}

function holeFarbe(ctx: Kontext, name: string, fuerFeld: string): Farbe {
  const f = ctx.farben.get(name);
  if (f) return f;
  ctx.vorlagenMeldungen.push(meldung("warnung", "farbe_fehlt", null, fuerFeld, null, `Die Farbe „${name}“ gibt es nicht in der Farbpalette; es wird Schwarz verwendet.`));
  return ctx.farben.get("Schwarz") ?? STANDARD_FARBEN[0];
}

async function holeBild(ctx: Kontext, id: string): Promise<PDFImage | null> {
  if (ctx.bilder.has(id)) return ctx.bilder.get(id) ?? null;
  const bytes = ctx.ressourcen.bilder[id];
  let img: PDFImage | null = null;
  if (bytes) {
    try {
      img = bytes[0] === 0x89 ? await ctx.doc.embedPng(bytes) : await ctx.doc.embedJpg(bytes);
    } catch {
      img = null;
    }
  }
  ctx.bilder.set(id, img);
  return img;
}

// ---------------------------------------------------------------------------------------------
// Zeichnen: je Datensatz und Seite entsteht EIN Inhaltsstring relativ zur linken oberen Ecke des
// Endformats (y nach oben, also negativ). Er wird je Nutzen mit einer Verschiebung (cm) wiederverwendet;
// das spart bei hoher Auflage Rechenzeit und Speicher. Schriften, Sonderfarben und Bilder liegen
// unter festen Namen (F0…, Sp0…, Im0…) in den Ressourcen jeder Seite.

function z(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Operatoren, die die Füllfarbe setzen (Prozess-CMYK oder Separation). */
function fuellfarbe(ctx: Kontext, farbe: Farbe): string {
  const [c, m, y, k] = farbe.cmyk;
  if (!farbe.sonderfarbe) return `${z(c / 100)} ${z(m / 100)} ${z(y / 100)} ${z(k / 100)} k\n`;
  const name = farbe.sonderfarbe.replace(SPOT_UNGUELTIG, "_");
  const key = `${name}|${farbe.cmyk.join(",")}`;
  let eintrag = ctx.spots.get(key);
  if (!eintrag) {
    const fn = ctx.doc.context.register(
      ctx.doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [c / 100, m / 100, y / 100, k / 100], N: 1 }),
    );
    const ref = ctx.doc.context.register(ctx.doc.context.obj([PDFName.of("Separation"), PDFName.of(name), PDFName.of("DeviceCMYK"), fn]));
    eintrag = { name: `Sp${ctx.spots.size}`, ref };
    ctx.spots.set(key, eintrag);
  }
  return `/${eintrag.name} cs 1 scn\n`;
}

function fontName(ctx: Kontext, font: PDFFont): string {
  let n = ctx.fontNamen.get(font);
  if (!n) {
    n = `F${ctx.fontNamen.size}`;
    ctx.fontNamen.set(font, n);
  }
  return n;
}

function rechteckeString(rects: [number, number, number, number][]): string {
  let o = "";
  for (const [x, y, w, h] of rects) o += `${z(x)} ${z(y)} ${z(w)} ${z(h)} re\n`;
  return o + "f\n";
}

function textBody(ctx: Kontext, f: TextFeld, layout: TextLayout, font: PDFFont, farbe: Farbe): string {
  let o = `q\n${fuellfarbe(ctx, farbe)}BT\n/${fontName(ctx, font)} ${z(layout.groesse)} Tf\n`;
  let letzte = { x: 0, y: 0 };
  const x0 = f.x * MM;
  const yTop = -f.y * MM;
  for (const zeile of layout.zeilen) {
    for (const t of zeile.teile) {
      if (t.text === "") continue;
      const x = x0 + t.x;
      const y = yTop - zeile.grundlinie;
      o += `${z(x - letzte.x)} ${z(y - letzte.y)} Td\n${font.encodeText(t.text).toString()} Tj\n`;
      letzte = { x, y };
    }
  }
  return o + "ET\nQ\n";
}

function codeBody(ctx: Kontext, f: BarcodeFeld | QrFeld | VCardFeld, form: CodeForm, klartext: string | null, font: PDFFont | null, farbe: Farbe, hintergrund: Farbe | null): string {
  const fx = f.x * MM;
  const fw = f.breite * MM;
  const fh = f.hoehe * MM;
  const fy = -f.y * MM - fh; // untere Kante
  let o = "";
  if (hintergrund) o += `q\n${fuellfarbe(ctx, hintergrund)}${rechteckeString([[fx, fy, fw, fh]])}Q\n`;
  const ruhe = f.ruhezone;
  const rects: [number, number, number, number][] = [];
  let text = "";
  if (form.art === "linear") {
    const textH = klartext && font ? Math.min(9, Math.max(5, fh * 0.2)) : 0;
    const barH = Math.max(1, fh - (textH > 0 ? textH * 1.25 : 0));
    const modul = fw / (form.breite + 2 * ruhe);
    const sy = barH / form.hoehe;
    for (const [x, y, w, h] of form.rechtecke) rects.push([fx + (x + ruhe) * modul, fy + fh - barH + (form.hoehe - y - h) * sy, w * modul, h * sy]);
    if (textH > 0 && klartext && font) {
      const breite = font.widthOfTextAtSize(klartext, textH);
      text = `BT\n/${fontName(ctx, font)} ${z(textH)} Tf\n${z(fx + (fw - breite) / 2)} ${z(fy + textH * 0.2)} Td\n${font.encodeText(klartext).toString()} Tj\nET\n`;
    }
  } else {
    const s = Math.min(fw / (form.breite + 2 * ruhe), fh / (form.hoehe + 2 * ruhe));
    const gw = (form.breite + 2 * ruhe) * s;
    const gh = (form.hoehe + 2 * ruhe) * s;
    const ausr = "ausrichtung" in f ? f.ausrichtung : "zentriert";
    const gx = fx + (ausr === "links" ? 0 : ausr === "rechts" ? fw - gw : (fw - gw) / 2);
    const gy = fy + (fh - gh) / 2;
    // Module in Modul-Einheiten (kurze Zahlen) mit einer Skalierung, y nach unten.
    let r = "";
    for (const [x, y, w, h] of form.rechtecke) r += `${x + ruhe} ${y + ruhe} ${w} ${h} re\n`;
    return o + `q\n${fuellfarbe(ctx, farbe)}${z(s)} 0 0 ${z(-s)} ${z(gx)} ${z(gy + gh)} cm\n${r}f\nQ\n`;
  }
  return o + `q\n${fuellfarbe(ctx, farbe)}${rechteckeString(rects)}${text}Q\n`;
}

function bildBody(ctx: Kontext, f: BildFeld, bild: PDFImage): string {
  const fw = f.breite * MM;
  const fh = f.hoehe * MM;
  const fx = f.x * MM;
  const fy = -f.y * MM - fh;
  const { width, height } = bild;
  const s = f.anpassung === "fuellen" ? Math.max(fw / width, fh / height) : Math.min(fw / width, fh / height);
  const w = width * s;
  const h = height * s;
  let name = ctx.bildNamen.get(bild);
  if (!name) {
    name = `Im${ctx.bildNamen.size}`;
    ctx.bildNamen.set(bild, name);
  }
  const klemme = f.anpassung === "fuellen" ? `${z(fx)} ${z(fy)} ${z(fw)} ${z(fh)} re W n\n` : "";
  return `q\n${klemme}${z(w)} 0 0 ${z(h)} ${z(fx + (fw - w) / 2)} ${z(fy + (fh - h) / 2)} cm\n/${name} Do\nQ\n`;
}

/** Ressourcen (Schriften, Sonderfarben, Bilder) in eine Seite eintragen. */
function registriereRessourcen(page: PDFPage, ctx: Kontext) {
  const res = page.node.Resources();
  if (!res) throw new Error("Seite ohne Ressourcen");
  const hole = (key: string): PDFDict => {
    let d = res.lookupMaybe(PDFName.of(key), PDFDict);
    if (!d) {
      d = ctx.doc.context.obj({});
      res.set(PDFName.of(key), d);
    }
    return d;
  };
  if (ctx.fontNamen.size) {
    const d = hole("Font");
    for (const [font, name] of ctx.fontNamen) d.set(PDFName.of(name), font.ref);
  }
  if (ctx.spots.size) {
    const d = hole("ColorSpace");
    for (const e of ctx.spots.values()) d.set(PDFName.of(e.name), e.ref);
  }
  if (ctx.bildNamen.size) {
    const d = hole("XObject");
    for (const [bild, name] of ctx.bildNamen) d.set(PDFName.of(name), bild.ref);
  }
}

/** Inhalt eines Datensatzes an Position (ox, oy) = linke obere Ecke des Endformats (PDF-Punkte). */
function platziere(page: PDFPage, ctx: Kontext, body: string, ox: number, oy: number) {
  if (body === "") return;
  const ref = ctx.doc.context.register(ctx.doc.context.flateStream(`q\n1 0 0 1 ${z(ox)} ${z(oy)} cm\n${body}Q\n`));
  page.node.addContentStream(ref);
}

// ---------------------------------------------------------------------------------------------
// Datensatz -> Items + Meldungen

function werteVon(vorlage: Vorlage, ds: Datensatz): Record<string, string> {
  const w: Record<string, string> = {};
  for (const v of vorlage.variablen) w[v.schluessel] = saeubereWert(ds.werte[v.schluessel], true);
  return w;
}

/** Meldungen, die nur von den Werten abhängen (Pflicht, Länge). */
function pruefeWerte(vorlage: Vorlage, werte: Record<string, string>, nr: number): Meldung[] {
  const out: Meldung[] = [];
  for (const v of vorlage.variablen) {
    const wert = werte[v.schluessel] ?? "";
    const feld = vorlage.felder.find((f) => variablenInFeld(f).includes(v.schluessel));
    const feldId = feld?.id ?? null;
    if (v.pflicht && wert === "") {
      out.push(meldung("fehler", "pflicht_leer", nr, feldId, v.schluessel, `Datensatz ${nr}: „${v.bezeichnung}“ ist ein Pflichtfeld und noch leer.`));
    } else if (v.maxLaenge !== null && Array.from(wert).length > v.maxLaenge) {
      out.push(meldung("fehler", "zu_lang", nr, feldId, v.schluessel, `Datensatz ${nr}: „${v.bezeichnung}“ ist zu lang (höchstens ${v.maxLaenge} Zeichen, angegeben: ${Array.from(wert).length}).`));
    }
  }
  return out;
}

async function bereiteSeite(ctx: Kontext, felder: Feld[], werte: Record<string, string>, nr: number, meldungen: Meldung[]): Promise<string> {
  let items = "";
  for (const f of felder) {
    const name = feldName(f);
    if (f.typ === "text") {
      const { font, messer } = await holeSchrift(ctx, f.schrift, f.id);
      let zeilen = fuelleVorlage(f.vorlage, werte, f.umbruch === "mehrzeilig");
      if (f.grossschreibung === "gross") zeilen = zeilen.map((z) => z.toLocaleUpperCase("de-DE"));
      if (f.umbruch === "einzeilig") zeilen = zeilen.flatMap((z) => z.split("\n")).slice(0, 1);
      else zeilen = zeilen.flatMap((z) => z.split("\n"));
      if (zeilen.every((z) => z.trim() === "")) continue;
      const fehlend = new Set<string>();
      for (const z of zeilen) for (const ch of Array.from(z)) if (!messer.hatZeichen(ch.codePointAt(0)!)) fehlend.add(ch);
      if (fehlend.size > 0) {
        meldungen.push(meldung("fehler", "zeichen_fehlt", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: Die Schrift enthält das Zeichen ${[...fehlend].slice(0, 5).map((c) => `„${c}“`).join(", ")} nicht.`));
        zeilen = zeilen.map((z) => Array.from(z).filter((ch) => !fehlend.has(ch)).join(""));
      }
      const layout = ordneText(f, zeilen, messer);
      if (!layout.passt) {
        const grund = layout.ueberlauf === "breite" ? "ist zu breit" : "ist zu lang";
        const hinweis = f.verkleinernBis !== null ? ` (auch nicht in der kleinsten Größe von ${f.verkleinernBis} pt)` : "";
        meldungen.push(meldung("fehler", "text_passt_nicht", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: Der Text ${grund} für das Feld${hinweis}. Bitte kürzen Sie ihn.`));
      } else if (layout.verkleinert) {
        meldungen.push(meldung("warnung", "text_verkleinert", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: Der Text wird verkleinert gedruckt (${layout.groesse.toFixed(1).replace(".", ",")} statt ${f.groesse} pt).`));
      }
      items += textBody(ctx, f, layout, font, holeFarbe(ctx, f.farbe, f.id));
    } else if (f.typ === "barcode") {
      const roh = fuelleInhalt(f.inhalt, werte);
      if (roh.trim() === "") continue;
      const p = pruefeBarcodeInhalt(f.symbologie, roh);
      if (!p.ok) {
        meldungen.push(meldung("fehler", "barcode_ungueltig", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: ${p.fehler}`));
        continue;
      }
      try {
        const form = barcodeForm(f.symbologie, p.text);
        const font = f.klartext && form.art === "linear" ? (await holeSchrift(ctx, f.schrift, f.id)).font : null;
        items += codeBody(ctx, f, form, f.klartext && form.art === "linear" ? p.text : null, font, holeFarbe(ctx, f.farbe, f.id), f.hintergrund ? holeFarbe(ctx, f.hintergrund, f.id) : null);
      } catch (e) {
        meldungen.push(meldung("fehler", "barcode_ungueltig", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: ${(e as Error).message}`));
      }
    } else if (f.typ === "qr" || f.typ === "vcard") {
      let inhalt: string | null;
      if (f.typ === "qr") inhalt = fuelleInhalt(f.inhalt, werte).trim() || null;
      else {
        const teile: Record<string, string> = {};
        for (const [k, t] of Object.entries(f.zuordnung)) teile[k] = fuelleInhalt(t ?? "", werte);
        inhalt = baueVCard(teile);
      }
      if (!inhalt) continue;
      try {
        const form = qrForm(inhalt, f.fehlerkorrektur);
        items += codeBody(ctx, f, form, null, null, holeFarbe(ctx, f.farbe, f.id), f.hintergrund ? holeFarbe(ctx, f.hintergrund, f.id) : null);
      } catch (e) {
        meldungen.push(meldung("fehler", "qr_zu_gross", nr, f.id, null, `Datensatz ${nr}, Feld „${name}“: ${(e as Error).message}`));
      }
    } else if (f.typ === "bild") {
      if (!f.dateiId) continue;
      const bild = await holeBild(ctx, f.dateiId);
      if (!bild) {
        if (nr === 1) ctx.vorlagenMeldungen.push(meldung("fehler", "bild_fehlt", null, f.id, null, `Das Bild im Feld „${name}“ fehlt oder ist kein gültiges PNG/JPEG.`));
        continue;
      }
      items += bildBody(ctx, f, bild);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// Dokument

async function neuerKontext(vorlage: Vorlage, res: Ressourcen): Promise<Kontext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(vorlage.name.slice(0, 120));
  doc.setProducer("druck-s Personalisierung");
  doc.setCreator("druck-s");
  const farben = new Map<string, Farbe>();
  for (const f of [...STANDARD_FARBEN, ...res.farben]) farben.set(f.name, f);
  return { doc, vorlage, farben, fontCache: new Map(), ressourcen: res, spots: new Map(), fontNamen: new Map(), bildNamen: new Map(), bilder: new Map(), vorlagenMeldungen: [] };
}

interface DesignSeiten {
  vorne: PDFEmbeddedPage;
  hinten: PDFEmbeddedPage | null;
}

async function ladeDesign(ctx: Kontext): Promise<DesignSeiten> {
  const v = ctx.vorlage;
  if (!ctx.ressourcen.design) throw new RenderFehler("Die Vorlage hat noch kein Design-PDF.", "design_fehlt");
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(ctx.ressourcen.design, { updateMetadata: false });
  } catch {
    throw new RenderFehler("Das Design-PDF konnte nicht gelesen werden.", "design_ungueltig");
  }
  const n = src.getPageCount();
  const hole = async (nummer: number) => {
    if (nummer > n) throw new RenderFehler(`Das Design-PDF hat nur ${n} Seite(n), die Vorlage verweist auf Seite ${nummer}.`, "seite_fehlt");
    const seite = src.getPage(nummer - 1);
    const emb = await ctx.doc.embedPage(seite);
    const erwartetB = v.endformat.breite + (v.design.mitBeschnitt ? 2 * v.beschnitt : 0);
    const erwartetH = v.endformat.hoehe + (v.design.mitBeschnitt ? 2 * v.beschnitt : 0);
    if (Math.abs(emb.width / MM - erwartetB) > 1 || Math.abs(emb.height / MM - erwartetH) > 1) {
      ctx.vorlagenMeldungen.push(
        meldung("warnung", "design_groesse", null, null, null, `Design-Seite ${nummer} ist ${(emb.width / MM).toFixed(1)} × ${(emb.height / MM).toFixed(1)} mm groß, erwartet werden ${erwartetB.toFixed(1)} × ${erwartetH.toFixed(1)} mm. Das Design wird angepasst.`),
      );
    }
    return emb;
  };
  const vorne = await hole(v.design.vorne);
  const hinten = v.design.hinten ? await hole(v.design.hinten) : null;
  return { vorne, hinten };
}

function zeichneDesign(page: PDFPage, v: Vorlage, emb: PDFEmbeddedPage, zelleLinks: number, zelleUnten: number) {
  const b = v.beschnitt * MM;
  const w = (v.endformat.breite + 2 * v.beschnitt) * MM;
  const h = (v.endformat.hoehe + 2 * v.beschnitt) * MM;
  if (v.design.mitBeschnitt) page.drawPage(emb, { x: zelleLinks, y: zelleUnten, width: w, height: h });
  else page.drawPage(emb, { x: zelleLinks + b, y: zelleUnten + b, width: v.endformat.breite * MM, height: v.endformat.hoehe * MM });
}

/** Einen Datensatz vorbereiten (Items je Seite + Meldungen). */
async function bereiteDatensatz(ctx: Kontext, ds: Datensatz, nr: number) {
  const werte = werteVon(ctx.vorlage, ds);
  const meldungen = pruefeWerte(ctx.vorlage, werte, nr);
  const vorne = await bereiteSeite(ctx, ctx.vorlage.felder.filter((f) => f.seite === "vorne"), werte, nr, meldungen);
  const hinten = ctx.vorlage.design.hinten ? await bereiteSeite(ctx, ctx.vorlage.felder.filter((f) => f.seite === "hinten"), werte, nr, meldungen) : "";
  return { vorne, hinten, meldungen };
}

function normalisiere(ds: DatensatzEingabe[]): Datensatz[] {
  return ds.map((d) => ({ werte: d.werte, auflage: Math.max(1, Math.floor(d.auflage ?? 1)) }));
}

function dedupe(m: Meldung[]): Meldung[] {
  const seen = new Set<string>();
  return m.filter((x) => {
    const k = `${x.code}|${x.feld}|${x.datensatz}|${x.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function pruefeGrenzen(anzahl: number, nutzen: number, g: Grenzen) {
  if (anzahl > g.maxDatensaetze) throw new RenderFehler(`Es sind höchstens ${g.maxDatensaetze} Datensätze je Erzeugung erlaubt (angegeben: ${anzahl}).`, "zu_viele_datensaetze");
  if (nutzen > g.maxNutzen) throw new RenderFehler(`Es sind höchstens ${g.maxNutzen} Nutzen je Erzeugung erlaubt (angegeben: ${nutzen}).`, "zu_viele_nutzen");
}

/** Druck-PDF erzeugen: je nach Modus Einzelseiten oder ausgeschossene Bögen. */
export async function erzeugePdf(vorlage: Vorlage, res: Ressourcen, eingabe: DatensatzEingabe[], opt: ErzeugOptionen = {}): Promise<Ergebnis> {
  const g = { ...STANDARD_GRENZEN, ...opt.grenzen };
  const daten = normalisiere(eingabe);
  const nutzenGesamt = daten.reduce((s, d) => s + d.auflage, 0);
  const modus = opt.modus ?? vorlage.ausgabe.modus;
  pruefeGrenzen(daten.length, modus === "einzeln" ? daten.length : nutzenGesamt, g);
  const ctx = await neuerKontext(vorlage, res);
  const design = await ladeDesign(ctx);
  const hatHinten = !!design.hinten;
  const alle: Meldung[] = [];
  const b = vorlage.beschnitt;
  const zelleB = vorlage.endformat.breite + 2 * b;
  const zelleH = vorlage.endformat.hoehe + 2 * b;

  const vorbereitet: Awaited<ReturnType<typeof bereiteDatensatz>>[] = [];
  for (let i = 0; i < daten.length; i++) {
    const p = await bereiteDatensatz(ctx, daten[i], i + 1);
    alle.push(...p.meldungen);
    vorbereitet.push(p);
  }
  const meldungenGesamt = () => dedupe([...ctx.vorlagenMeldungen, ...alle]);
  if (!opt.trotzFehlern && [...ctx.vorlagenMeldungen, ...alle].some((m) => m.schwere === "fehler")) {
    return { pdf: null, meldungen: meldungenGesamt(), seiten: 0, nutzen: nutzenGesamt, boegen: null };
  }

  let boegen: number | null = null;
  if (modus === "einzeln") {
    for (let i = 0; i < vorbereitet.length; i++) {
      const seiten: [string, PDFEmbeddedPage][] = [[vorbereitet[i].vorne, design.vorne]];
      if (design.hinten) seiten.push([vorbereitet[i].hinten, design.hinten]);
      for (const [items, emb] of seiten) {
        const page = ctx.doc.addPage([zelleB * MM, zelleH * MM]);
        registriereRessourcen(page, ctx);
        zeichneDesign(page, vorlage, emb, 0, 0);
        platziere(page, ctx, items, b * MM, (zelleH - b) * MM);
        page.setBleedBox(0, 0, zelleB * MM, zelleH * MM);
        page.setTrimBox(b * MM, b * MM, vorlage.endformat.breite * MM, vorlage.endformat.hoehe * MM);
      }
    }
  } else {
    const a = vorlage.ausgabe;
    const raster = berechneNutzen({ endformat: vorlage.endformat, beschnitt: b, bogen: a.bogen, rand: a.rand, abstand: a.abstand });
    if (raster.proBogen < 1) throw new RenderFehler(`Der Nutzen (${zelleB} × ${zelleH} mm inkl. Beschnitt) passt nicht auf den Bogen (${a.bogen.breite} × ${a.bogen.hoehe} mm).`, "nutzen_passt_nicht");
    const folge: number[] = [];
    daten.forEach((d, i) => {
      for (let k = 0; k < d.auflage; k++) folge.push(i);
    });
    let overlay: PDFEmbeddedPage | null = null;
    if (a.ueberlagerung && res.ueberlagerung) {
      const o = await PDFDocument.load(res.ueberlagerung, { updateMetadata: false });
      overlay = await ctx.doc.embedPage(o.getPage(0));
    }
    const sheetW = a.bogen.breite * MM;
    const sheetH = a.bogen.hoehe * MM;
    const anzahlBoegen = Math.ceil(folge.length / raster.proBogen);
    for (let s = 0; s < anzahlBoegen; s++) {
      const slice = folge.slice(s * raster.proBogen, (s + 1) * raster.proBogen);
      const seitenArten: { emb: PDFEmbeddedPage; seite: "vorne" | "hinten" }[] = [{ emb: design.vorne, seite: "vorne" }];
      if (hatHinten && design.hinten) seitenArten.push({ emb: design.hinten, seite: "hinten" });
      for (const art of seitenArten) {
        const page = ctx.doc.addPage([sheetW, sheetH]);
        registriereRessourcen(page, ctx);
        slice.forEach((di, k) => {
          const pos = zellenPosition(raster, a.abstand, k, art.seite === "hinten");
          const links = pos.x * MM;
          const oben = sheetH - pos.y * MM;
          zeichneDesign(page, vorlage, art.emb, links, oben - zelleH * MM);
          platziere(page, ctx, vorbereitet[di][art.seite], links + b * MM, oben - b * MM);
        });
        if (overlay && !(a.ueberlagerung?.nurVorderseite && art.seite === "hinten")) {
          (page as unknown as { getContentStream(useExisting: boolean): unknown }).getContentStream(false);
          page.drawPage(overlay, { x: 0, y: 0 });
        }
      }
    }
    boegen = anzahlBoegen;
  }
  const bytes = await ctx.doc.save();
  return { pdf: bytes, meldungen: meldungenGesamt(), seiten: ctx.doc.getPageCount(), nutzen: nutzenGesamt, boegen };
}

/** Nur prüfen (kein Seitenaufbau): liefert alle Meldungen aller Datensätze. */
export async function pruefeDatensaetze(vorlage: Vorlage, res: Ressourcen, eingabe: DatensatzEingabe[], grenzen: Partial<Grenzen> = {}): Promise<Meldung[]> {
  const g = { ...STANDARD_GRENZEN, ...grenzen };
  const daten = normalisiere(eingabe);
  pruefeGrenzen(daten.length, daten.reduce((s, d) => s + d.auflage, 0), g);
  const ctx = await neuerKontext(vorlage, res);
  const alle: Meldung[] = [];
  for (let i = 0; i < daten.length; i++) alle.push(...(await bereiteDatensatz(ctx, daten[i], i + 1)).meldungen);
  return dedupe([...ctx.vorlagenMeldungen, ...alle]);
}

/** Beispiel-Datensatz aus den Beispielwerten der Variablen. */
export function beispielDatensatz(vorlage: Vorlage): Datensatz {
  const werte: Record<string, string> = {};
  for (const v of vorlage.variablen) werte[v.schluessel] = v.beispiel;
  return { werte, auflage: 1 };
}

/** Vorschau: ein Datensatz als kleines PDF (Vorder- und ggf. Rückseite), auch bei Fehlern. */
export async function erzeugeVorschau(vorlage: Vorlage, res: Ressourcen, datensatz?: DatensatzEingabe | null): Promise<Ergebnis> {
  const ds = datensatz ?? beispielDatensatz(vorlage);
  return erzeugePdf(vorlage, res, [ds], { modus: "einzeln", trotzFehlern: true });
}
