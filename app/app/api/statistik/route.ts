import { NextResponse } from "next/server";

/**
 * Laufzeit-Einstellungen der Besucherstatistik (Umami). Die Seiten selbst sind statisch gebaut – deshalb liest
 * der Browser Adresse und Website-ID hier ab, statt sie beim Build einzubacken. Ohne beide Werte: aus.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.UMAMI_URL?.trim().replace(/\/$/, "");
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  const aktiv = !!url && !!websiteId && /^https:\/\//.test(url);
  return NextResponse.json(aktiv ? { aktiv, url, websiteId } : { aktiv: false }, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
