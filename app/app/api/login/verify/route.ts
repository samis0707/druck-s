import { NextResponse } from "next/server";
import { badRequest, forbidden } from "@/lib/api";
import { clientIp } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { findIdentityByEmail } from "@/lib/identities";
import { BaError, signInWithCode } from "@/lib/auth/otpFlow";

/** Customer portal login step 2. */
export async function POST(req: Request) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !body.code) return badRequest("email and code are required");
  const identity = await findIdentityByEmail(email);
  if (!identity || identity.status !== "customer") {
    return forbidden("This email is not registered. Please contact the print firm to get access.");
  }
  let signedIn;
  try {
    signedIn = await signInWithCode({ email: identity.email, otp: body.code, headers: req.headers });
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (signedIn.userId !== identity.id) return badRequest("This code belongs to a different email");
  await appendAudit({
    action: "otp_verified",
    actorType: "customer",
    actorId: identity.id,
    ip: clientIp(req),
    detail: { purpose: "login" },
  });
  const response = NextResponse.json({ ok: true });
  for (const cookie of signedIn.setCookies) response.headers.append("set-cookie", cookie);
  return response;
}
