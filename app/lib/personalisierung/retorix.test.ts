import { describe, expect, it } from "vitest";
import * as mapping from "../../scripts/retorix-mapping.mjs";
import { parseVorlage } from "./schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Reines JS-Modul: Typen absichtlich locker.
const { barcodeFarbe, bilde, ersetzeDateiRefs, htmlZuText, parseCmyk, schluesselAus } = mapping as unknown as Record<string, (...a: any[]) => any>;

const UUID = "11111111-1111-4111-8111-111111111111";

/** Nachgebaute Zeilen der Django-Tabellen. Design 85 × 55 mm (Visitenkarte), zwei Seiten. */
const snapshot = {
  products: [
    { id: 1, code: "000000000001", name: "Visitenkarte", type: "personalised_print", short_description: "Karte" },
    { id: 2, name: "Karte Lager", type: "storage" },
    { id: 3, name: "Ohne Design", type: "personalised_print" },
  ],
  features: [{ id: 10, product_id: 1, design_file: "products/1/design.pdf", template_file: "products/1/stanz.pdf", distance_columns: 2, distance_rows: 3, paper_format_id: 5 }, { id: 11, product_id: 3, design_file: null }],
  paper_formats: [{ id: 5, name: "SRA3", width: 320, height: 450, distance_top: 5, distance_bottom: 5, distance_left: 6, distance_right: 6 }],
  pages: [
    { id: 100, personalised_print_feature_id: 10, pdf_page: "p1.pdf", page_number: 1 },
    { id: 101, personalised_print_feature_id: 10, pdf_page: "p2.pdf", page_number: 2 },
    { id: 102, personalised_print_feature_id: 10, pdf_page: "p3.pdf", page_number: 3 },
  ],
  fields: [
    { id: 1, name: "Namensblock", coordinate_x: 8, coordinate_y: 30, is_required: true, width: 50 },
    { id: 2, name: "Adresse", coordinate_x: 8, coordinate_y: 20, is_required: false, width: 50 },
    { id: 3, name: "Artikelnummer", coordinate_x: 10, coordinate_y: 10, is_required: true, width: 40 },
    { id: 4, name: "Kontakt-QR", coordinate_x: 60, coordinate_y: 5, is_required: false, width: 20 },
    { id: 5, name: "Web-QR", coordinate_x: 60, coordinate_y: 30, is_required: false, width: 15 },
    { id: 6, name: "Logo", coordinate_x: 5, coordinate_y: 40, is_required: false, width: 20 },
    { id: 7, name: "Seite3", coordinate_x: 1, coordinate_y: 1, is_required: false, width: 10 },
    { id: 8, name: "Exot", coordinate_x: 1, coordinate_y: 1, is_required: false, width: 10 },
  ],
  text_fields: [
    { field_ptr_id: 1, page_id: 100, content: '<p style="text-align:center"><span style="font-family:Open Sans;font-size:12px;color:#ff0000">{{Vorname}} {{Nachname}}</span></p><p>Tel. {{Telefon Büro}}</p>', line_spacing: 14, remove_blank_lines: true, fill_bottom_up: false },
    { field_ptr_id: 2, page_id: 100, content: "<p>{{Straße}}</p><p>{{PLZ}} {{Ort}}</p>&lt;TAB&gt;x&amp;y", line_spacing: 12, remove_blank_lines: true, fill_bottom_up: true },
    { field_ptr_id: 7, page_id: 102, content: "<p>weg</p>", line_spacing: 12 },
  ],
  barcode_fields: [
    { field_ptr_id: 3, page_id: 101, barcode_type: "ean13", barcode_quality: "L", is_include_text: true, is_show_border: false, bar_color: "000000", background_color: "ffffff" },
    { field_ptr_id: 8, page_id: 101, barcode_type: "maxicode", bar_color: "000000" },
  ],
  vcard_fields: [{ field_ptr_id: 4, page_id: 100, barcode_quality: "M", firstname: "Vorname", lastname: "Nachname", company: "Firma", role: "Funktion", title: "Titel", phone: "Telefon Büro", mobile: "", email: "E-Mail", url: "Web", linkedin: "LinkedIn", bar_color: "00000000" }],
  free_text_qr_fields: [{ field_ptr_id: 5, page_id: 100, content: "https://example.com/p/{{Artikelnummer}}", barcode_quality: "H", bar_color: "ff0000" }],
  image_fields: [{ field_ptr_id: 6, page_id: 100, image: "products/1/logo.png" }],
  fonts: [{ id: 1, name: "Open Sans", font_file: "fonts/OpenSans.ttf" }],
  colors: [{ id: 1, name: "Hausrot", code_rgb: "ff0000", code_cmyk: "0.100.100.0" }, { id: 2, name: "Kaputt", code_rgb: "00ff00", code_cmyk: "x" }],
};
const masse = { 10: [{ breiteMm: 85, hoeheMm: 55 }, { breiteMm: 85, hoeheMm: 55 }] };

describe("retorix-Hilfsfunktionen", () => {
  it("bildet Schlüssel, CMYK und HTML ab", () => {
    expect(schluesselAus("Telefon Büro")).toBe("telefon_buero");
    expect(schluesselAus("1. Zeile (optional)")).toBe("v_1_zeile");
    expect(parseCmyk("0.100.100.0")).toEqual([0, 100, 100, 0]);
    expect(parseCmyk("kaputt")).toBeNull();
    expect(barcodeFarbe("ff00ff00")).toEqual([100, 0, 100, 0]);
    expect(barcodeFarbe("000000")).toEqual([0, 0, 0, 100]);
    const t = htmlZuText('<p style="text-align:right"><span style="font-size:9px">A &amp; B</span></p><p>&nbsp;</p><p>Zeile 2</p>');
    expect(t).toMatchObject({ zeilen: ["A & B", "", "Zeile 2"], groesse: 9, ausrichtung: "rechts" });
  });
});

describe("retorix-Abbildung", () => {
  const r = bilde(snapshot, masse);
  const v = r.vorlagen[0];

  it("übernimmt nur personalisierte Produkte mit Design und berichtet den Rest", () => {
    expect(r.vorlagen).toHaveLength(1);
    expect(r.bericht.some((b: { text: string }) => b.text.includes("Typ storage"))).toBe(true);
    expect(r.bericht.some((b: { text: string }) => b.text.includes("kein Design-PDF"))).toBe(true);
    expect(r.bericht.some((b: { text: string }) => b.text.includes("maxicode"))).toBe(true);
    expect(r.bericht.some((b: { text: string }) => b.text.includes("Design-Seite 3"))).toBe(true);
  });

  it("rechnet Koordinaten von unten-links nach oben-links um", () => {
    const text = v.vorlage.felder.find((f: { id: string }) => f.id === "text_1");
    // fill_bottom_up=false: (x,y) = linke OBERE Ecke, y_neu = 55 - 30 = 25; Höhe aus 3 Zeilen × 14 pt
    expect(text.x).toBe(8);
    expect(text.y).toBe(25);
    expect(text.vertikal).toBe("oben");
    expect(text.hoehe).toBeCloseTo((3 * 14) / (72 / 25.4), 1);
    const adr = v.vorlage.felder.find((f: { id: string }) => f.id === "text_2");
    // fill_bottom_up=true: Box-UNTERkante bei y=20 -> y_neu = 55 - 20 - hoehe
    expect(adr.vertikal).toBe("unten");
    expect(adr.y + adr.hoehe).toBeCloseTo(35, 1);
    const qr = v.vorlage.felder.find((f: { id: string }) => f.id === "qr_5");
    expect(qr.y).toBe(55 - 30 - 15);
  });

  it("macht aus CKEditor-Text ein Vorlagen-Template mit expliziten Variablen", () => {
    const text = v.vorlage.felder.find((f: { id: string }) => f.id === "text_1");
    expect(text.vorlage).toBe("{{vorname}} {{nachname}}\nTel. {{telefon_buero}}");
    expect(text).toMatchObject({ ausrichtung: "zentriert", groesse: 12, farbe: "Hausrot", schrift: { familie: "Open Sans" } });
    const keys = v.vorlage.variablen.map((x: { schluessel: string }) => x.schluessel);
    expect(keys).toEqual(expect.arrayContaining(["vorname", "nachname", "telefon_buero", "strasse", "plz", "ort", "artikelnummer", "e_mail", "web"]));
    expect(v.vorlage.variablen.find((x: { schluessel: string }) => x.schluessel === "telefon_buero")).toMatchObject({ bezeichnung: "Telefon Büro" });
    expect(v.vorlage.variablen.find((x: { schluessel: string }) => x.schluessel === "artikelnummer").pflicht).toBe(true);
  });

  it("bildet Barcode, vCard, Freitext-QR und Bild ab", () => {
    const f = (id: string) => v.vorlage.felder.find((x: { id: string }) => x.id === id);
    expect(f("barcode_3")).toMatchObject({ typ: "barcode", symbologie: "ean13", inhalt: "{{artikelnummer}}", seite: "hinten", klartext: true, farbe: "Schwarz" });
    expect(f("vcard_4").zuordnung).toMatchObject({ vorname: "{{vorname}}", nachname: "{{nachname}}", firma: "{{firma}}", funktion: "{{funktion}}", telefon: "{{telefon_buero}}", email: "{{e_mail}}", web: "{{web}}" });
    expect(r.bericht.some((b: { text: string }) => b.text.includes("linkedin"))).toBe(true);
    expect(f("qr_5")).toMatchObject({ inhalt: "https://example.com/p/{{artikelnummer}}", fehlerkorrektur: "H" });
    expect(f("bild_6")).toMatchObject({ typ: "bild", dateiId: "@datei:products/1/logo.png" });
  });

  it("übernimmt Papierformat, Abstände, Überlagerung, Farben und Schriften", () => {
    expect(v.vorlage.ausgabe).toMatchObject({ modus: "ausgeschossen", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, links: 6 }, abstand: { spalten: 2, zeilen: 3 } });
    expect(v.vorlage.ausgabe.ueberlagerung.dateiId).toBe("@datei:products/1/stanz.pdf");
    expect(v.vorlage.design).toMatchObject({ vorne: 1, hinten: 2 });
    expect(r.farben.find((c: { name: string }) => c.name === "Hausrot")).toMatchObject({ cmyk: [0, 100, 100, 0], sonderfarbe: "Hausrot" });
    expect(r.farben.find((c: { name: string }) => c.name === "Kaputt")).toMatchObject({ sonderfarbe: null });
    expect(r.schriften[0]).toMatchObject({ familie: "Open Sans", schnitt: "regular" });
  });

  it("liefert ein gültiges Schema und ist deterministisch (idempotente Quellen)", () => {
    const ids = Object.fromEntries(v.dateien.map((d: string) => [d, UUID]));
    const p = parseVorlage(ersetzeDateiRefs(v.vorlage, ids));
    expect(p.ok, p.ok ? "" : JSON.stringify((p as { fehler: unknown }).fehler)).toBe(true);
    expect(v.quelle).toBe("retorix:product:1");
    expect(JSON.stringify(bilde(snapshot, masse).vorlagen)).toBe(JSON.stringify(r.vorlagen));
  });
});
