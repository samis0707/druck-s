import intern from "./intern.json";

const PDFS = new Set<string>(intern.pdfs);
const BILDER = new Set<string>(intern.bilder);

/**
 * Löst einen Pfad unterhalb von /hilfe-intern/ auf eine freigegebene Datei auf (relativ zu hilfe-intern/) samt Content-Type.
 * Nur Dateien aus lib/hilfe/intern.json sind erlaubt — alles andere (auch „..“, Unterordner, andere Endungen) → null.
 */
export function internesZiel(teile: string[]): { rel: string; typ: string } | null {
  if (teile.length === 1 && PDFS.has(teile[0])) return { rel: `pdf/${teile[0]}`, typ: "application/pdf" };
  if (teile.length === 2 && teile[0] === "img" && teile[1].endsWith(".webp") && BILDER.has(teile[1].slice(0, -5))) {
    return { rel: `img/${teile[1]}`, typ: "image/webp" };
  }
  return null;
}
