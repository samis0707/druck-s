/**
 * PNG-Screenshots → WebP für die Online-Hilfe (max. 1600 px breit, Qualität 80)
 * und Maß-Tabelle lib/hilfe/bilder.ts (für width/height an next/image).
 *
 *   node docs/schulung/zu-webp.cjs /tmp/shots
 *
 * Ziel: öffentliche Bilder → public/hilfe/img, Bilder des Mitarbeiter-Kurses → hilfe-intern/img (Liste: lib/hilfe/intern.json,
 * Auslieferung nur mit Staff-Sitzung). Neue Staff-Bilder: Namen vorher in intern.json unter "bilder" eintragen.
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const [quelle] = process.argv.slice(2);
const APP = path.resolve(__dirname, "../..");
const zielOeffentlich = path.join(APP, "public/hilfe/img");
const zielIntern = path.join(APP, "hilfe-intern/img");
const INTERN = new Set(require("../../lib/hilfe/intern.json").bilder);
fs.mkdirSync(zielOeffentlich, { recursive: true });
fs.mkdirSync(zielIntern, { recursive: true });

(async () => {
  // Bereits vorhandene Einträge bleiben erhalten, damit auch ein Teillauf (nur neue Bilder) die Tabelle nicht verkürzt.
  const masse = {};
  try {
    const alt = fs.readFileSync(path.join(APP, "lib/hilfe/bilder.ts"), "utf8");
    for (const m of alt.matchAll(/"([^"]+)": \{ breite: (\d+), hoehe: (\d+) \}/g)) masse[m[1]] = { breite: +m[2], hoehe: +m[3] };
  } catch {}
  for (const f of fs.readdirSync(quelle).filter((x) => x.endsWith(".png")).sort()) {
    const name = f.replace(/\.png$/, "");
    const info = await sharp(path.join(quelle, f))
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(INTERN.has(name) ? zielIntern : zielOeffentlich, `${name}.webp`));
    masse[name] = { breite: info.width, hoehe: info.height };
    console.log(`${name}.webp ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
  const zeilen = Object.entries(masse).sort(([a], [b]) => a.localeCompare(b)).map(([n, m]) => `  "${n}": { breite: ${m.breite}, hoehe: ${m.hoehe} },`);
  fs.writeFileSync(
    path.join(APP, "lib/hilfe/bilder.ts"),
    `/**
 * Maße der Schulungsbilder in public/hilfe/img/*.webp (öffentlich) und hilfe-intern/img/*.webp (Mitarbeiter-Kurs).
 * ERZEUGT von docs/schulung/zu-webp.cjs — nicht von Hand ändern.
 */
export const BILDER: Record<string, { breite: number; hoehe: number }> = {
${zeilen.join("\n")}
};
`,
  );
})();
