/**
 * Schulungs-Screenshots für /hilfe und die PDF-Kurzanleitungen.
 *
 * Läuft gegen eine lokale App (`npm run dev`) OHNE Datenbank: alle /api-Aufrufe werden mit den
 * fiktiven Daten aus testdaten.cjs beantwortet. So entstehen reproduzierbare Bilder ohne echte Kundendaten.
 *
 *   PARTNER_WEBHOOK_WORKER=off npx next dev -p 3100      # in einem zweiten Terminal
 *   node docs/schulung/screenshots.cjs http://localhost:3100 /tmp/shots
 *   node docs/schulung/zu-webp.cjs /tmp/shots              # → public/hilfe/img/*.webp + lib/hilfe/bilder.ts
 *
 * Desktop 1280×860 @1.5, deutsche Locale, `?tour=aus` (keine Tour-Einladung im Bild), Toasts ausgeblendet.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const T = require("./testdaten.cjs");

const [BASIS = "http://localhost:3100", ZIEL = "/tmp/shots"] = process.argv.slice(2);
fs.mkdirSync(ZIEL, { recursive: true });
const DATEIEN = path.join(ZIEL, "_dateien");
fs.mkdirSync(DATEIEN, { recursive: true });

const OHNE_TOASTS = `[data-slot="toast-viewport"]{display:none!important} nextjs-portal{display:none!important}
*{caret-color:transparent!important} .reveal{opacity:1!important;transform:none!important}
.nav{position:static!important} [data-slot="tooltip-content"],[role="tooltip"]{display:none!important}`;

function json(route, daten, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(daten) });
}

/** Beispieldateien (PDF/PNG) einmal mit Chromium erzeugen. */
async function beispielDateien(browser) {
  const seite = await browser.newPage();
  const muster = (titel, farbe, zeilen) => `<!doctype html><html><body style="margin:0;font-family:Geist,Arial,sans-serif">
    <div style="height:100vh;background:${farbe};color:#fff;padding:14mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between">
      <div style="font-size:11pt;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Muster GmbH</div>
      <div><div style="font-size:30pt;font-weight:700;line-height:1.05">${titel}</div>
      <div style="margin-top:6mm;font-size:12pt;line-height:1.5;opacity:.9">${zeilen}</div></div>
      <div style="font-size:9pt;opacity:.8">musterweg 1 · 74072 heilbronn · example.org</div></div></body></html>`;
  const pdf = async (name, html, breite, hoehe) => {
    await seite.setContent(html);
    await seite.pdf({ path: path.join(DATEIEN, name), width: `${breite}mm`, height: `${hoehe}mm`, printBackground: true });
  };
  await pdf("flyer-vorderseite.pdf", muster("Herbstfest<br>im Hof", "#4f9122", "Samstag, 21. November<br>ab 14 Uhr · Eintritt frei"), 105, 216);
  await pdf("flyer-rueckseite.pdf", muster("Programm", "#005e97", "14 Uhr Kinderprogramm<br>16 Uhr Live-Musik<br>18 Uhr Feuerschale"), 105, 216);
  await pdf(
    "auftragsbestaetigung.pdf",
    `<!doctype html><body style="font-family:Arial;padding:20mm;font-size:11pt"><b>digitale medien print gmbh</b><h2>Auftragsbestätigung 091126-004</h2>
     <p>Muster GmbH · Anna Muster</p><table style="border-collapse:collapse;width:100%" border=1 cellpadding=6>
     <tr><th align=left>Position</th><th align=right>Menge</th></tr><tr><td>Flyer DIN lang, 4/4-farbig, 170 g Bilderdruck matt</td><td align=right>2.500</td></tr></table>
     <p>Liefertermin: 20.11.2026</p></body>`,
    210,
    297,
  );
  await pdf(
    "rechnung.pdf",
    `<!doctype html><body style="font-family:Arial;padding:20mm;font-size:11pt"><b>digitale medien print gmbh</b><h2>Rechnung 2026-1187</h2><p>Muster GmbH</p><p>Flyer DIN lang, 2.500 Stück</p></body>`,
    210,
    297,
  );
  await seite.setViewportSize({ width: 600, height: 600 });
  await seite.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#fff"><div style="font:700 120px Arial;color:#4f9122">M<span style="color:#005e97">G</span></div></body>`,
  );
  await seite.screenshot({ path: path.join(DATEIEN, "logo-muster.png") });
  await seite.close();
}

function dateiFuer(url) {
  if (/logo|-f3\b|-f3$/.test(url)) return { datei: "logo-muster.png", typ: "image/png" };
  if (/invoice/.test(url)) return { datei: "rechnung.pdf", typ: "application/pdf" };
  if (/confirmation/.test(url)) return { datei: "auftragsbestaetigung.pdf", typ: "application/pdf" };
  if (/print-1|-f2\b|-f2$/.test(url)) return { datei: "flyer-rueckseite.pdf", typ: "application/pdf" };
  return { datei: "flyer-vorderseite.pdf", typ: "application/pdf" };
}


const BEISPIELE = path.join(__dirname, "beispiele");
const PF = JSON.parse(fs.readFileSync(path.join(BEISPIELE, "personalisierung-fixtures.json"), "utf8"));
const KF = JSON.parse(fs.readFileSync(path.join(BEISPIELE, "kalkulation-fixtures.json"), "utf8"));
const VORLAGE_ID = "b1000000-0000-4000-8000-000000000001";
const DESIGNS = {
  "d1000000-0000-4000-8000-000000000001": "visitenkarte-design.pdf",
  "d1000000-0000-4000-8000-000000000002": "namensschild-design.pdf",
  "d1000000-0000-4000-8000-000000000003": "einladung-design.pdf",
};
const FONTS = { f1: ["Regular", "OpenSans-Regular.ttf"], f2: ["Bold", "OpenSans-Bold.ttf"] };
const FONT_DIR = path.join(__dirname, "../../tests/fixtures/personalisierung");
const vorbei = (n) => new Date(new Date("2026-11-09T09:30:00+01:00").getTime() - n * 36e5).toISOString();
const KARTEN = [
  { id: VORLAGE_ID, name: "Visitenkarte Außendienst", status: "aktiv", sichtbarkeit: "kunden", aktuelleVersion: 2, archiviert: false, createdAt: vorbei(200), updatedAt: vorbei(4), designDateiId: "d1000000-0000-4000-8000-000000000001", designVorne: 1, endformat: { breite: 85, hoehe: 55 }, kundenAnzahl: 2, ungespeichert: false, geaendertAm: vorbei(4) },
  { id: "b1000000-0000-4000-8000-000000000002", name: "Namensschild Herbstkongress", status: "aktiv", sichtbarkeit: "oeffentlich", aktuelleVersion: 1, archiviert: false, createdAt: vorbei(100), updatedAt: vorbei(30), designDateiId: "d1000000-0000-4000-8000-000000000002", designVorne: 1, endformat: { breite: 90, hoehe: 60 }, kundenAnzahl: 0, ungespeichert: true, geaendertAm: vorbei(2) },
  { id: "b1000000-0000-4000-8000-000000000003", name: "Einladung Hoffest", status: "entwurf", sichtbarkeit: "mitarbeiter", aktuelleVersion: 1, archiviert: false, createdAt: vorbei(20), updatedAt: vorbei(20), designDateiId: "d1000000-0000-4000-8000-000000000003", designVorne: 1, endformat: { breite: 105, hoehe: 148 }, kundenAnzahl: 0, ungespeichert: false, geaendertAm: vorbei(20) },
];
const VORLAGE_DETAIL = (extra = {}) => ({
  id: VORLAGE_ID, name: PF.vorlage.name, status: "aktiv", sichtbarkeit: "kunden", aktuelleVersion: 2, vorlage: PF.vorlage, arbeitskopie: null,
  kunden: [{ id: "i1", email: T.KUNDE.email, name: T.KUNDE.displayName }], links: [], ...extra,
});
const ANSICHT = {
  id: VORLAGE_ID, name: PF.vorlage.name, beschreibung: PF.vorlage.beschreibung, version: 2, endformat: PF.vorlage.endformat, beschnitt: 3, hatRueckseite: true,
  variablen: PF.vorlage.variablen, grenzen: { maxDatensaetze: 2000, maxNutzen: 20000 }, akteur: "gast", entwurfStunden: 24,
};
const TABELLE = {
  format: "csv", kopf: ["Vorname", "Nachname", "Funktion", "Telefon", "E-Mail", "Auflage"], zeilen: 5,
  zuordnung: { variablen: { vorname: 0, nachname: 1, funktion: 2, telefon: 3, email: 4 }, auflage: 5, unbenutzt: [], fehlend: [] },
  datensaetze: [
    ["Anna", "Muster", "Leiterin Vertrieb", "07131 555-101", "anna.muster@example.org", 250],
    ["Ben", "Beispiel", "Projektleiter Digitale Medien", "07131 555-102", "ben.beispiel@example.org", 250],
    ["Carla", "Probe", "Kundenberaterin", "07131 555-103", "carla.probe@example.org", 100],
    ["David", "Test", "Vorstufe", "07131 555-104", "david.test@example.org", 100],
    ["Eva", "Demo", "Büroleitung", "07131 555-105", "eva.demo@example.org", 100],
  ].map(([vorname, nachname, funktion, telefon, email, auflage]) => ({ werte: { vorname, nachname, funktion, telefon, email }, auflage })),
  warnungen: [],
};
const PERS_AUFTRAG = {
  ...T.DETAILS.r2,
  request: { ...T.DETAILS.r2.request, id: "p1", number: "091126-006", productHint: "personalisierung", freeText: "Personalisierte Drucksache „Visitenkarte Außendienst“: 5 Datensätze, 800 Stück." },
  files: [],
  personalisierung: { templateId: VORLAGE_ID, templateName: PF.vorlage.name, version: 2, records: 5, nutzen: 800, pages: 10, mode: "einzeln", pdfFileId: "x1", dataFileId: "x2" },
};

/** Personalisierung, Kalkulation, Richtpreis: Antworten für die neuen Bereiche (null = nicht zuständig). */
async function apiNeu(route, p, m, req) {
  const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
  let t;
  // --- Personalisierung (Mitarbeiter)
  if ((t = p.match(/^\/api\/personalisierung\/staff\/(.*)$/))) {
    const r = t[1];
    if (r === "vorlagen" && m === "GET") return json(route, { vorlagen: KARTEN });
    if (r === `vorlagen/${VORLAGE_ID}` && m === "GET") return json(route, VORLAGE_DETAIL(global.__DETAIL_EXTRA || {}));
    if (/^vorlagen\/[^/]+\/arbeitskopie$/.test(r) || (/^vorlagen\/[^/]+$/.test(r) && m === "PUT")) return json(route, { ok: true });
    if (/^vorlagen\/[^/]+\/links$/.test(r) && m === "POST") return json(route, { id: "l9", url: "https://www.druck-s.de/personalisieren/k7Qm2xZ4pLw9", hinweis: null });
    if (r === "schriften") return json(route, { schriften: Object.entries(FONTS).map(([id, [schnitt, name]]) => ({ id, familie: "Open Sans", schnitt: schnitt.toLowerCase(), name, groesse: 130000, scanStatus: "CLEAN" })) });
    if ((t = r.match(/^schriften\/(f\d)\/datei$/))) return route.fulfill({ status: 200, contentType: "font/ttf", body: fs.readFileSync(path.join(FONT_DIR, FONTS[t[1]][1])) });
    if (r === "farben") return json(route, { farben: PF.farben.map((f, i) => ({ id: `c${i}`, ...f })) });
    if ((t = r.match(/^dateien\/([0-9a-f-]+)$/)) && DESIGNS[t[1]]) return route.fulfill({ status: 200, contentType: "application/pdf", body: fs.readFileSync(path.join(BEISPIELE, DESIGNS[t[1]])) });
    if (r === "dateien" && m === "POST") return json(route, { datei: { id: "d1000000-0000-4000-8000-000000000001", name: "visitenkarte-design.pdf", scanStatus: "CLEAN" }, pdf: { seiten: 2, seitenMasse: [{ breiteMm: 91, hoeheMm: 61, trim: { breiteMm: 85, hoeheMm: 55, beschnittMm: 3 } }, { breiteMm: 91, hoeheMm: 61 }] } });
    return json(route, { error: "nicht gemockt" }, 404);
  }
  // --- Personalisierung (Kunden)
  if ((t = p.match(/^\/api\/personalisierung\/z\/[^/]+(\/.*)?$/))) {
    const r = t[1] || "";
    if (r === "") return json(route, { ...ANSICHT, akteur: global.__AKTEUR || "gast" });
    if (r === "/entwuerfe" && m === "POST") return json(route, { id: "e1", token: "t1", expiresAt: new Date(Date.now() + 864e5).toISOString() }, 201);
    if (/^\/entwuerfe\/[^/]+$/.test(r)) return m === "GET" ? json(route, { datensaetze: [], expiresAt: new Date(Date.now() + 864e5).toISOString() }) : json(route, { expiresAt: new Date(Date.now() + 864e5).toISOString() });
    if (r === "/vorschau") {
      const w = (body().datensatz || {}).werte || {};
      const e = PF.pruefung[`${w.vorname ?? ""}|${w.nachname ?? ""}`] || PF.pruefung["|"];
      return route.fulfill({ status: 200, contentType: "application/pdf", body: fs.readFileSync(path.join(BEISPIELE, e.datei === "vorschau-5.pdf" ? "vorschau-beispiel.pdf" : e.datei)) });
    }
    if (r === "/pruefen") {
      const liste = [];
      (body().datensaetze || []).forEach((d, i) => {
        const e = PF.pruefung[`${d.werte.vorname ?? ""}|${d.werte.nachname ?? ""}`];
        for (const x of e ? e.meldungen : []) liste.push({ ...x, datensatz: i + 1, text: x.text.replace(/Datensatz 1/, `Datensatz ${i + 1}`) });
      });
      return json(route, { meldungen: liste });
    }
    if (r === "/tabelle") return json(route, TABELLE);
    if (r === "/absenden") return json(route, { modus: "code", anfrageId: "a1", sentTo: T.KUNDE.email });
    return json(route, { error: "nicht gemockt" }, 404);
  }
  // --- Kalkulation (Mitarbeiter)
  if ((t = p.match(/^\/api\/staff\/kalkulation(\/.*)$/))) {
    const r = t[1];
    if (r === "/v1/artikel") return json(route, KF.artikelListe);
    if (r === `/v1/artikel/${KF.erster.id}`) return json(route, KF.fragen);
    if (/^\/v1\/artikel\/[^/]+\/richtpreis$/.test(r)) return json(route, KF.richtpreis);
    if (r === "/einstellungen") return json(route, { einstellungen: KF.einstellungen });
    if (r === "/einstellungen/kunden") return json(route, KF.kunden);
    if (r === "/stand") return json(route, { bereiche: [["werkbank.material.v1", "Material und Preise", { materialien: 11, lieferanten: 1, preise: 6 }], ["werkbank.produktion.v1", "Produktion", { arbeitsschritte: 14, arbeitsplaetze: 6 }], ["werkbank.artikel.v1", "Artikel", { artikel: 3 }]].map(([schluessel, name, zaehlungen]) => ({ schluessel, name, version: 1, geaendertAm: vorbei(30), geaendertVon: "Vorstufe", zaehlungen })), dateien: { anzahl: 0, bytes: 0 } });
    if (/^\/anfragen\/[^/]+\/richtpreis$/.test(r)) return json(route, { richtpreise: [{ id: "q1", artikelId: KF.erster.id, artikelTitel: KF.erster.titel, auflagen: [500], ergebnis: { ...KF.richtpreis, quelle: "anfrage" }, preisEinstellungen: KF.einstellungen, createdAt: vorbei(2) }] });
    return json(route, { error: "nicht gemockt" }, 404);
  }
  // --- Richtpreis für Besucher
  if (p === "/api/v1/richtpreis/artikel") return json(route, KF.oeffentlicheArtikel);
  if (p === "/api/v1/richtpreis" && m === "POST") return json(route, KF.oeffentlicheAntwort);
  return null;
}

/** Alle API-Aufrufe mit Testdaten beantworten. */
async function api(context) {
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    let t;
    const neu = await apiNeu(route, p, m, req);
    if (neu !== null) return neu;
    if (/\/(files|bundles|invoice)(\/|$)/.test(p) && m === "GET") {
      const { datei, typ } = dateiFuer(p);
      return route.fulfill({ status: 200, contentType: typ, body: fs.readFileSync(path.join(DATEIEN, datei)) });
    }
    if (p === "/api/account") return json(route, { error: "not signed in" }, 401);
    if (p === "/api/requests" && m === "GET") return json(route, { requests: T.LISTE });
    if (p === "/api/requests/p1") return json(route, PERS_AUFTRAG);
    if ((t = p.match(/^\/api\/requests\/([^/]+)$/))) return T.DETAILS[t[1]] ? json(route, T.DETAILS[t[1]]) : json(route, { error: "nf" }, 404);
    if (p === "/api/drafts" && m === "POST") return json(route, { draftId: "d-test" }, 201);
    if (/^\/api\/drafts\/[^/]+\/files$/.test(p)) return json(route, { files: [] }, 201);
    if (/^\/api\/drafts\/[^/]+\/otp$/.test(p)) return json(route, { ok: true }, 201);
    if (/\/otp$/.test(p)) return json(route, { ok: true }, 201);
    if (p === "/api/staff/requests") return json(route, { requests: T.STAFF_LISTE });
    if (p === "/api/staff/identities") return json(route, { identities: T.IDENTITAETEN });
    if (p === "/api/staff/settings/assistant-prompt") return json(route, T.PROMPT);
    return json(route, { error: "nicht gemockt" }, 404);
  });
}

async function main() {
  const browser = await chromium.launch({ args: ["--lang=de-DE"], env: { ...process.env, LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8" } });
  await beispielDateien(browser);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1.5,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("dmp-druckraum-theme", "light");
      for (const id of ["upload", "auftrag", "staff", "personalisierung", "vorlage-design", "vorlage-felder", "vorlage-bogen", "vorlage-freigabe", "ausfuellen", "kalkulation", "kalkulation-preise", "kalkulation-stammdaten"]) localStorage.setItem(`tour:${id}:v1`, "done");
    } catch {}
  });
  await api(context);
  const page = await context.newPage();

  const oeffnen = async (pfad, warteAuf) => {
    await page.goto(`${BASIS}${pfad}${pfad.includes("?") ? "&" : "?"}tour=aus`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: OHNE_TOASTS });
    if (warteAuf) await page.getByText(warteAuf, { exact: false }).first().waitFor();
    await page.waitForTimeout(600);
  };
  const bild = async (name, ziel) => {
    await page.mouse.move(1279, 859);
    await page.waitForTimeout(200);
    const datei = path.join(ZIEL, `${name}.png`);
    if (!ziel) await page.screenshot({ path: datei });
    else if (typeof ziel === "string") await page.locator(ziel).first().screenshot({ path: datei });
    else await ziel.screenshot({ path: datei });
    console.log("✓", name);
  };
  /** Ausschnitt um ein Element, mit etwas Rand (für Detailbilder). */
  const ausschnitt = async (name, locator, rand = 16) => {
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const b = await locator.boundingBox();
    await page.screenshot({
      path: path.join(ZIEL, `${name}.png`),
      clip: { x: Math.max(0, b.x - rand), y: Math.max(0, b.y - rand), width: Math.min(1280, b.width + 2 * rand), height: b.height + 2 * rand },
    });
    console.log("✓", name);
  };
  const fold = (text) => page.locator(".fold").filter({ hasText: text }).first();


  /** Personalisierung, Kalkulation und Richtpreis (Mock-Daten aus beispiele/*.json). */
  async function neueBilder() {
    const ID = VORLAGE_ID;
    const hauptbild = (name) => bild(name, "main");
    const stille = async (ms = 2500) => page.waitForTimeout(ms);

    // ---------- Personalisierung: Mitarbeiter ----------
    await oeffnen("/staff/personalisierung", "Visitenkarte Außendienst");
    await stille(3500);
    await hauptbild("pers-uebersicht");

    await oeffnen("/staff/personalisierung/neu", "Name der Vorlage");
    await page.locator("#pers-name").fill("Visitenkarte Außendienst");
    await page.locator('input[type="file"]').first().setInputFiles(path.join(BEISPIELE, "visitenkarte-design.pdf"));
    await page.getByText("Endformat und Beschnitt").waitFor();
    await stille(2500);
    await hauptbild("pers-schritt-design");

    await oeffnen(`/staff/personalisierung/${ID}?schritt=2`, "Feld hinzufügen");
    await stille(4000);
    await page.locator('[data-feld="name"]').click();
    await stille(1500);
    await bild("pers-editor");
    await ausschnitt("pers-editor-eigenschaften", page.getByRole("complementary", { name: "Eigenschaften" }), 8);
    await page.keyboard.press("Escape");
    await page.mouse.click(1100, 120);
    await page.getByLabel("Mit Beispieldaten anzeigen").check();
    await stille(3500);
    await ausschnitt("pers-editor-beispiel", page.getByRole("region", { name: "Arbeitsfläche" }), 8);

    await oeffnen(`/staff/personalisierung/${ID}?schritt=3`, "Wie sollen die Druckdaten aussehen?");
    await page.getByLabel(/Ausgeschossen auf Druckbögen/).check();
    await stille(1200);
    await hauptbild("pers-schritt-bogen");

    await oeffnen(`/staff/personalisierung/${ID}?schritt=4`, "Wer darf die Vorlage nutzen?");
    await stille(1500);
    await hauptbild("pers-schritt-freigabe");
    await page.getByLabel(/Öffentlich per Link/).check();
    await stille(800);
    await page.getByRole("button", { name: "Link erzeugen und kopieren" }).click();
    await page.getByText("Ihr neuer Link").waitFor();
    await stille(600);
    await ausschnitt("pers-freigabe-link", page.locator('[data-tour="pers-links"]'), 12);

    await oeffnen("/staff/personalisierung/bibliothek", "Schriften");
    await stille(1500);
    await hauptbild("pers-bibliothek");

    await oeffnen("/staff/requests/p1", "Auftrag");
    await stille(1800);
    await page.screenshot({ path: path.join(ZIEL, "pers-auftrag.png"), clip: { x: 0, y: 0, width: 1280, height: 640 } });
    console.log("✓ pers-auftrag");
    await ausschnitt("kalk-auftrag-richtpreis", page.locator('[data-tour="staff-richtpreis"]'), 12);

    global.__AKTEUR = "mitarbeiter";
    await oeffnen(`/staff/personalisierung/${ID}/ausfuellen`, "Für welchen Kunden füllen Sie aus?");
    await stille(800);
    await ausschnitt("pers-fuer-kunden", page.locator('[data-tour="pers-kundenwahl"]'), 12);
    global.__AKTEUR = "gast";

    // ---------- Personalisierung: Kunden ----------
    await oeffnen(`/personalisieren/k7Qm2xZ4pLw9`, "Visitenkarte Außendienst");
    const eintrag = async (v, n, f, t, e) => {
      await page.getByLabel("Vorname", { exact: false }).first().fill(v);
      await page.getByLabel("Nachname", { exact: false }).first().fill(n);
      await page.getByLabel("Funktion", { exact: false }).first().fill(f);
      await page.getByLabel("Telefon", { exact: false }).first().fill(t);
      await page.getByLabel("E-Mail", { exact: false }).first().fill(e);
    };
    await eintrag("Anna", "Muster", "Leiterin Vertrieb", "07131 555-101", "anna.muster@example.org");
    await stille(3500);
    await hauptbild("pers-kunde-einzeln");

    await page.getByRole("tab", { name: "Tabelle hochladen" }).click();
    await stille(600);
    await ausschnitt("pers-kunde-tabelle-upload", page.locator('[data-tour="pers-tabelle-upload"]'), 12);
    await page.locator('input[type="file"]').first().setInputFiles(path.join(BEISPIELE, "visitenkarten-beispiel.csv"));
    await page.locator('[data-tour="pers-zuordnung"]').waitFor();
    await stille(800);
    await ausschnitt("pers-kunde-zuordnung", page.locator('[data-tour="pers-zuordnung"]'), 12);
    await page.getByRole("button", { name: "Zuordnung bestätigen und übernehmen" }).click();
    await stille(1200);
    await ausschnitt("pers-kunde-tabelle", page.locator('[data-tour="pers-tabelle"]'), 12);

    // Prüfen mit Hinweis und Fehler: drei Einträge von Hand
    await oeffnen(`/personalisieren/k7Qm2xZ4pLw9`, "Visitenkarte Außendienst");
    await eintrag("Anna", "Muster", "Leiterin Vertrieb", "07131 555-101", "anna.muster@example.org");
    await page.getByRole("button", { name: "+ Weitere hinzufügen" }).click();
    await page.getByRole("button", { name: "Eintrag 2 bearbeiten" }).click(); // im Dev-Modus wählt „Weitere hinzufügen“ den neuen Eintrag nicht sicher
    await eintrag("Marie-Luise", "Sonnenschein-Wolkenstein", "Stellv. Leiterin Kundenservice und Qualitätsmanagement", "07131 555-103", "marie-luise.sonnenschein-wolkenstein@example.org");
    await page.getByRole("button", { name: "+ Weitere hinzufügen" }).click();
    await page.getByRole("button", { name: "Eintrag 3 bearbeiten" }).click();
    await eintrag("Tim", "", "Auszubildender", "07131 555-104", "tim@example.org");
    await stille(1500);
    await page.getByRole("button", { name: "Weiter: Prüfen" }).click();
    await page.getByText("hat einen Fehler").waitFor({ timeout: 15000 });
    await stille(2500);
    await hauptbild("pers-kunde-pruefen");
    await page.getByRole("button", { name: "Zum Feld" }).first().click();
    await page.getByRole("button", { name: "Eintrag 3 bearbeiten" }).click();
    await page.getByLabel("Nachname", { exact: false }).first().fill("Test");
    await stille(1200);
    await page.getByRole("button", { name: "Weiter: Prüfen" }).click();
    await page.getByText(/Alles druckbar/).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Weiter: Absenden" }).click();
    await page.locator("#k-name").fill("Anna Muster");
    await page.locator("#k-mail").fill(T.KUNDE.email);
    await stille(500);
    await hauptbild("pers-kunde-absenden");
    await page.getByRole("button", { name: "Weiter zur Bestätigung" }).click();
    await page.locator("#code").fill("482913");
    await stille(800);
    await ausschnitt("pers-kunde-code", page.locator('[data-tour="pers-code"]'), 12);

    // ---------- Kalkulation ----------
    await oeffnen("/staff/kalkulation", "Was soll kalkuliert werden?");
    await page.locator("#kalk-artikel").selectOption(KF.erster.id);
    await page.getByText("Wie viele?").waitFor();
    await stille(800);
    await hauptbild("kalk-rechner");
    await page.getByRole("button", { name: "Richtpreis berechnen" }).click();
    await page.getByText("Ergebnis für").waitFor();
    await stille(800);
    await ausschnitt("kalk-ergebnis", page.locator('[data-tour="kalkulation-ergebnis"]'), 12);
    await page.getByText("Rechenweg anzeigen").click();
    await stille(600);
    await ausschnitt("kalk-rechenweg", page.locator('[data-tour="kalkulation-rechenweg"]'), 12);

    await oeffnen("/staff/kalkulation/stammdaten", "Stammdaten pflegen");
    await stille(800);
    await hauptbild("kalk-stammdaten");
    await oeffnen("/staff/kalkulation/einstellungen", "So wird aus den Kosten");
    await stille(800);
    await hauptbild("kalk-einstellungen");
    await ausschnitt("kalk-kunden-richtpreis", page.locator('[data-tour="kalkulation-kunden-richtpreis"]'), 12);

    // ---------- Richtpreis in der Anfrage ----------
    await oeffnen("/anfrage", "Anfrage");
    await page.getByRole("button", { name: "Ungefähren Preis anzeigen" }).waitFor();
    await ausschnitt("anfrage-richtpreis-zu", page.locator('[data-tour="anfrage-richtpreis"]'), 12);
    await page.getByRole("button", { name: "Ungefähren Preis anzeigen" }).click();
    await page.getByText("Stück:").first().waitFor({ timeout: 10000 });
    await stille(800);
    await ausschnitt("anfrage-richtpreis", page.locator('[data-tour="anfrage-richtpreis"]'), 12);
  }

  if (process.env.NUR === "neu") {
    await neueBilder();
    await browser.close();
    return;
  }

  // ---------- Kunden ----------
  await oeffnen("/", "Druckdaten hochladen.");
  await page.waitForTimeout(1500);
  await bild("kunde-start");

  await oeffnen("/login", "Code senden");
  await page.locator("#login-email").fill(T.KUNDE.email);
  await bild("kunde-anmelden", "main");

  await oeffnen("/upload", "Dateien hochladen");
  await page.locator('input[type="file"]').first().setInputFiles(
    ["flyer-vorderseite.pdf", "flyer-rueckseite.pdf", "logo-muster.png"].map((d) => path.join(DATEIEN, d)),
  );
  await page.waitForTimeout(1800);
  await bild("kunde-upload-dateien", "main");
  await page.locator('.fb-panel[data-zustand="offen"]').getByRole("button", { name: "Weiter" }).click();
  await page.locator("#freetext").fill(T.DETAILS.r1.request.freeText);
  await page.waitForTimeout(1200);
  await bild("kunde-upload-anfrage", "main");
  await page.locator('.fb-panel[data-zustand="offen"]').getByRole("button", { name: "Weiter" }).click();
  await page.waitForTimeout(900);
  await page.locator('.fb-panel[data-zustand="offen"]').getByRole("button", { name: "Weiter" }).click();
  await page.waitForTimeout(900);
  await page.locator("#ref").fill("wie Auftrag 140926-003");
  await page.getByRole("button", { name: "Anfrage senden" }).click();
  await page.locator("#email").fill(T.KUNDE.email);
  await page.getByRole("button", { name: "Code senden" }).click();
  await page.locator("#code").fill("482913");
  await page.waitForTimeout(500);
  await bild("kunde-upload-code", "main");

  await page.goto(`${BASIS}/upload?tour=aus`);
  await page.evaluate(() => sessionStorage.setItem("dam-neuer-auftrag", "r1"));
  await oeffnen("/requests/r1", "Auftrag eingegangen");
  await bild("kunde-auftrag-eingegangen", '[data-slot="dialog-content"]');

  await oeffnen("/requests/r2", "Auftrag 091126-004");
  await page.waitForTimeout(1500);
  await bild("kunde-auftrag-pruefung", "main");

  await oeffnen("/requests/r3", "Ihre Freigabe");
  await page.waitForTimeout(1500);
  await ausschnitt("kunde-auftrag-freigabe", fold("Ihre Freigabe"));

  await oeffnen("/requests/r4", "Versand");
  await page.waitForTimeout(1500);
  await ausschnitt("kunde-auftrag-versand", fold("Sendungsnummer"));

  await oeffnen("/requests", "Meine Aufträge");
  await bild("kunde-auftraege", "main");

  // ---------- Druckerei ----------
  await oeffnen("/staff/login", "Staff-Login");
  await bild("druckerei-login", "main");

  await oeffnen("/staff", "091126-004");
  await page.locator('[data-row="r2"]').click();
  await page.getByText("Automatischer Hinweis").first().waitFor();
  await page.waitForTimeout(1500);
  await bild("druckerei-auftraege");
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.waitForTimeout(2000);
  await bild("druckerei-assets");

  await oeffnen("/staff/requests/r2", "Auftrag");
  await page.waitForTimeout(1500);
  await ausschnitt("druckerei-auftrag-pruefung", fold("Prüfung"));
  await ausschnitt("druckerei-auftrag-freigabe", fold("Anhängen & zur Freigabe senden"));

  await oeffnen("/staff/requests/r5", "Versenden");
  await page.waitForTimeout(1500);
  await ausschnitt("druckerei-auftrag-versand", fold("Versand erfassen"));

  await oeffnen("/staff/customers", "Einmal-Upload-Link");
  await bild("druckerei-kunden", "main");

  await oeffnen("/staff/einstellungen", "Speichern");
  await bild("druckerei-einstellungen", "main");

  await neueBilder();

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
