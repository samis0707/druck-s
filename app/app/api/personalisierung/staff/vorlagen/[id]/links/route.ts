import { istObjekt, alsStaff, leseJson, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { config } from "@/lib/config";
import { erstelleLink, holeVorlage, listeLinks } from "@/lib/personalisierung/repo";
import { appendAudit } from "@/lib/auditLog";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return alsStaff(req, "Links lesen", async () => persJson({ links: await listeLinks((await ctx.params).id) }));
}

/** Zugriffs-Link erzeugen: { label?, ablaufTage? }. Die URL erscheint nur in dieser Antwort. */
export async function POST(req: Request, ctx: Ctx) {
  return alsStaff(req, "Link erzeugen", async (user, ip) => {
    const { id } = await ctx.params;
    const body = await leseJson(req, 16 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const d = await holeVorlage(id);
    if (!d) throw new PersFehler("Vorlage nicht gefunden.", 404, "nicht_gefunden");
    const tage = body.ablaufTage === undefined || body.ablaufTage === null ? null : Number(body.ablaufTage);
    if (tage !== null && (!Number.isInteger(tage) || tage < 1 || tage > 3650)) throw new PersFehler("ablaufTage muss eine ganze Zahl von 1 bis 3650 sein.");
    const { link, token } = await erstelleLink(id, { label: typeof body.label === "string" ? body.label : "", ablaufTage: tage, userId: user.id });
    await appendAudit({ action: "pers_link_created", actorType: "staff", actorId: user.id, ip, detail: { templateId: id, linkId: link.id } });
    return persJson({ link, url: `${config.appBaseUrl}/personalisieren/${token}`, hinweis: d.sichtbarkeit === "oeffentlich" && d.status === "aktiv" ? null : "Der Link funktioniert erst, wenn die Vorlage aktiv und „öffentlich per Link“ ist." }, 201);
  });
}
