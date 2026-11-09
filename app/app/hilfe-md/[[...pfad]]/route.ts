import { hilfeStartMarkdown, kursMarkdown, lektionMarkdown } from "@/lib/hilfe/markdown";
import { kursFuer, lektionFuer } from "@/lib/hilfe/inhalte";

/**
 * Markdown-Fassung jeder Hilfeseite. Erreichbar als /hilfe.md, /hilfe/<kurs>.md, /hilfe/<kurs>/<lektion>.md
 * (Rewrites in next.config.ts) — für KI-Assistenten und Agenten, die Seiten als Text lesen.
 */
export const dynamic = "force-dynamic";

function markdown(text: string) {
  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}

export async function GET(_req: Request, ctx: RouteContext<"/hilfe-md/[[...pfad]]">) {
  const pfad = (await ctx.params).pfad ?? [];
  if (pfad.length === 0) return markdown(hilfeStartMarkdown());
  if (pfad.length === 1) {
    const kurs = kursFuer(pfad[0]);
    if (kurs) return markdown(kursMarkdown(kurs));
  }
  if (pfad.length === 2) {
    const treffer = lektionFuer(pfad[0], pfad[1]);
    if (treffer) return markdown(lektionMarkdown(treffer.kurs, treffer.lektion));
  }
  return new Response("Nicht gefunden\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}
