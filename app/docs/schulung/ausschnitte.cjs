/**
 * Bildausschnitte für die PDF-Kurzanleitungen: PNG-Screenshots → docs/schulung/bilder/*.jpg (max. 1000 px breit).
 *
 *   node docs/schulung/ausschnitte.cjs /tmp/shots
 *
 * Eine Zeile je Bild: [Name, optionaler Zuschnitt { oben, hoehe } in Anteilen der Bildhöhe].
 */
const path = require("path");
const sharp = require("sharp");

const [quelle] = process.argv.slice(2);
const ziel = path.join(__dirname, "bilder");
const BILDER = [
  ["pers-schritt-design", { hoehe: 0.62 }],
  ["pers-editor", { hoehe: 0.55 }],
  ["pers-freigabe-link"],
  ["pers-kunde-einzeln", { hoehe: 0.7 }],
  ["pers-kunde-pruefen", { hoehe: 0.55 }],
  ["pers-kunde-code"],
  ["kalk-rechner", { hoehe: 0.8 }],
  ["kalk-ergebnis"],
  ["kalk-einstellungen", { hoehe: 0.6 }],
];

(async () => {
  for (const [name, z] of BILDER) {
    let bild = sharp(path.join(quelle, `${name}.png`));
    if (z) {
      const m = await bild.metadata();
      bild = bild.extract({ left: 0, top: Math.round(m.height * (z.oben ?? 0)), width: m.width, height: Math.round(m.height * z.hoehe) });
    }
    await bild.resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(ziel, `${name}.jpg`));
    console.log("✓", name);
  }
})();
