/** Nur für Tests: Beispielvorlage, Test-Schriften und ein Design-PDF. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { parseVorlage, type Vorlage } from "./schema";
import type { Ressourcen } from "./render/typen";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures/personalisierung");

export function testSchrift(schnitt: "regular" | "bold") {
  return {
    familie: "Open Sans",
    schnitt,
    bytes: new Uint8Array(readFileSync(path.join(FIXTURES, schnitt === "bold" ? "OpenSans-Bold.ttf" : "OpenSans-Regular.ttf"))),
  };
}

/** Mehrseitiges Design-PDF; Seitengröße in mm. */
export async function testDesign(breite: number, hoehe: number, seiten = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) {
    const p = doc.addPage([(breite * 72) / 25.4, (hoehe * 72) / 25.4]);
    p.drawRectangle({ x: 0, y: 0, width: p.getWidth(), height: p.getHeight(), color: rgb(i ? 0.9 : 1, 0.95, 0.8) });
  }
  return doc.save();
}

/** Visitenkarte 85×55 mm mit 3 mm Beschnitt, Vorder- und Rückseite. */
export function testVorlage(extra: Record<string, unknown> = {}): Vorlage {
  const r = parseVorlage({
    name: "Visitenkarte",
    endformat: { breite: 85, hoehe: 55 },
    beschnitt: 3,
    design: { dateiId: "11111111-1111-4111-8111-111111111111", vorne: 1, hinten: 2, mitBeschnitt: true },
    variablen: [
      { schluessel: "name", bezeichnung: "Name", pflicht: true, beispiel: "Erika Mustermann", maxLaenge: 40 },
      { schluessel: "funktion", bezeichnung: "Funktion", beispiel: "Geschäftsführerin" },
      { schluessel: "telefon", bezeichnung: "Telefon", beispiel: "07071 12345" },
      { schluessel: "mobil", bezeichnung: "Mobil", beispiel: "0170 1234567" },
      { schluessel: "email", bezeichnung: "E-Mail", beispiel: "erika@example.com" },
      { schluessel: "ean", bezeichnung: "EAN", beispiel: "4006381333931" },
    ],
    felder: [
      { typ: "text", id: "name", name: "Name", x: 8, y: 8, breite: 50, hoehe: 7, vorlage: "{{name}}", schrift: { familie: "Open Sans", fett: true }, groesse: 12, verkleinernBis: 8, umbruch: "einzeilig" },
      { typ: "text", id: "kontakt", name: "Kontakt", x: 8, y: 25, breite: 50, hoehe: 20, vorlage: "{{funktion}}\nTel. {{telefon}}\nMobil {{mobil}}\n{{email}}", schrift: { familie: "Open Sans" }, groesse: 8 },
      { typ: "vcard", id: "vc", name: "vCard", x: 60, y: 25, breite: 20, hoehe: 20, zuordnung: { nachname: "{{name}}", telefon: "{{telefon}}", email: "{{email}}" }, ruhezone: 1, hintergrund: "Weiß" },
      { typ: "barcode", id: "bc", name: "EAN", seite: "hinten", x: 20, y: 20, breite: 45, hoehe: 15, symbologie: "ean13", inhalt: "{{ean}}", schrift: { familie: "Open Sans" } },
      { typ: "qr", id: "qr", name: "QR", seite: "hinten", x: 65, y: 35, breite: 15, hoehe: 15, inhalt: "https://example.com/{{name}}" },
    ],
    ausgabe: { modus: "ausgeschossen", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 } },
    ...extra,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.vorlage;
}

export async function testRessourcen(w = 91, h = 61, farben: Ressourcen["farben"] = []): Promise<Ressourcen> {
  return { design: await testDesign(w, h), schriften: [testSchrift("regular"), testSchrift("bold")], bilder: {}, farben };
}
