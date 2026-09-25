import { NextResponse } from "next/server";
import { notFound } from "@/lib/api";
import { clientIp, requireStaff } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { query } from "@/lib/db";
import { revokeLink } from "@/lib/links";

/** Staff revokes an upload link so it can never be used. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const existing = await query("SELECT id FROM upload_links WHERE id = $1", [id]);
  if (existing.rowCount === 0) return notFound("Link not found");
  await revokeLink(id);
  await appendAudit({
    action: "link_revoked",
    actorType: "staff",
    actorId: guard.user.id,
    ip: clientIp(req),
    detail: { linkId: id },
  });
  return NextResponse.json({ ok: true });
}
