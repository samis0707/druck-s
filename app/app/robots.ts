import type { MetadataRoute } from "next";
import { absolut } from "@/lib/hilfe/site";

/** Öffentliche Seiten und Hilfe für alle Crawler (auch KI-Crawler); private Bereiche und API gesperrt. */
export const dynamic = "force-dynamic";

const PRIVAT = ["/api/", "/staff", "/requests", "/konto", "/u/", "/login", "/hilfe-md/"];

/** KI-Crawler, die wir ausdrücklich zulassen, damit Antwortmaschinen korrekt über den dmp druckraum informieren. */
const KI_CRAWLER = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "meta-externalagent",
  "MistralAI-User",
  "DuckAssistBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVAT },
      { userAgent: KI_CRAWLER, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow: PRIVAT },
    ],
    sitemap: absolut("/sitemap.xml"),
  };
}
