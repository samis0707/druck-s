import { llmsFullTxt } from "@/lib/hilfe/markdown";

/** /llms-full.txt — die komplette Hilfe als eine Markdown-Datei. */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
