import { hilfeStartMarkdown, kursMarkdown, lektionMarkdown } from "@/lib/hilfe/markdown";
import { kursFuer, lektionFuer } from "@/lib/hilfe/kurse";
import { istMitarbeiterKurs } from "@/lib/hilfe/zugriff";
import { istMitarbeiterSitzung } from "@/lib/hilfe/zugriff-server";

/**
 * Markdown-Fassung jeder Hilfeseite. Erreichbar als /hilfe.md, /hilfe/<kurs>.md, /hilfe/<kurs>/<lektion>.md
 * (Rewrites in next.config.ts) — für KI-Assistenten und Agenten, die Seiten als Text lesen.
 *
 * Öffentliche Kurse: für alle, öffentlich cachebar. Mitarbeiter-Kurs: nur mit Staff-Sitzung (privat, nicht cachebar);
 * ohne Berechtigung antwortet die Route mit 404 — identisch zu einer nicht vorhandenen Seite, damit weder Inhalt
 * noch Existenz einzelner Lektionen verraten wird. /hilfe.md enthält nur öffentliche Kurse.
 */
export const dynamic = "force-dynamic";

function markdown(text: string, privat: boolean) {
  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": privat ? "private, no-store" : "public, max-age=3600",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
      ...(privat ? { vary: "Cookie" } : {}),
    },
  });
}

function nichtGefunden() {
  return new Response("Nicht gefunden\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request, ctx: RouteContext<"/hilfe-md/[[...pfad]]">) {
  const pfad = (await ctx.params).pfad ?? [];
  if (pfad.length === 0) return markdown(hilfeStartMarkdown(), false);
  if (pfad.length > 2) return nichtGefunden();

  // Zielgruppe nur vom Kurs-Slug abhängig machen (nicht davon, ob die Lektion existiert).
  const mitarbeiterKurs = istMitarbeiterKurs(pfad[0]);
  const mitarbeiter = mitarbeiterKurs ? await istMitarbeiterSitzung(req.headers) : false;
  if (mitarbeiterKurs && !mitarbeiter) return nichtGefunden();

  if (pfad.length === 1) {
    const kurs = kursFuer(pfad[0], mitarbeiter);
    if (kurs) return markdown(kursMarkdown(kurs), mitarbeiterKurs);
  } else {
    const treffer = lektionFuer(pfad[0], pfad[1], mitarbeiter);
    if (treffer) return markdown(lektionMarkdown(treffer.kurs, treffer.lektion), mitarbeiterKurs);
  }
  return nichtGefunden();
}
