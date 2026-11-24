import { staffKalkulation } from "@/lib/kalkulation/staffApi";

/** Mitarbeiter-Schnittstelle der Kalkulation (nur Staff-Sitzung), siehe lib/kalkulation/staffApi.ts. */
type Ctx = { params: Promise<{ pfad: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { pfad } = await ctx.params;
  let teile: string[];
  try {
    teile = pfad.map((t) => decodeURIComponent(t));
  } catch {
    return Response.json({ fehler: "Ungültige Adresse" }, { status: 400 });
  }
  return staffKalkulation(req, teile);
}

export const GET = handle;
export const PUT = handle;
export const POST = handle;
