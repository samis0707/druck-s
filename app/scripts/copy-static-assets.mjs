// Kopiert Dateien aus node_modules nach public/, passend zur installierten Version:
// - den pdf.js-Worker für die Upload-Vorschau,
// - die Swagger-Oberfläche für /api/docs (lokal ausgeliefert, nichts von fremden Servern).
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/swagger", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
  copyFileSync(`node_modules/swagger-ui-dist/${file}`, `public/swagger/${file}`);
}
