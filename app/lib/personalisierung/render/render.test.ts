import { PDFDocument, PDFName, PDFDict, PDFArray } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseVorlage } from "../schema";
import { testRessourcen, testVorlage, testDesign } from "../test-support";
import { berechneNutzen, zellenPosition } from "./geometrie";
import { baueVCard, pruefeBarcodeInhalt, qrForm, barcodeForm } from "./codes";
import { beispielDatensatz, erzeugePdf, erzeugeVorschau, pruefeDatensaetze, RenderFehler } from "./pdf";
import { fuelleVorlage, ordneText, umbrich } from "./text";
import type { Messer } from "./typen";

/** Jedes Zeichen 5 pt breit bei Größe 10 (also 0,5 × Größe). */
const messer: Messer = {
  breite: (t, g) => Array.from(t).length * g * 0.5,
  ascent: (g) => g * 0.8,
  descent: (g) => g * 0.2,
  hatZeichen: () => true,
};

describe("Schema", () => {
  it("füllt Defaults und prüft Variablenbezüge", () => {
    const r = parseVorlage({ name: "x", endformat: { breite: 50, hoehe: 50 }, felder: [{ typ: "text", id: "a", x: 0, y: 0, breite: 10, hoehe: 5, vorlage: "{{fehlt}}" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler[0].text).toContain("unbekannte Variable");
  });
  it("lehnt Rückseitenfelder ohne Rückseite und doppelte Schlüssel ab", () => {
    const r = parseVorlage({
      name: "x",
      endformat: { breite: 50, hoehe: 50 },
      variablen: [{ schluessel: "a", bezeichnung: "A" }, { schluessel: "a", bezeichnung: "B" }, { schluessel: "auflage", bezeichnung: "C" }],
      felder: [{ typ: "text", id: "t", seite: "hinten", x: 0, y: 0, breite: 10, hoehe: 5, vorlage: "x" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.map((f) => f.text).join("|")).toMatch(/doppelt.*reserviert|reserviert.*doppelt|keine Rückseite/);
  });
  it("akzeptiert die Beispielvorlage", () => {
    expect(testVorlage().felder).toHaveLength(5);
  });
});

describe("Text", () => {
  it("lässt Zeilen mit nur leeren Variablen entfallen", () => {
    const z = fuelleVorlage("{{a}}\nTel. {{b}}\nMobil {{c}}\nFest", { a: "Max", b: "", c: "  " });
    expect(z).toEqual(["Max", "Fest"]);
  });
  it("umbricht an der Breite und trennt überlange Wörter", () => {
    expect(umbrich("aaa bbb ccc", 35, messer, 10)).toEqual(["aaa bbb", "ccc"]);
    expect(umbrich("abcdefghij", 20, messer, 10)).toEqual(["abcd", "efgh", "ij"]);
  });
  const feld = (extra = {}) => {
    const v = parseVorlage({ name: "x", endformat: { breite: 50, hoehe: 50 }, variablen: [], felder: [{ typ: "text", id: "t", x: 0, y: 0, breite: 10, hoehe: 4, vorlage: "x", groesse: 10, ...extra }] });
    if (!v.ok) throw new Error(JSON.stringify(v.fehler));
    return v.vorlage.felder[0] as Extract<(typeof v.vorlage.felder)[number], { typ: "text" }>;
  };
  it("verkleinert automatisch bis es passt, aber nicht unter das Minimum", () => {
    // Feld 10 mm = 28,35 pt breit; 10 Zeichen bei 10 pt = 50 pt
    const f = feld({ umbruch: "einzeilig", verkleinernBis: 4 });
    const l = ordneText(f, ["abcdefghij"], messer);
    expect(l.passt).toBe(true);
    expect(l.verkleinert).toBe(true);
    expect(l.groesse).toBeLessThan(6);
    const min = ordneText(feld({ umbruch: "einzeilig", verkleinernBis: 6 }), ["abcdefghij"], messer);
    expect(min.passt).toBe(false);
    expect(min.ueberlauf).toBe("breite");
  });
  it("meldet Höhenüberlauf bei mehrzeiligem Text", () => {
    const l = ordneText(feld({ hoehe: 4 }), ["aaa bbb ccc ddd eee fff"], messer);
    expect(l.passt).toBe(false);
    expect(l.ueberlauf).toBe("hoehe");
  });
  it("richtet aus und setzt Blocksatz", () => {
    const z = ordneText(feld({ ausrichtung: "rechts", breite: 40, hoehe: 20, umbruch: "mehrzeilig" }), ["ab"], messer).zeilen[0].teile[0].x;
    expect(z).toBeCloseTo(40 * 72 / 25.4 - 10, 1);
    const b = ordneText(feld({ ausrichtung: "block", breite: 20, hoehe: 20 }), ["aa bb cc dd ee"], messer);
    expect(b.zeilen[0].teile.length).toBeGreaterThan(1);
    expect(b.zeilen[b.zeilen.length - 1].teile).toHaveLength(1);
  });
});

describe("Nutzenberechnung", () => {
  const basis = { endformat: { breite: 85, hoehe: 55 }, beschnitt: 3, bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 } };
  it("zählt exakt (Nutzen 91 × 61)", () => {
    const r = berechneNutzen(basis);
    expect(r.spalten).toBe(3); // 310 / 91 = 3,4
    expect(r.zeilen).toBe(7); // 440 / 61 = 7,2
    expect(r.proBogen).toBe(21);
  });
  it("berücksichtigt Abstände und korrigiert den retorix-Spaltenfehler", () => {
    // 4 Nutzen à 70 + 3 × 5 = 295 > 290 nutzbar -> 3 Spalten (retorix verglich den Rest mit der Höhe)
    const r = berechneNutzen({ ...basis, endformat: { breite: 70, hoehe: 40 }, beschnitt: 0, bogen: { breite: 300, hoehe: 100 }, rand: { oben: 0, unten: 0, links: 5, rechts: 5 }, abstand: { spalten: 5, zeilen: 5 } });
    expect(r.spalten).toBe(3);
    const genau = berechneNutzen({ ...basis, endformat: { breite: 70, hoehe: 40 }, beschnitt: 0, bogen: { breite: 295, hoehe: 100 }, rand: { oben: 0, unten: 0, links: 0, rechts: 0 }, abstand: { spalten: 5, zeilen: 5 } });
    expect(genau.spalten).toBe(4);
  });
  it("liefert 0 wenn nichts passt und zentriert das Raster", () => {
    expect(berechneNutzen({ ...basis, bogen: { breite: 50, hoehe: 50 } }).proBogen).toBe(0);
    const r = berechneNutzen(basis);
    expect(r.start.x).toBeCloseTo(5 + (310 - 273) / 2, 5);
    expect(zellenPosition(r, basis.abstand, 0, true).x).toBeCloseTo(r.start.x + 2 * 91, 5);
  });
});

describe("Codes", () => {
  it("prüft EAN-Prüfziffern und ergänzt fehlende", () => {
    expect(pruefeBarcodeInhalt("ean13", "4006381333931").ok).toBe(true);
    expect(pruefeBarcodeInhalt("ean13", "400638133393").text).toBe("4006381333931");
    const falsch = pruefeBarcodeInhalt("ean13", "4006381333932");
    expect(falsch.ok).toBe(false);
    expect(falsch.fehler).toContain("Prüfziffer");
    expect(pruefeBarcodeInhalt("ean13", "12AB").ok).toBe(false);
    expect(pruefeBarcodeInhalt("code39", "abc").ok).toBe(false);
    expect(pruefeBarcodeInhalt("gs1datamatrix", "0109501101530003").ok).toBe(false);
  });
  it("erzeugt Vektorformen", () => {
    const e = barcodeForm("ean13", "4006381333931");
    expect(e.art).toBe("linear");
    expect(e.rechtecke.length).toBeGreaterThanOrEqual(30);
    const d = barcodeForm("datamatrix", "HELLO");
    expect(d.art).toBe("matrix");
    expect(() => barcodeForm("ean13", "123")).toThrow();
    const q = qrForm("https://example.com", "M");
    expect(q.breite).toBe(q.hoehe);
    expect(() => qrForm("x".repeat(5000), "H")).toThrow(/zu lang/);
  });
  it("baut vCard 3.0 mit Maskierung", () => {
    const v = baueVCard({ vorname: "Erika", nachname: "Muster;mann", telefon: "+49 1", email: "e@x.de", strasse: "Weg 1, Hof" })!;
    expect(v).toContain("VERSION:3.0");
    expect(v).toContain("N:Muster\;mann;Erika;;;");
    expect(v).toContain("ADR;TYPE=WORK:;;Weg 1\\, Hof;;;;");
    expect(v.endsWith("END:VCARD")).toBe(true);
    expect(baueVCard({})).toBeNull();
  });
});

function objekteVon(doc: PDFDocument): PDFDict[] {
  const out: PDFDict[] = [];
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFDict) out.push(o);
    else if ("dict" in o && (o as { dict: unknown }).dict instanceof PDFDict) out.push((o as { dict: PDFDict }).dict);
  }
  return out;
}

describe("PDF-Erzeugung", () => {
  const ds = (name: string, extra: Record<string, string> = {}) => ({ werte: { name, funktion: "Leitung", telefon: "07071 1", email: "a@b.de", ean: "4006381333931", ...extra } });

  it("Einzelseiten: Seitenzahl, Boxen, Schrift, Text", async () => {
    const v = testVorlage();
    const r = await erzeugePdf(v, await testRessourcen(), [ds("Anna Beispiel"), ds("Bernd Test")], { modus: "einzeln" });
    expect(r.meldungen.filter((m) => m.schwere === "fehler")).toEqual([]);
    expect(r.seiten).toBe(4);
    const doc = await PDFDocument.load(r.pdf!);
    const p = doc.getPage(0);
    const mm = 72 / 25.4;
    expect(p.getWidth()).toBeCloseTo(91 * mm, 1);
    expect(p.getTrimBox()).toMatchObject({ x: expect.closeTo(3 * mm, 1), width: expect.closeTo(85 * mm, 1) });
    expect(p.getBleedBox().width).toBeCloseTo(91 * mm, 1);
    const objekte = objekteVon(doc);
    expect(objekte.some((o) => String(o.get(PDFName.of("BaseFont")) ?? "").includes("OpenSans"))).toBe(true);
    expect(r.pdf!.length).toBeLessThan(60_000); // Subset: die vollen Schriften wären zusammen > 230 KB
    expect(objekte.some((o) => o.has(PDFName.of("FontFile2")))).toBe(true);
  });

  it("Ausgeschossen: Nutzen je Bogen, Rückseiten, Auflage", async () => {
    const v = testVorlage();
    const r = await erzeugePdf(v, await testRessourcen(), [{ ...ds("A"), auflage: 15 }, { ...ds("B"), auflage: 10 }]);
    // 25 Nutzen / 21 je Bogen = 2 Bögen, je Vorder- + Rückseite
    expect(r.boegen).toBe(2);
    expect(r.seiten).toBe(4);
    expect(r.nutzen).toBe(25);
    const doc = await PDFDocument.load(r.pdf!);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(320 * 72 / 25.4, 1);
  });

  it("Ausgeschossen ohne Rückseite und mit Überlagerung", async () => {
    const v = testVorlage({ design: { dateiId: "11111111-1111-4111-8111-111111111111", vorne: 1, hinten: null, mitBeschnitt: true }, felder: [], ausgabe: { modus: "ausgeschossen", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 }, ueberlagerung: { dateiId: "22222222-2222-4222-8222-222222222222", nurVorderseite: false } } });
    const res = await testRessourcen();
    res.ueberlagerung = await testDesign(320, 450, 1);
    const r = await erzeugePdf(v, res, [{ ...ds("A"), auflage: 22 }]);
    expect(r.seiten).toBe(2);
  });

  it("meldet Pflichtfeld, zu langen Text, ungültigen Barcode, fehlendes Zeichen", async () => {
    const v = testVorlage();
    const res = await testRessourcen();
    const m = await pruefeDatensaetze(v, res, [
      ds(""),
      ds("N".repeat(60)),
      ds("Ok", { ean: "4006381333932" }),
      ds("Ok", { funktion: "Chef ✓" }),
      ds("Ok", { funktion: "Wort ".repeat(30) }),
    ]);
    const codes = m.map((x) => `${x.datensatz}:${x.code}`);
    expect(codes).toContain("1:pflicht_leer");
    expect(codes).toContain("2:zu_lang");
    expect(codes).toContain("3:barcode_ungueltig");
    expect(codes).toContain("4:zeichen_fehlt");
    expect(codes).toContain("5:text_passt_nicht");
    const pflicht = m.find((x) => x.code === "pflicht_leer")!;
    expect(pflicht.text).toBe("Datensatz 1: „Name“ ist ein Pflichtfeld und noch leer.");
    expect(pflicht.feld).toBe("name");
  });

  it("liefert bei Fehlern kein PDF, in der Vorschau aber doch", async () => {
    const v = testVorlage();
    const res = await testRessourcen();
    expect((await erzeugePdf(v, res, [ds("")])).pdf).toBeNull();
    const vor = await erzeugeVorschau(v, res, ds(""));
    expect(vor.pdf).not.toBeNull();
    expect((await erzeugeVorschau(v, res)).meldungen.filter((m) => m.schwere === "fehler")).toEqual([]);
    expect(beispielDatensatz(v).werte.name).toBe("Erika Mustermann");
  });

  it("erzwingt Grenzwerte und meldet unpassendes Layout", async () => {
    const v = testVorlage();
    const res = await testRessourcen();
    await expect(erzeugePdf(v, res, [ds("a"), ds("b")], { grenzen: { maxDatensaetze: 1 } })).rejects.toMatchObject({ code: "zu_viele_datensaetze" });
    await expect(erzeugePdf(v, res, [{ ...ds("a"), auflage: 50 }], { grenzen: { maxNutzen: 10 } })).rejects.toMatchObject({ code: "zu_viele_nutzen" });
    const gross = testVorlage({ ausgabe: { modus: "ausgeschossen", bogen: { breite: 50, hoehe: 50 }, rand: { oben: 0, unten: 0, links: 0, rechts: 0 }, abstand: { spalten: 0, zeilen: 0 } } });
    await expect(erzeugePdf(gross, res, [ds("a")])).rejects.toBeInstanceOf(RenderFehler);
  });

  it("schreibt Sonderfarben als Separation mit CMYK-Ersatz", async () => {
    const v = testVorlage();
    v.felder[0] = { ...(v.felder[0] as object), farbe: "HKS 43" } as never;
    const res = await testRessourcen(91, 61, [{ name: "HKS 43", cmyk: [100, 60, 0, 10], sonderfarbe: "HKS 43 K" }]);
    const r = await erzeugePdf(v, res, [ds("Anna")], { modus: "einzeln" });
    const doc = await PDFDocument.load(r.pdf!);
    const cs = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ColorSpace"), PDFDict);
    const arr = cs.lookup(cs.keys()[0], PDFArray);
    expect(String(arr.get(0))).toBe("/Separation");
    expect(String(arr.get(1))).toBe("/HKS#2043#20K");
    expect(String(arr.get(2))).toBe("/DeviceCMYK");
  });

  it("zeichnet Codes als Vektor (keine Bilder)", async () => {
    const r = await erzeugePdf(testVorlage(), await testRessourcen(), [ds("Anna")], { modus: "einzeln" });
    const objekte = objekteVon(await PDFDocument.load(r.pdf!));
    expect(objekte.some((o) => String(o.get(PDFName.of("Subtype"))) === "/Image")).toBe(false);
  });
});
