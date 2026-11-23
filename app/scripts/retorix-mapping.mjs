// Abbildung der retorix-Tabellen (Django, Postgres) auf das Vorlagen-Schema der Personalisierung.
// Reine Funktionen ohne Datenbank/Netz, damit sie mit JSON-Fixtures testbar sind
// (lib/personalisierung/retorix.test.ts). Eingabe: "Schnappschuss" = Zeilen der shop_*-Tabellen.
//
// retorix: mm, Ursprung UNTEN links des Nutzens; (x, y) einer Box ist deren linke UNTERE Ecke
// (fill_bottom_up = true) bzw. linke OBERE Ecke (false). Neu: Ursprung OBEN links, Box = (x, y, breite, hoehe).

const MM = 72 / 25.4;
const r2 = (n) => Math.round(n * 100) / 100;

/** Schlüssel aus einem Spaltennamen: klein, Umlaute aufgelöst, nur a-z0-9_. */
export function schluesselAus(name) {
  let s = String(name ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\(optional\)/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(s)) s = `v_${s}`;
  return s.slice(0, 40).replace(/_+$/, "") || "variable";
}

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&auml;": "ä", "&ouml;": "ö", "&uuml;": "ü", "&Auml;": "Ä", "&Ouml;": "Ö", "&Uuml;": "Ü", "&szlig;": "ß" };
function dekodiere(s) {
  return s.replace(/&(nbsp|amp|lt|gt|quot|#39|auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
}

/** CKEditor-HTML -> { zeilen[], groesse, farbeRgb, schrift, ausrichtung, fett, mehrere } */
export function htmlZuText(html) {
  const roh = String(html ?? "");
  const groessen = [...roh.matchAll(/font-size:\s*([\d.]+)\s*(?:px|pt)?/gi)].map((m) => Number(m[1]));
  const farben = [...roh.matchAll(/color:\s*#([0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  const schriften = [...roh.matchAll(/font-family:\s*['"]?([^;'"]+)['"]?/gi)].map((m) => m[1].trim());
  const faces = [...roh.matchAll(/face="([^"]+)"/gi)].map((m) => m[1].trim());
  const ausr = /text-align:\s*(left|center|right|justify)/i.exec(roh)?.[1]?.toLowerCase();
  const mitZeilen = roh
    .replace(/&lt;TAB&gt;/gi, "    ")
    .replace(/<\s*\/p\s*>/gi, "\n").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\s*\/div\s*>/gi, "\n").replace(/\r\n?/g, "\n");
  const zeilen = dekodiere(mitZeilen.replace(/<[^>]+>/g, "")).split("\n").map((z) => z.replace(/ /g, " ").replace(/\s+$/, "")).map((z) => z.replace(/^\s+/, (w) => (w.length > 0 ? "" : w)));
  while (zeilen.length && zeilen[zeilen.length - 1].trim() === "") zeilen.pop();
  while (zeilen.length && zeilen[0].trim() === "") zeilen.shift();
  const einzigartig = (a) => new Set(a).size;
  return {
    zeilen,
    groesse: groessen[0] ?? null,
    farbeRgb: farben[0] ?? null,
    schrift: schriften[0] ?? faces[0] ?? null,
    ausrichtung: { left: "links", center: "zentriert", right: "rechts", justify: "block" }[ausr] ?? "links",
    fett: /<(strong|b)[\s>]/i.test(roh),
    mehrere: einzigartig(groessen) > 1 || einzigartig(farben) > 1 || einzigartig([...schriften, ...faces]) > 1,
  };
}

/** retorix code_cmyk ("c.m.y.k", ganze Zahlen 0-100) -> [c,m,y,k] oder null. */
export function parseCmyk(code) {
  const teile = String(code ?? "").trim().split(/[.,;\s]+/).filter((t) => t !== "");
  if (teile.length !== 4) return null;
  const z = teile.map(Number);
  return z.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) ? z : null;
}

/** RGB-Hex (6) -> naive CMYK in Prozent (ohne Farbprofil). */
export function rgbZuCmyk(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
}

/** Barcode-Farbe (RRGGBB oder CCMMYYKK) -> [c,m,y,k] oder null. */
export function barcodeFarbe(hex) {
  const h = String(hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{8}$/i.test(h)) return [0, 2, 4, 6].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 100));
  if (/^[0-9a-f]{6}$/i.test(h)) return rgbZuCmyk(h);
  return null;
}

const SYMBOLOGIEN = { code128: "code128", ean13: "ean13", ean8: "ean8", upca: "upca", code39: "code39", code93: "code93", interleaved2of5: "interleaved2of5", itf14: "itf14", "gs1-128": "gs1-128", datamatrix: "datamatrix", gs1datamatrix: "gs1datamatrix", pdf417: "pdf417", azteccode: "azteccode" };
const EC = { L: "L", M: "M", Q: "Q", H: "H" };
const VCARD = { firstname: "vorname", lastname: "nachname", company: "firma", role: "funktion", phone: "telefon", mobile: "mobil", fax: "fax", email: "email", url: "web", street: "strasse", postalcode: "plz", city: "ort", country: "land" };
const VCARD_NICHT = ["title", "private_phone", "linkedin", "xing", "facebook"];

/**
 * Hauptfunktion. snapshot = { products, features, paper_formats, pages, fields, text_fields, barcode_fields,
 * vcard_fields, free_text_qr_fields, image_fields, fonts, colors }, je ein Array von Zeilen (Spalten wie in Django).
 * designMasse: { [feature_id]: [{ breiteMm, hoeheMm }, …] } Seitengrößen des Design-PDFs.
 */
export function bilde(snapshot, designMasse = {}) {
  const bericht = [];
  const hinweis = (quelle, text, art = "hinweis") => bericht.push({ art, quelle, text });
  const farben = [];
  const farbIndex = new Map(); // Name -> Eintrag
  const farbe = (name, cmyk, sonderfarbe, quelle) => {
    if (!farbIndex.has(name)) {
      const e = { quelle, name, cmyk, sonderfarbe: sonderfarbe ?? null };
      farbIndex.set(name, e);
      farben.push(e);
    }
    return name;
  };
  const rgbZuName = new Map();
  for (const c of snapshot.colors ?? []) {
    const cmyk = parseCmyk(c.code_cmyk);
    const rgb = String(c.code_rgb ?? "").replace(/^#/, "").toLowerCase();
    if (!cmyk) {
      hinweis(`retorix:color:${c.id}`, `Farbe „${c.name}“: CMYK-Wert „${c.code_cmyk}“ nicht lesbar${/^[0-9a-f]{6}$/.test(rgb) ? "; aus RGB umgerechnet (ohne Farbprofil)" : "; übersprungen"}.`, "warnung");
      if (/^[0-9a-f]{6}$/.test(rgb)) rgbZuName.set(rgb, farbe(c.name, rgbZuCmyk(rgb), null, `retorix:color:${c.id}`));
      continue;
    }
    // retorix schrieb jede Farbe mit CMYK als Sonderfarbe (Separation) mit dem Farbnamen.
    farbe(c.name, cmyk, c.name, `retorix:color:${c.id}`);
    if (rgb) rgbZuName.set(rgb, c.name);
  }
  const farbeFuerRgb = (hex, quelle) => {
    const h = hex.toLowerCase();
    if (h === "000000") return "Schwarz";
    if (rgbZuName.has(h)) return rgbZuName.get(h);
    hinweis(quelle, `Farbe #${h} steht nicht in der retorix-Farbtabelle; als Prozessfarbe „Import #${h}“ umgerechnet (ohne Farbprofil).`);
    return farbe(`Import #${h}`, rgbZuCmyk(h), null, `retorix:rgb:${h}`);
  };
  const farbeFuerCode = (hex, quelle) => {
    const c = barcodeFarbe(hex);
    if (!c) return "Schwarz";
    if (c[3] === 100 && c[0] + c[1] + c[2] === 0) return "Schwarz";
    const name = `Import ${String(hex).toUpperCase()}`;
    return farbe(name, c, null, `retorix:code:${String(hex).toUpperCase()}`);
  };

  const schriften = (snapshot.fonts ?? []).map((f) => ({ quelle: `retorix:font:${f.id}`, familie: f.name, schnitt: "regular", datei: f.font_file }));
  for (const f of schriften) hinweis(f.quelle, `Schrift „${f.familie}“ als eigene Familie (Schnitt regular) übernommen; Fett/Kursiv-Varianten waren in retorix eigene Schriften.`);
  const schriftNamen = new Set(schriften.map((s) => s.familie));

  const vorlagen = [];
  const featuresByProduct = new Map((snapshot.features ?? []).map((f) => [f.product_id, f]));
  const papier = new Map((snapshot.paper_formats ?? []).map((p) => [p.id, p]));
  for (const p of snapshot.products ?? []) {
    const quelle = `retorix:product:${p.id}`;
    if (p.type !== "personalised_print") {
      hinweis(quelle, `Produkt „${p.name}“ (Typ ${p.type}) ist kein personalisiertes Druckprodukt und wird nicht übernommen.`);
      continue;
    }
    const feature = featuresByProduct.get(p.id);
    if (!feature || !feature.design_file) {
      hinweis(quelle, `Produkt „${p.name}“ hat kein Design-PDF und wird nicht übernommen.`, "warnung");
      continue;
    }
    vorlagen.push(bildeProdukt(p, feature, papier.get(feature.paper_format_id), snapshot, designMasse[feature.id] ?? [], { hinweis, farbeFuerRgb, farbeFuerCode, schriftNamen }));
  }
  return { vorlagen, schriften, farben, bericht: [...bericht, ...vorlagen.flatMap((v) => v.bericht)] };
}

function bildeProdukt(p, feature, papierFormat, snap, masse, h) {
  const quelle = `retorix:product:${p.id}`;
  const bericht = [];
  const melde = (text, art = "hinweis") => bericht.push({ art, quelle, text });
  const seiten = (snap.pages ?? []).filter((s) => s.personalised_print_feature_id === feature.id).sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0) || a.id - b.id);
  const seitenIndex = new Map(seiten.map((s, i) => [s.id, i + 1]));
  const dim = masse[0];
  if (!dim) melde("Die Größe des Design-PDFs ist unbekannt; Endformat 85 × 55 mm angenommen. Bitte prüfen.", "warnung");
  const breite = r2(dim?.breiteMm ?? 85);
  const hoehe = r2(dim?.hoeheMm ?? 55);
  if (seiten.length > 2) melde(`Das Design hat ${seiten.length} Seiten; nur die ersten zwei (Vorder-/Rückseite) werden abgebildet.`, "warnung");
  const hatHinten = seiten.length >= 2;

  const variablen = new Map(); // schluessel -> {schluessel, bezeichnung, pflicht,…}
  const variable = (name, pflicht) => {
    const k = schluesselAus(name);
    const v = variablen.get(k);
    if (v) v.pflicht = v.pflicht || !!pflicht;
    else variablen.set(k, { schluessel: k, bezeichnung: String(name).replace(/\s*\(optional\)\s*$/i, "").trim().slice(0, 80) || k, pflicht: !!pflicht, beispiel: String(name).replace(/\s*\(optional\)\s*$/i, "").trim().slice(0, 300), maxLaenge: null, hilfe: "" });
    return k;
  };
  const vorlageTemplate = (txt, pflicht) => txt.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, n) => `{{${variable(n, pflicht)}}}`);

  const felder = [];
  const ids = new Set();
  const neueId = (art, fid) => {
    let id = `${art}_${fid}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    return id;
  };
  const basis = new Map((snap.fields ?? []).map((f) => [f.id, f]));
  const seiteVon = (row) => {
    const n = seitenIndex.get(row.page_id);
    if (!n) return null;
    if (n > 2) return null;
    return n === 1 ? "vorne" : "hinten";
  };
  const alle = (arr, art) => (arr ?? []).filter((r) => seitenIndex.has(r.page_id)).map((r) => ({ art, r, f: basis.get(r.field_ptr_id) ?? {} }));

  for (const { art, r, f } of [...alle(snap.text_fields, "text"), ...alle(snap.barcode_fields, "barcode"), ...alle(snap.vcard_fields, "vcard"), ...alle(snap.free_text_qr_fields, "qr"), ...alle(snap.image_fields, "bild")]) {
    const seite = seiteVon(r);
    const name = f.name ?? `${art} ${r.field_ptr_id}`;
    if (!seite) {
      melde(`Feld „${name}“ liegt auf Design-Seite ${seitenIndex.get(r.page_id)} und wird nicht abgebildet.`, "warnung");
      continue;
    }
    const x = r2(f.coordinate_x ?? 0);
    const yRet = f.coordinate_y ?? 0;
    const breiteF = r2(f.width ?? 50);
    const pflicht = !!f.is_required;
    const id = neueId(art, r.field_ptr_id);
    if (art === "text") {
      const t = htmlZuText(r.content);
      if (t.zeilen.length === 0) {
        melde(`Textfeld „${name}“ ist leer und wird nicht übernommen.`);
        continue;
      }
      if (t.mehrere) melde(`Textfeld „${name}“ mischt mehrere Schriftgrößen/-farben/-schriften; es wird die erste verwendet.`, "warnung");
      if (t.fett) melde(`Textfeld „${name}“ enthält Fettdruck; bitte im Editor die Schrift/den Schnitt prüfen.`);
      if (r.remove_blank_lines === false) melde(`Textfeld „${name}“: „Leerzeilen nicht löschen“ gibt es nicht mehr; Zeilen mit nur leeren Variablen entfallen immer.`);
      const groesse = t.groesse ?? 10;
      const leading = r.line_spacing ?? 12;
      const hoeheF = r2(((t.zeilen.length + 1) * leading) / MM);
      const untenBuendig = r.fill_bottom_up !== false;
      const yNeu = untenBuendig ? hoehe - yRet - hoeheF : hoehe - yRet;
      if (t.schrift && !h.schriftNamen.has(t.schrift)) melde(`Textfeld „${name}“: Schrift „${t.schrift}“ ist nicht in der Schriftbibliothek; Helvetica wird verwendet.`, "warnung");
      felder.push({
        typ: "text", id, seite, name: name.slice(0, 80), x, y: r2(yNeu), breite: breiteF, hoehe: hoeheF,
        vorlage: t.zeilen.map((z) => vorlageTemplate(z, pflicht)).join("\n"),
        umbruch: "mehrzeilig", ausrichtung: t.ausrichtung, vertikal: untenBuendig ? "unten" : "oben",
        schrift: { familie: t.schrift && h.schriftNamen.has(t.schrift) ? t.schrift : "Helvetica", fett: false, kursiv: false },
        groesse, zeilenabstand: Math.min(3, Math.max(0.7, r2(leading / groesse))),
        farbe: t.farbeRgb ? h.farbeFuerRgb(t.farbeRgb, quelle) : "Schwarz", grossschreibung: "keine", verkleinernBis: null,
      });
      melde(`Textfeld „${name}“: Höhe geschätzt (${t.zeilen.length + 1} Zeilen), bitte im Editor prüfen.`);
    } else if (art === "barcode") {
      const sym = SYMBOLOGIEN[r.barcode_type ?? "gs1datamatrix"];
      const key = variable(name, pflicht);
      const matrix = ["datamatrix", "gs1datamatrix", "azteccode"].includes(sym);
      if (r.barcode_type === "qrcode" || r.barcode_type === "gs1qrcode") {
        const hQr = breiteF;
        felder.push({ typ: "qr", id, seite, name: name.slice(0, 80), x, y: r2(hoehe - yRet - hQr), breite: breiteF, hoehe: hQr, inhalt: `{{${key}}}`, fehlerkorrektur: EC[r.barcode_quality] ?? "M", farbe: h.farbeFuerCode(r.bar_color, quelle), hintergrund: null, ruhezone: 0 });
      } else if (!sym) {
        melde(`Barcode „${name}“: Typ „${r.barcode_type}“ wird nicht unterstützt und nicht übernommen.`, "warnung");
        variablen.delete(key);
        continue;
      } else {
        const hF = matrix || sym === "pdf417" ? breiteF : r2(Math.min(20, breiteF * 0.35));
        felder.push({ typ: "barcode", id, seite, name: name.slice(0, 80), x, y: r2(hoehe - yRet - hF), breite: breiteF, hoehe: hF, symbologie: sym, inhalt: `{{${key}}}`, klartext: !!r.is_include_text, schrift: { familie: "Helvetica", fett: false, kursiv: false }, farbe: h.farbeFuerCode(r.bar_color, quelle), hintergrund: null, ruhezone: 0, ausrichtung: "zentriert" });
      }
      if (r.is_show_border) melde(`Code „${name}“: der Rahmen (is_show_border) wird nicht abgebildet.`);
      if (r.background_color && !/^(ffffff|ffffffff|00000000)$/i.test(r.background_color)) melde(`Code „${name}“: Hintergrundfarbe „${r.background_color}“ wird nicht abgebildet.`);
    } else if (art === "vcard") {
      const zuordnung = {};
      for (const [alt, neu] of Object.entries(VCARD)) {
        const spalte = (r[alt] ?? "").trim();
        if (spalte) zuordnung[neu] = `{{${variable(spalte, pflicht && (neu === "nachname" || neu === "vorname"))}}}`;
      }
      if (!zuordnung.funktion && (r.title ?? "").trim()) zuordnung.funktion = `{{${variable(r.title.trim(), false)}}}`;
      for (const alt of VCARD_NICHT) if ((r[alt] ?? "").trim() && !(alt === "title" && zuordnung.funktion)) melde(`vCard „${name}“: Eigenschaft „${alt}“ gibt es in vCard 3.0 nicht und wird nicht übernommen.`);
      felder.push({ typ: "vcard", id, seite, name: name.slice(0, 80), x, y: r2(hoehe - yRet - breiteF), breite: breiteF, hoehe: breiteF, zuordnung, fehlerkorrektur: EC[r.barcode_quality] ?? "M", farbe: h.farbeFuerCode(r.bar_color, quelle), hintergrund: null, ruhezone: 0 });
      melde(`vCard „${name}“: war vCard 4.0, jetzt vCard 3.0 (breitere Kompatibilität).`);
    } else if (art === "qr") {
      felder.push({ typ: "qr", id, seite, name: name.slice(0, 80), x, y: r2(hoehe - yRet - breiteF), breite: breiteF, hoehe: breiteF, inhalt: vorlageTemplate(String(r.content ?? ""), pflicht) || "-", fehlerkorrektur: EC[r.barcode_quality] ?? "M", farbe: h.farbeFuerCode(r.bar_color, quelle), hintergrund: null, ruhezone: 0 });
    } else if (art === "bild") {
      if (!r.image) continue;
      felder.push({ typ: "bild", id, seite, name: name.slice(0, 80), x, y: r2(hoehe - yRet - breiteF), breite: breiteF, hoehe: breiteF, dateiId: `@datei:${r.image}`, anpassung: "einpassen" });
      melde(`Bildfeld „${name}“: Höhe entspricht der Breite angenommen, bitte prüfen.`);
    }
  }

  // Felder, die über das Endformat hinausragen (geschätzte Höhen!), in das Format zurückschieben.
  for (const f of felder) {
    const x0 = f.x, y0 = f.y;
    f.breite = Math.min(f.breite, breite);
    f.hoehe = Math.min(f.hoehe, hoehe);
    f.x = r2(Math.max(0, Math.min(f.x, breite - f.breite)));
    f.y = r2(Math.max(0, Math.min(f.y, hoehe - f.hoehe)));
    if (f.x !== x0 || f.y !== y0) melde(`Feld „${f.name || f.id}“ ragte über das Endformat hinaus und wurde verschoben; bitte im Editor prüfen.`, "warnung");
  }
  const ausgabe = papierFormat
    ? {
        modus: "ausgeschossen",
        bogen: { breite: r2(papierFormat.width || 320), hoehe: r2(papierFormat.height || 450) },
        rand: { oben: r2(papierFormat.distance_top ?? 0), unten: r2(papierFormat.distance_bottom ?? 0), links: r2(papierFormat.distance_left ?? 0), rechts: r2(papierFormat.distance_right ?? 0) },
        abstand: { spalten: r2(feature.distance_columns ?? 0), zeilen: r2(feature.distance_rows ?? 0) },
        ueberlagerung: feature.template_file ? { dateiId: `@datei:${feature.template_file}`, nurVorderseite: false } : null,
      }
    : { modus: "einzeln", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 }, ueberlagerung: feature.template_file ? { dateiId: `@datei:${feature.template_file}`, nurVorderseite: false } : null };
  if (!papierFormat) melde("Kein Papierformat zugeordnet; Ausgabe „einzeln“ eingestellt.");
  melde("Retorix kannte keinen Beschnitt; Beschnitt = 0 mm. Die Nutzen lagen ohne Rückseitenspiegelung im Raster (jetzt: Rückseiten gespiegelt auf eigenem Bogen).");

  return {
    quelle,
    vorlage: {
      name: String(p.name ?? `Produkt ${p.id}`).slice(0, 120),
      beschreibung: String(p.short_description ?? "").slice(0, 1000),
      endformat: { breite, hoehe },
      beschnitt: 0,
      design: { dateiId: `@datei:${feature.design_file}`, vorne: 1, hinten: hatHinten ? 2 : null, mitBeschnitt: false },
      variablen: [...variablen.values()],
      felder,
      ausgabe,
    },
    dateien: [feature.design_file, feature.template_file, ...felder.filter((f) => f.typ === "bild").map((f) => f.dateiId.slice(7))].filter(Boolean),
    bericht,
  };
}

/** Ersetzt "@datei:<key>" durch echte Datei-IDs (Abbildung key -> uuid). */
export function ersetzeDateiRefs(vorlage, ids) {
  const ers = (v) => (typeof v === "string" && v.startsWith("@datei:") ? ids[v.slice(7)] ?? null : v);
  return {
    ...vorlage,
    design: { ...vorlage.design, dateiId: ers(vorlage.design.dateiId) },
    felder: vorlage.felder.map((f) => (f.typ === "bild" ? { ...f, dateiId: ers(f.dateiId) } : f)),
    ausgabe: { ...vorlage.ausgabe, ueberlagerung: vorlage.ausgabe.ueberlagerung ? { ...vorlage.ausgabe.ueberlagerung, dateiId: ers(vorlage.ausgabe.ueberlagerung.dateiId) } : null },
  };
}
