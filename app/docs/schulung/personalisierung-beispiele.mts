/**
 * Erzeugt die Beispieldateien für Schulung und Screenshots der Personalisierung (alles erfunden, Muster GmbH):
 *
 *   docs/schulung/beispiele/visitenkarte-design.pdf        Design-PDF für die Übung „Neue Vorlage“ (2 Seiten, 91 × 61 mm)
 *   docs/schulung/beispiele/namensschild-design.pdf        weitere Designs für die Übersicht der Screenshots
 *   docs/schulung/beispiele/einladung-design.pdf
 *   docs/schulung/beispiele/visitenkarten-beispiel.csv     Beispieltabelle für die Übung „Tabelle hochladen“
 *   docs/schulung/beispiele/personalisierung-fixtures.json Vorlage, Farben, Prüfmeldungen (mit der echten Engine gerechnet)
 *   docs/schulung/beispiele/vorschau-*.pdf                 Vorschauen der Beispieleinträge (so liefert sie der Server)
 *
 *   npx vite-node docs/schulung/personalisierung-beispiele.mts
 *
 * Ohne Datenbank, ohne Speicher. Schrift: Open Sans (tests/fixtures/personalisierung, SIL Open Font License).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { erzeugeVorschau, pruefeDatensaetze } from "../../lib/personalisierung/render/index";
import { parseVorlage, type Vorlage } from "../../lib/personalisierung/schema";
import type { Ressourcen } from "../../lib/personalisierung/render/typen";

const MM = 72 / 25.4;
const AUS = path.join(import.meta.dirname, "beispiele");
mkdirSync(AUS, { recursive: true });

const GRUEN = rgb(0.31, 0.57, 0.13);
const BLAU = rgb(0, 0.37, 0.59);
const ORANGE = rgb(0.85, 0.42, 0.1);
const WEISS = rgb(1, 1, 1);

/** Rechteck in Millimetern, y von oben gemessen (wie im Editor). */
function kasten(p: PDFPage, x: number, yOben: number, b: number, h: number, farbe: ReturnType<typeof rgb>) {
  p.drawRectangle({ x: x * MM, y: p.getHeight() - (yOben + h) * MM, width: b * MM, height: h * MM, color: farbe });
}
function kreis(p: PDFPage, x: number, yOben: number, r: number, farbe: ReturnType<typeof rgb>, deckkraft = 1) {
  p.drawCircle({ x: x * MM, y: p.getHeight() - yOben * MM, size: r * MM, color: farbe, opacity: deckkraft });
}
function schrift(p: PDFPage, t: string, x: number, yBasis: number, pt: number, f: PDFFont, farbe: ReturnType<typeof rgb>, mitte = false) {
  const b = f.widthOfTextAtSize(t, pt);
  p.drawText(t, { x: (mitte ? p.getWidth() / 2 - b / 2 : x * MM), y: p.getHeight() - yBasis * MM, size: pt, font: f, color: farbe });
}

async function karte(breite: number, hoehe: number, farbe: ReturnType<typeof rgb>, titel: string, untertitel: string, mitRueckseite: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const vorn = doc.addPage([breite * MM, hoehe * MM]);
  kasten(vorn, 0, 0, breite, 19, farbe);
  kreis(vorn, breite - 14, 9.5, 5, WEISS, 0.9);
  kreis(vorn, breite - 9.5, 9.5, 5, WEISS, 0.5);
  schrift(vorn, titel, 11, 11.5, 13, fett, WEISS);
  schrift(vorn, untertitel, 11, 15.5, 6.5, normal, WEISS);
  schrift(vorn, "muster-gmbh.example · Musterweg 1 · 74072 Heilbronn", 11, hoehe - 7, 6, normal, rgb(0.45, 0.45, 0.45));
  if (mitRueckseite) {
    const hinten = doc.addPage([breite * MM, hoehe * MM]);
    kasten(hinten, 0, 0, breite, hoehe, farbe);
    kreis(hinten, 12, 14, 18, WEISS, 0.08);
    kreis(hinten, breite - 8, hoehe - 6, 22, WEISS, 0.08);
    schrift(hinten, "Scannen und Kontakt speichern", 0, hoehe - 14, 7, normal, WEISS, true);
  }
  return doc.save();
}

async function main() {
  writeFileSync(path.join(AUS, "visitenkarte-design.pdf"), await karte(91, 61, GRUEN, "Muster GmbH", "Druck & Medien · Heilbronn", true));
  writeFileSync(path.join(AUS, "namensschild-design.pdf"), await karte(96, 66, BLAU, "Herbstkongress", "Namensschild · 21. November", false));
  writeFileSync(path.join(AUS, "einladung-design.pdf"), await karte(111, 154, ORANGE, "Einladung", "Hoffest der Muster GmbH", true));

  const dir = path.resolve(import.meta.dirname, "../../tests/fixtures/personalisierung");
  const ressourcen: Ressourcen = {
    design: new Uint8Array(readFileSync(path.join(AUS, "visitenkarte-design.pdf"))),
    schriften: [
      { familie: "Open Sans", schnitt: "regular", bytes: new Uint8Array(readFileSync(path.join(dir, "OpenSans-Regular.ttf"))) },
      { familie: "Open Sans", schnitt: "bold", bytes: new Uint8Array(readFileSync(path.join(dir, "OpenSans-Bold.ttf"))) },
    ],
    bilder: {},
    farben: [
      { name: "Firmenblau", cmyk: [100, 55, 0, 20] },
      { name: "Hausgrün", cmyk: [62, 0, 100, 10] },
      { name: "Akzent HKS 13 K", cmyk: [0, 35, 100, 0], sonderfarbe: "HKS 13 K" },
    ],
  };

  const parsed = parseVorlage({
    name: "Visitenkarte Außendienst",
    beschreibung: "Visitenkarte mit Name, Funktion, Telefon und E-Mail. Auf der Rückseite steht ein QR-Code zum Speichern des Kontakts.",
    endformat: { breite: 85, hoehe: 55 },
    beschnitt: 3,
    design: { dateiId: "d1000000-0000-4000-8000-000000000001", vorne: 1, hinten: 2, mitBeschnitt: true },
    variablen: [
      { schluessel: "vorname", bezeichnung: "Vorname", pflicht: true, beispiel: "Erika", maxLaenge: 30 },
      { schluessel: "nachname", bezeichnung: "Nachname", pflicht: true, beispiel: "Mustermann", maxLaenge: 40 },
      { schluessel: "funktion", bezeichnung: "Funktion", beispiel: "Leiterin Vertrieb", maxLaenge: 60 },
      { schluessel: "telefon", bezeichnung: "Telefon", beispiel: "07131 555-100" },
      { schluessel: "email", bezeichnung: "E-Mail", beispiel: "erika.mustermann@example.org" },
    ],
    felder: [
      { typ: "text", id: "name", name: "Name", x: 8, y: 21, breite: 69, hoehe: 7, vorlage: "{{vorname}} {{nachname}}", umbruch: "einzeilig", schrift: { familie: "Open Sans", fett: true }, groesse: 12, verkleinernBis: 8 },
      { typ: "text", id: "funktion", name: "Funktion", x: 8, y: 29, breite: 69, hoehe: 5, vorlage: "{{funktion}}", umbruch: "einzeilig", schrift: { familie: "Open Sans" }, groesse: 8.5, farbe: "Firmenblau", verkleinernBis: 6 },
      { typ: "text", id: "kontakt", name: "Kontakt", x: 8, y: 36, breite: 69, hoehe: 12, vorlage: "Tel. {{telefon}}\n{{email}}", umbruch: "mehrzeilig", schrift: { familie: "Open Sans" }, groesse: 8 },
      { typ: "vcard", id: "kontakt-qr", name: "Kontakt-QR", seite: "hinten", x: 30, y: 12, breite: 25, hoehe: 25, zuordnung: { vorname: "{{vorname}}", nachname: "{{nachname}}", funktion: "{{funktion}}", telefon: "{{telefon}}", email: "{{email}}" }, ruhezone: 1, hintergrund: "Weiß" },
    ],
    ausgabe: { modus: "einzeln", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 }, ueberlagerung: null },
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.fehler));
  const vorlage: Vorlage = parsed.vorlage;

  const eintraege: Record<string, Record<string, string>> = {
    "Anna|Muster": { vorname: "Anna", nachname: "Muster", funktion: "Leiterin Vertrieb", telefon: "07131 555-101", email: "anna.muster@example.org" },
    "Ben|Beispiel": { vorname: "Ben", nachname: "Beispiel", funktion: "Projektleiter Digitale Medien", telefon: "07131 555-102", email: "ben.beispiel@example.org" },
    "Marie-Luise|Sonnenschein-Wolkenstein": { vorname: "Marie-Luise", nachname: "Sonnenschein-Wolkenstein", funktion: "Stellv. Leiterin Kundenservice und Qualitätsmanagement", telefon: "07131 555-103", email: "marie-luise.sonnenschein-wolkenstein@example.org" },
    "Tim|": { vorname: "Tim", nachname: "", funktion: "Auszubildender", telefon: "07131 555-104", email: "tim@example.org" },
    "|": { vorname: "Erika", nachname: "Mustermann", funktion: "Leiterin Vertrieb", telefon: "07131 555-100", email: "erika.mustermann@example.org" },
  };
  const pruefung: Record<string, unknown> = {};
  let nr = 0;
  for (const [schluessel, werte] of Object.entries(eintraege)) {
    nr += 1;
    const v = await erzeugeVorschau(vorlage, ressourcen, { werte, auflage: 1 });
    writeFileSync(path.join(AUS, `vorschau-${nr}.pdf`), v.pdf);
    pruefung[schluessel] = { datei: `vorschau-${nr}.pdf`, meldungen: await pruefeDatensaetze(vorlage, ressourcen, [{ werte, auflage: 1 }]) };
  }
  const beispiel = await erzeugeVorschau(vorlage, ressourcen, null);
  writeFileSync(path.join(AUS, "vorschau-beispiel.pdf"), beispiel.pdf);

  writeFileSync(
    path.join(AUS, "personalisierung-fixtures.json"),
    JSON.stringify({ hinweis: "Erzeugt von docs/schulung/personalisierung-beispiele.mts", vorlage, farben: ressourcen.farben, pruefung }, null, 2) + "\n",
  );

  const csv = [
    "Vorname;Nachname;Funktion;Telefon;E-Mail;Auflage",
    "Anna;Muster;Leiterin Vertrieb;07131 555-101;anna.muster@example.org;250",
    "Ben;Beispiel;Projektleiter Digitale Medien;07131 555-102;ben.beispiel@example.org;250",
    "Carla;Probe;Kundenberaterin;07131 555-103;carla.probe@example.org;100",
    "David;Test;Vorstufe;07131 555-104;david.test@example.org;100",
    "Eva;Demo;Büroleitung;07131 555-105;eva.demo@example.org;100",
  ].join("\r\n");
  writeFileSync(path.join(AUS, "visitenkarten-beispiel.csv"), "﻿" + csv + "\r\n");

  for (const [k, v] of Object.entries(pruefung)) console.log(k || "(Beispiel)", "→", (v as { meldungen: { text: string }[] }).meldungen.map((m) => m.text).join(" | ") || "keine Meldungen");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
