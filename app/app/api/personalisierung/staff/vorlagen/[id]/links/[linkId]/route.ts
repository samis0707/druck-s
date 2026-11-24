import { alsStaff, persError, persJson } from "@/lib/personalisierung/http";
import { config } from "@/lib/config";
import { holeLinkToken, widerrufeLink } from "@/lib/personalisierung/repo";
import { appendAudit } from "@/lib/auditLog";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  return alsStaff(req, "Link widerrufen", async (user, ip) => {
    const { id, linkId } = await ctx.params;
    if (!(await widerrufeLink(linkId, id))) return persError(404, "nicht_gefunden", "Link nicht gefunden.");
    await appendAudit({ action: "pers_link_revoked", actorType: "staff", actorId: user.id, ip, detail: { templateId: id, linkId } });
    return persJson({ ok: true });
  });
}

/** Adresse eines aktiven Links erneut liefern (Token verschlüsselt gespeichert). Ältere Links: 404 mit Code "nicht_anzeigbar". */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  return alsStaff(req, "Link lesen", async () => {
    const { id, linkId } = await ctx.params;
    const token = await holeLinkToken(linkId, id);
    if (!token) return persError(404, "nicht_anzeigbar", "Dieser Link kann nicht erneut angezeigt werden. Bitte einen neuen Link erzeugen.");
    return persJson({ url: `${config.appBaseUrl}/personalisieren/${token}` });
  });
}
