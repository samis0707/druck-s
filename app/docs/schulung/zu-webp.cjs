/**
 * PNG-Screenshots → WebP für die Online-Hilfe (max. 1600 px breit, Qualität 80)
 * und Maß-Tabelle lib/hilfe/bilder.ts (für width/height an next/image).
 *
 *   node docs/schulung/zu-webp.cjs /tmp/shots
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const [quelle] = process.argv.slice(2);
const APP = path.resolve(__dirname, "../..");
const ziel = path.join(APP, "public/hilfe/img");
fs.mkdirSync(ziel, { recursive: true });

(async () => {
  const masse = {};
  for (const f of fs.readdirSync(quelle).filter((x) => x.endsWith(".png")).sort()) {
    const name = f.replace(/\.png$/, "");
    const info = await sharp(path.join(quelle, f))
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(ziel, `${name}.webp`));
    masse[name] = { breite: info.width, hoehe: info.height };
    console.log(`${name}.webp ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
  const zeilen = Object.entries(masse).map(([n, m]) => `  "${n}": { breite: ${m.breite}, hoehe: ${m.hoehe} },`);
  fs.writeFileSync(
    path.join(APP, "lib/hilfe/bilder.ts"),
    `/**
 * Maße der Schulungsbilder in public/hilfe/img/*.webp.
 * ERZEUGT von docs/schulung/zu-webp.cjs — nicht von Hand ändern.
 */
export const BILDER: Record<string, { breite: number; hoehe: number }> = {
${zeilen.join("\n")}
};
`,
  );
})();
