import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { Variable } from "./schema";
import {
  beispielCsv,
  beispielTabelle,
  beispielXlsx,
  dekodiereText,
  entschaerfeZelle,
  erkenneTrennzeichen,
  leseCsv,
  leseTabelle,
  leseXlsx,
  ordneSpalten,
  schreibeXlsx,
  TabellenFehler,
  tabelleZuDatensaetzen,
} from "./tabelle";

const v = (schluessel: string, bezeichnung: string, pflicht = false): Variable => ({ schluessel, bezeichnung, pflicht, beispiel: `Bsp ${schluessel}`, maxLaenge: null, hilfe: "" });
const VARS = [v("name", "Name", true), v("telefon", "Telefon"), v("plz", "PLZ"), v("strasse", "Straße")];

describe("CSV", () => {
  it("erkennt Trennzeichen", () => {
    expect(erkenneTrennzeichen("a;b;c\n1;2;3")).toBe(";");
    expect(erkenneTrennzeichen("a,b,c\n1,2,3")).toBe(",");
    expect(erkenneTrennzeichen("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(erkenneTrennzeichen('"a;b",c\n1,2')).toBe(",");
  });
  it("liest UTF-8 mit und ohne BOM sowie Windows-1252", () => {
    const utf = strToU8("Name;Straße\nMüller;Hauptstr. 1\n");
    expect(leseCsv(utf).kopf).toEqual(["Name", "Straße"]);
    const mitBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf]);
    expect(leseCsv(mitBom).kopf[0]).toBe("Name");
    const win = new Uint8Array([...strToU8("Name;Stra"), 0xdf, ...strToU8("e\nM"), 0xfc, ...strToU8("ller;x\n")]);
    const t = leseCsv(win);
    expect(t.kodierung).toBe("windows-1252");
    expect(t.kopf[1]).toBe("Straße");
    expect(t.zeilen[0][0]).toBe("Müller");
    expect(dekodiereText(utf).kodierung).toBe("utf-8");
  });
  it("kann Anführungszeichen, Zeilenumbrüche in Zellen und führende Nullen", () => {
    const t = leseCsv(strToU8('Name;PLZ;Notiz\r\n"Meier; Hans";01234;"Zeile 1\nZeile ""2"""\r\n\r\n;;\r\n'));
    expect(t.zeilen).toEqual([["Meier; Hans", "01234", 'Zeile 1\nZeile "2"']]);
  });
  it("lehnt leere Tabellen ab", () => {
    expect(() => leseCsv(strToU8("\n\n"))).toThrow(TabellenFehler);
  });
});

describe("XLSX", () => {
  it("schreibt und liest zurück, alles als Text", () => {
    const bytes = schreibeXlsx(["Name", "PLZ", "Telefon"], [["Anna & <Co>", "01067", "+49 (0)351 1"], ["", "", "007"]]);
    const t = leseXlsx(bytes);
    expect(t.kopf).toEqual(["Name", "PLZ", "Telefon"]);
    expect(t.zeilen).toEqual([["Anna & <Co>", "01067", "+49 (0)351 1"], ["", "", "007"]]);
    expect(leseTabelle(bytes).format).toBe("xlsx");
  });
  it("liest Excel-typische Strukturen (Shared Strings, Zahlen, Lücken, Rich Text)", async () => {
    const { zipSync, strToU8: s8 } = await import("fflate");
    const sheet = `<worksheet xmlns="x"><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
      <row r="3"><c r="A3"><v>49123</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="b"><v>1</v></c></row></sheetData></worksheet>`;
    const bytes = zipSync({
      "xl/workbook.xml": s8(`<workbook xmlns:r="r"><sheets><sheet name="A" sheetId="1" r:id="rId7"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": s8(`<Relationships><Relationship Id="rId7" Target="worksheets/data.xml"/></Relationships>`),
      "xl/sharedStrings.xml": s8(`<sst><si><t>Name</t></si><si><r><t>Te</t></r><r><t>l</t></r></si><si><t xml:space="preserve"> Hallo </t></si></sst>`),
      "xl/worksheets/data.xml": s8(sheet),
    });
    const t = leseXlsx(bytes);
    expect(t.kopf).toEqual(["Name", "", "Tel"].slice(0, 3));
    expect(t.zeilen).toEqual([["49123", " Hallo ", "WAHR"]]);
  });
  it("weist Müll und Zip-Bomben ab", () => {
    expect(() => leseXlsx(strToU8("kein zip"))).toThrow(TabellenFehler);
    expect(() => leseTabelle(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/xls/);
  });
});

describe("Spaltenzuordnung", () => {
  it("ordnet tolerant zu (Groß-/Kleinschreibung, Umlaute, Leerzeichen, Markierungen)", () => {
    const z = ordneSpalten(["NAME *", " Strasse ", "Telefonnummer", "p l z", "Anzahl", "Bemerkung"], VARS);
    expect(z.variablen).toEqual({ name: 0, telefon: 2, plz: 3, strasse: 1 });
    expect(z.auflage).toBe(4);
    expect(z.unbenutzt).toEqual([5]);
    expect(z.fehlend).toEqual([]);
  });
  it("meldet fehlende Variablen mit Pflichtkennzeichen", () => {
    const z = ordneSpalten(["Telefon"], VARS);
    expect(z.fehlend.find((f) => f.schluessel === "name")).toMatchObject({ pflicht: true });
    expect(z.variablen.name).toBeNull();
  });
  it("erzeugt Datensätze mit Text-Werten und Auflage", () => {
    const t = leseCsv(strToU8("Name;PLZ;Auflage\nAnna;01067;50\nBen;02;x\n"));
    const r = tabelleZuDatensaetzen(t, ordneSpalten(t.kopf, VARS));
    expect(r.datensaetze[0]).toEqual({ werte: { name: "Anna", telefon: "", plz: "01067", strasse: "" }, auflage: 50 });
    expect(r.datensaetze[1].auflage).toBe(1);
    expect(r.warnungen[0]).toContain("Datensatz 2");
  });
});

describe("Export", () => {
  it("Beispieltabelle hat die richtigen Köpfe und passt zur eigenen Zuordnung", () => {
    const t = beispielTabelle({ variablen: VARS });
    expect(t.kopf).toEqual(["Name *", "Telefon", "PLZ", "Straße", "Auflage"]);
    const gelesen = leseTabelle(beispielXlsx({ variablen: VARS }));
    expect(gelesen.zeilen[0][0]).toBe("Bsp name");
    expect(ordneSpalten(gelesen.kopf, VARS).fehlend).toEqual([]);
    expect(leseTabelle(beispielCsv({ variablen: VARS })).kopf).toEqual(t.kopf);
  });
  it("verhindert Formel-Injection, lässt Telefonnummern aber heil", () => {
    expect(entschaerfeZelle("=1+1")).toBe("'=1+1");
    expect(entschaerfeZelle("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(entschaerfeZelle("+1+cmd|' /C calc'!A0")).toMatch(/^'/);
    expect(entschaerfeZelle("-2+3")).toMatch(/^'/);
    expect(entschaerfeZelle("+49 (0)7071 123-45")).toBe("+49 (0)7071 123-45");
    expect(entschaerfeZelle("Normal")).toBe("Normal");
    const csv = Buffer.from(beispielCsv({ variablen: [{ ...v("a", "A"), beispiel: "=HYPERLINK(1)" }] })).toString("utf8");
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});
