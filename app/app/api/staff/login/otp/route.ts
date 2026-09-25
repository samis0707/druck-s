import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/api";
import { findStaffByEmail } from "@/lib/identities";
import { BaError, sendSignInCode } from "@/lib/auth/otpFlow";

/** Staff login step 1. Generic errors to avoid enumeration. */
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return badRequest("email is required");
  const staff = await findStaffByEmail(email);
  if (!staff || staff.status === "disabled") return unauthorized("Invalid credentials");
  try {
    await sendSignInCode(staff.email);
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
