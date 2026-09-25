import { NextResponse } from "next/server";
import { badRequest, forbidden } from "@/lib/api";
import { findIdentityByEmail } from "@/lib/identities";
import { BaError, sendSignInCode } from "@/lib/auth/otpFlow";
import { appendAudit } from "@/lib/auditLog";
import { clientIp } from "@/lib/guards";

/** Customer portal login step 1. */
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return badRequest("email is required");
  const identity = await findIdentityByEmail(email);
  if (!identity || identity.status !== "customer") {
    return forbidden("This email is not registered. Please contact the print firm to get access.");
  }
  try {
    await sendSignInCode(identity.email);
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  await appendAudit({
    action: "otp_issued",
    actorType: "customer",
    actorId: identity.id,
    ip: clientIp(req),
    detail: { purpose: "login" },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
