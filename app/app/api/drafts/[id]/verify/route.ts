import { NextResponse } from "next/server";
import { badRequest, forbidden } from "@/lib/api";
import { clientIp } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { findIdentityByEmail } from "@/lib/identities";
import { bindDraftToCustomer, BindError } from "@/lib/intake";
import { BaError, signInWithCode } from "@/lib/auth/otpFlow";
import { analyzeRequest } from "@/lib/analyze/run";
import { generateNote } from "@/lib/assistantNote";

/** Door A Send step 2: code signs in (session cookie) and binds the draft. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
  try {
    const request = await bindDraftToCustomer({ draftId: id, email });
    await appendAudit({
      action: "otp_verified",
      actorType: "customer",
      actorId: identity.id,
      requestId: id,
      ip: clientIp(req),
      detail: { purpose: "send_verify" },
    });
    const response = NextResponse.json({
      request: { id: request.id, status: request.status, trust: request.trust },
    });
    for (const cookie of signedIn.setCookies) response.headers.append("set-cookie", cookie);
    // Deep analysis and the assistant note run after Send so the intake
    // response stays fast; failures never block intake (Door-B-Parität).
    // Die Note läuft auch bei Analysefehlern (arbeitet mit leeren Befunden).
    analyzeRequest(request.id)
      .catch((err) => console.error("analysis failed", err))
      .finally(() => generateNote(request.id).catch((err) => console.error("note failed", err)));
    return response;
  } catch (err) {
    if (err instanceof BindError) return forbidden(err.message);
    if (err instanceof Error && err.name === "TransitionError") {
      return badRequest("This request was already sent");
    }
    throw err;
  }
}
