import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { requireCustomer } from "@/lib/guards";
import { getIdentity } from "@/lib/identities";
import { BaError, sendApprovalCode } from "@/lib/auth/otpFlow";
import { getRequest } from "@/lib/requests/store";

/** Approval step 1: fresh step-up code (live session required). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const request = await getRequest(id);
  if (!request || request.customerId !== guard.user.id) {
    return notFound("Request not found");
  }
  if (request.status !== "WAITING_APPROVAL") {
    return badRequest(`Cannot approve in status ${request.status}`);
  }
  const identity = await getIdentity(guard.user.id);
  if (!identity) return notFound("Request not found");
  try {
    await sendApprovalCode(identity.email);
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
