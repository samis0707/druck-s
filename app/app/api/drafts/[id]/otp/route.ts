import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { getRequest, listFiles } from "@/lib/requests/store";
import { checkCustomerEligible, BindError } from "@/lib/intake";
import { BaError, sendSignInCode } from "@/lib/auth/otpFlow";
import { appendAudit } from "@/lib/auditLog";
import { clientIp } from "@/lib/guards";

/** Door A Send step 1: sign-in code for the onboarded email. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = await getRequest(id);
  if (!draft) return notFound("Draft not found");
  if (draft.status !== "DRAFT") return badRequest("This request was already sent");
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return badRequest("email is required");
  try {
    const identity = await checkCustomerEligible(email);
    const files = await listFiles(id);
    if (files.length === 0) return badRequest("Upload at least one file first");
    await sendSignInCode(identity.email);
    await appendAudit({
      action: "otp_issued",
      actorType: "customer",
      actorId: identity.id,
      requestId: id,
      ip: clientIp(req),
      detail: { purpose: "send_verify" },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof BindError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    if (err instanceof BaError) {
      const status = err.status === 429 ? 429 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
