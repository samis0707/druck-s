// Kopiert den pdf.js-Worker nach public/, damit die Upload-Vorschau ihn passend zur installierten Version lädt.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
