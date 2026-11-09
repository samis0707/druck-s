/**
 * HTML-Kurzanleitungen → A4-PDF (Chromium über Playwright) + Vorschau-PNG + Überlauf-Prüfung.
 *
 *   node docs/schulung/render.cjs
 *
 * Quelle: docs/schulung/<name>.html (je Seite <div class="page">…<footer class="bottom">…</footer></div>)
 * Ziel:   public/hilfe/<pdf-name>.pdf, Vorschau docs/schulung/preview-<name>.png (nicht im Repo).
 * Meldet je Seite „Inhalt … / Fußzeile …“: Inhalt muss über der Fußzeile enden, sonst Exit 2.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DIR = __dirname;
const OUT = path.resolve(DIR, "../../public/hilfe");
const ANLEITUNGEN = {
  kunden: "dmp-druckraum-kurzanleitung-kunden.pdf",
  druckerei: "dmp-druckraum-kurzanleitung-druckerei.pdf",
  partner: "dmp-druckraum-kurzreferenz-partner-api.pdf",
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 })).newPage();
  let fehler = false;
  for (const [name, pdf] of Object.entries(ANLEITUNGEN)) {
    await p.goto("file://" + path.join(DIR, `${name}.html`), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const seiten = await p.$$eval(".page", (ps) =>
      ps.map((x) => {
        const top = x.getBoundingClientRect().top;
        const kids = [...x.children].filter((c) => c.tagName !== "FOOTER");
        const inhalt = Math.max(...kids.map((c) => c.getBoundingClientRect().bottom)) - top;
        const fuss = x.querySelector("footer")?.getBoundingClientRect().top - top;
        return { inhalt: Math.round(inhalt), fuss: Math.round(fuss ?? x.getBoundingClientRect().height) };
      }),
    );
    seiten.forEach((s, i) => {
      const ok = s.inhalt < s.fuss;
      if (!ok) fehler = true;
      console.log(`${name} Seite ${i + 1}: Inhalt bis ${s.inhalt}px, Fußzeile ab ${s.fuss}px ${ok ? "ok" : "← ÜBERLAUF"}`);
    });
    await p.pdf({ path: path.join(OUT, pdf), preferCSSPageSize: true, printBackground: true });
    await p.emulateMedia({ media: "print" });
    await p.screenshot({ path: path.join(DIR, `preview-${name}.png`), fullPage: true });
    await p.emulateMedia({ media: "screen" });
  }
  await b.close();
  process.exit(fehler ? 2 : 0);
})();
