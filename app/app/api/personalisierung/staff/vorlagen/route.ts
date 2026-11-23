import { istObjekt, alsStaff, leseJson, persJson } from "@/lib/personalisierung/http";
import { PersFehler } from "@/lib/personalisierung/dateien";
import { erstelleVorlage, listeVorlagen } from "@/lib/personalisierung/repo";
import { SICHTBARKEIT, STATUS, type Sichtbarkeit, type VorlagenStatus } from "@/lib/personalisierung/schema";
import { appendAudit } from "@/lib/auditLog";

/** Alle Vorlagen (`?archiviert=1` zeigt auch archivierte). */
export async function GET(req: Request) {
  return alsStaff(req, "Vorlagen listen", async () => {
    return persJson({ vorlagen: await listeVorlagen({ archivierte: new URL(req.url).searchParams.get("archiviert") === "1" }) });
  });
}

/** Neue Vorlage: { vorlage, status?, sichtbarkeit? } – `vorlage` nach lib/personalisierung/schema.ts. */
export async function POST(req: Request) {
  return alsStaff(req, "Vorlage anlegen", async (user) => {
    const body = await leseJson(req, 512 * 1024);
    if (!istObjekt(body)) throw new PersFehler("Der Körper muss ein JSON-Objekt sein.");
    const status = (body.status ?? "entwurf") as VorlagenStatus;
    const sichtbarkeit = (body.sichtbarkeit ?? "mitarbeiter") as Sichtbarkeit;
    if (!STATUS.includes(status) || !SICHTBARKEIT.includes(sichtbarkeit)) throw new PersFehler("Ungültiger Status oder ungültige Sichtbarkeit.");
    const d = await erstelleVorlage(body.vorlage, { userId: user.id, status, sichtbarkeit });
    await appendAudit({ action: "pers_template_saved", actorType: "staff", actorId: user.id, detail: { templateId: d.id, version: d.aktuelleVersion } });
    return persJson(d, 201);
  });
}
