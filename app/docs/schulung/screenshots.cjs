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

/** Alle API-Aufrufe mit Testdaten beantworten. */
async function api(context) {
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    let t;
    if (/\/(files|bundles|invoice)(\/|$)/.test(p) && m === "GET") {
      const { datei, typ } = dateiFuer(p);
      return route.fulfill({ status: 200, contentType: typ, body: fs.readFileSync(path.join(DATEIEN, datei)) });
    }
    if (p === "/api/account") return json(route, { error: "not signed in" }, 401);
    if (p === "/api/requests" && m === "GET") return json(route, { requests: T.LISTE });
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
      for (const id of ["upload", "auftrag", "staff"]) localStorage.setItem(`tour:${id}:v1`, "done");
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

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
