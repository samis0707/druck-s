import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { clientIp, requireStaff } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { query } from "@/lib/db";
import { disableIdentity, getIdentity, matureToCustomer } from "@/lib/identities";

/** Staff matures a prospect to a customer; requests and history follow the record. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const identity = await getIdentity(id);
  if (!identity) return notFound("Identity not found");
  if (identity.status !== "prospect") return badRequest("Only prospects can mature");
  const matured = await matureToCustomer(id);
  // Vouched requests filed under this email now belong to the customer record.
  await query(
    "UPDATE requests SET customer_id = $1 WHERE prospect_email = $2 AND customer_id IS NULL",
    [id, matured.email],
  );
  await appendAudit({
    action: "identity_matured",
    actorType: "staff",
    actorId: guard.user.id,
    ip: clientIp(req),
    detail: { identityId: id, email: matured.email },
  });
  return NextResponse.json({ ok: true, status: matured.status });
}

/** Staff disables an identity; live session checks enforce it immediately. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const identity = await getIdentity(id);
  if (!identity) return notFound("Identity not found");
  await disableIdentity(id);
  await appendAudit({
    action: "identity_disabled",
    actorType: "staff",
    actorId: guard.user.id,
    ip: clientIp(req),
    detail: { identityId: id, email: identity.email },
  });
  return NextResponse.json({ ok: true });
}
