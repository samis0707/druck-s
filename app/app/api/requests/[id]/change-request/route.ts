import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { requireCustomer } from "@/lib/guards";
import { logChangeRequest } from "@/lib/approvalFlow";
import { getRequest } from "@/lib/requests/store";

/**
 * Customer change-request: logs intent, stays WAITING_APPROVAL,
 * returns a prefilled mailto payload for the firm inbox.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const request = await getRequest(id);
  if (!request || request.customerId !== guard.user.id) {
    return notFound("Request not found");
  }
  try {
    const mailto = await logChangeRequest({
      requestId: id,
      customerId: guard.user.id,
    });
    return NextResponse.json({ mailto }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /Cannot request changes/.test(err.message)) {
      return badRequest(err.message);
    }
    throw err;
  }
}
