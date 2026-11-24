import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { vorschauAktiv } from "@/lib/vorschau/modus";

/**
 * Vorschau-Umgebung (PREVIEW_MODE=1): alle Antworten bekommen `X-Robots-Tag: noindex, nofollow`. Der Schalter wird
 * zur Laufzeit gelesen (die Seiten selbst sind statisch gebaut). Ohne PREVIEW_MODE ändert diese Datei nichts.
 */
export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  if (vorschauAktiv()) res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export const config = {
  // Alles außer statischen Build-Dateien und Bildoptimierung.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
