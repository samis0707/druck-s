import { readFile } from "node:fs/promises";
import path from "node:path";
import { istMitarbeiterSitzung } from "@/lib/hilfe/zugriff-server";
import { internesZiel } from "@/lib/hilfe/intern";

/**
 * Nicht öffentliche Hilfe-Dateien des Mitarbeiter-Kurses: PDF-Kurzanleitungen (/hilfe-intern/<name>.pdf) und
 * Screenshots (/hilfe-intern/img/<name>.webp). Die Dateien liegen NICHT in public/, sondern in hilfe-intern/
 * (im Standalone-Build per outputFileTracingIncludes in next.config.ts enthalten) und werden nur mit gültiger
 * Staff-Sitzung ausgeliefert. Ohne Berechtigung: 404 — wie bei einer nicht vorhandenen Datei.
 * Erlaubt sind ausschließlich die Dateien aus lib/hilfe/intern.json (lib/hilfe/intern.ts) (kein Pfad-Durchgriff aufs Dateisystem).
 */
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "hilfe-intern");

function nichtGefunden() {
  return new Response("Nicht gefunden\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(req: Request, ctx: RouteContext<"/hilfe-intern/[...datei]">) {
  const teile = (await ctx.params).datei;
  const ziel = internesZiel(teile);
  if (!ziel) return nichtGefunden();
  if (!(await istMitarbeiterSitzung(req.headers))) return nichtGefunden();
  try {
    const inhalt = await readFile(path.join(ROOT, ziel.rel));
    return new Response(new Uint8Array(inhalt), {
      headers: {
        "content-type": ziel.typ,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex, nofollow",
        vary: "Cookie",
      },
    });
  } catch {
    return nichtGefunden();
  }
}
