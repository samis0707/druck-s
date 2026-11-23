import { alsStaff, persError, persJson } from "@/lib/personalisierung/http";
import { widerrufeLink } from "@/lib/personalisierung/repo";
import { appendAudit } from "@/lib/auditLog";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  return alsStaff(req, "Link widerrufen", async (user, ip) => {
    const { id, linkId } = await ctx.params;
    if (!(await widerrufeLink(linkId))) return persError(404, "nicht_gefunden", "Link nicht gefunden.");
    await appendAudit({ action: "pers_link_revoked", actorType: "staff", actorId: user.id, ip, detail: { templateId: id, linkId } });
    return persJson({ ok: true });
  });
}
