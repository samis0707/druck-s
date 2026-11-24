import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/guards";
import { MITARBEITER_TOUR_IDS, type MitarbeiterTourId } from "@/components/tour/touren";
import { TOUREN_MITARBEITER } from "@/components/tour/touren-mitarbeiter";

/**
 * Tour-Texte des Mitarbeiter-Kurses — nur mit Staff-Sitzung. Sie stehen absichtlich nicht im Browser-Bundle
 * (öffentlich abrufbar), sondern werden von PageTour hier geladen.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/staff/hilfe/tour/[id]">) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  if (!(MITARBEITER_TOUR_IDS as readonly string[]).includes(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(TOUREN_MITARBEITER[id as MitarbeiterTourId], { headers: { "cache-control": "private, no-store" } });
}
