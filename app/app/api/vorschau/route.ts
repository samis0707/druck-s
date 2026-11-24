import { NextResponse } from "next/server";
import { vorschauAktiv } from "@/lib/vorschau/modus";

/**
 * Ist dies die Vorschau-Umgebung (PREVIEW_MODE=1)? Die Seiten sind statisch gebaut, deshalb fragt das Banner
 * den Zustand zur Laufzeit ab, statt ihn beim Build einzubacken. Gibt nur den Schalter preis.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ vorschau: vorschauAktiv() }, { headers: { "cache-control": "no-store" } });
}
