import { llmsTxt } from "@/lib/hilfe/markdown";

/** /llms.txt — Einstieg für KI-Assistenten (https://llmstxt.org). */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
