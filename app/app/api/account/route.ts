import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/guards";
import { getIdentity } from "@/lib/identities";

/** Eigene Identität des angemeldeten Kunden (Konto-Seite). */
export async function GET(req: Request) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const identity = await getIdentity(guard.user.id);
  if (!identity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    identity: {
      email: identity.email,
      displayName: identity.displayName,
      firm: identity.firm,
      status: identity.status,
    },
  });
}
