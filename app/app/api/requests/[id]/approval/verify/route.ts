import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { clientIp, requireCustomer } from "@/lib/guards";
import { approveRequest } from "@/lib/approvalFlow";
import { getRequest } from "@/lib/requests/store";
import { BaError, consumeApprovalCode } from "@/lib/auth/otpFlow";

/** Approval step 2: live session plus fresh consuming code moves to IN_PROGRESS. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const request = await getRequest(id);
  if (!request || request.customerId !== guard.user.id) {
    return notFound("Request not found");
  }
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.code) return badRequest("code is required");
  try {
    await consumeApprovalCode({ email: guard.user.email, otp: body.code });
  } catch (err) {
    if (err instanceof BaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  try {
    const result = await approveRequest({
      requestId: id,
      customerId: guard.user.id,
      ip: clientIp(req),
    });
    return NextResponse.json({ approved: true, version: result.version });
  } catch (err) {
    if (err instanceof Error && /Cannot approve|Not your request/.test(err.message)) {
      return badRequest(err.message);
    }
    throw err;
  }
}
