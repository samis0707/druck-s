import { NextResponse } from "next/server";
import { getSessionUser, isStaff } from "@/lib/auth/session";
import { vorschauAktiv } from "@/lib/vorschau/modus";

/** Ist dies die Vorschau und der Aufrufer angemeldete Mitarbeit? (Banner-Link „Testleitfaden“.) Gibt nur einen Schalter preis. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let staff = false;
  if (vorschauAktiv()) {
    try {
      const user = await getSessionUser(req.headers);
      staff = user !== null && isStaff(user);
    } catch {
      staff = false;
    }
  }
  return NextResponse.json({ staff }, { headers: { "cache-control": "no-store" } });
}
