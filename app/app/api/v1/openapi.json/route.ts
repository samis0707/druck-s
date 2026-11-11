import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/** OpenAPI-Beschreibung der öffentlichen Schnittstellen (Oberfläche: /api/docs). */
export function GET() {
  return NextResponse.json(openApiDocument(), { headers: { "cache-control": "public, max-age=300" } });
}
