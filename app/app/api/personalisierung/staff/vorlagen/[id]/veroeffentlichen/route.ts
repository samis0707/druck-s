import { appendAudit } from "@/lib/auditLog";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { alsStaff, istObjekt, leseJson, persError, persJson } from "@/lib/personalisierung/http";
import { veroeffentlicheVorlage } from "@/lib/personalisierung/repo";
import { SICHTBARKEIT, type Sichtbarkeit } from "@/lib/personalisierung/schema";

/**
 * Veröffentlichen: { sichtbarkeit? }. Prüft die Arbeitskopie streng (Schema, Aktivierung, Virenscan),
 * setzt die Vorlage aktiv und legt bei aktiven Vorlagen eine neue unveränderliche Version an.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return alsStaff(req, "Vorlage veröffentlichen", async (user, ip) => {
    const body = await leseJson(req, 16 * 1024);
    const s = istObjekt(body) ? body.sichtbarkeit : undefined;
    if (s !== undefined && !SICHTBARKEIT.includes(s as Sichtbarkeit)) throw new PersFehler("Ungültige Sichtbarkeit.");
    const { id } = await ctx.params;
    const d = await veroeffentlicheVorlage(id, { sichtbarkeit: s as Sichtbarkeit | undefined, userId: user.id });
    if (!d) return persError(404, "nicht_gefunden", "Vorlage nicht gefunden.");
    await appendAudit({ action: "pers_template_saved", actorType: "staff", actorId: user.id, ip, detail: { templateId: d.id, version: d.aktuelleVersion, published: true } });
    return persJson(d);
  });
}
