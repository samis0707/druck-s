import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/api";
import { clientIp } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { findStaffByEmail } from "@/lib/identities";
import { BaError, signInWithCode, signOut } from "@/lib/auth/otpFlow";

/** Staff login step 2. */
export async function POST(req: Request) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !body.code) return badRequest("email and code are required");
  const staff = await findStaffByEmail(email);
  if (!staff || staff.status === "disabled") return unauthorized("Invalid credentials");
  let signedIn;
  try {
    signedIn = await signInWithCode({ email: staff.email, otp: body.code, headers: req.headers });
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (signedIn.userId !== staff.id) return unauthorized("Invalid credentials");
  await appendAudit({
    action: "otp_verified",
    actorType: "staff",
    actorId: staff.id,
    ip: clientIp(req),
    detail: { purpose: "login" },
  });
  const response = NextResponse.json({ ok: true });
  for (const cookie of signedIn.setCookies) response.headers.append("set-cookie", cookie);
  return response;
}

/** Staff logout: revoke session behind the cookie. */
export async function DELETE(req: Request) {
  await signOut(req.headers).catch(() => {});
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("better-auth.session_token");
  return response;
}
