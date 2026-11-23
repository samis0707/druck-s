import { config } from "@/lib/config";
import { begrenzeJeIp, zaehle } from "@/lib/personalisierung/dienst";
import { persFailure, persJson } from "@/lib/personalisierung/http";
import { legeEntwurfAn } from "@/lib/personalisierung/repo";
import { loeseZugang } from "@/lib/personalisierung/zugang";

/**
 * Entwurf anlegen (Datensätze zwischenspeichern, z. B. bis zur Bestätigung). Antwort enthält das Entwurfs-Token,
 * das nur hier im Klartext erscheint und bei weiteren Aufrufen im Header `x-entwurf-token` mitzuschicken ist.
 * Entwürfe laufen nach PERS_DRAFT_TTL_HOURS (Standard 24) ohne Änderung ab und werden gelöscht.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  try {
    const z = await loeseZugang(req, (await ctx.params).ref);
    if (z instanceof Response) return z;
    await begrenzeJeIp("pers_draft_created", z.ip, config.personalisierung.draftsPerIpPerHour);
    const { entwurf, token } = await legeEntwurfAn(z.detail.id, { linkId: z.link?.id ?? null });
    await zaehle("pers_draft_created", z.ip, z.akteur, { templateId: z.detail.id });
    return persJson({ id: entwurf.id, token, version: entwurf.templateVersion, expiresAt: entwurf.expiresAt }, 201);
  } catch (e) {
    return persFailure(e, "Entwurf anlegen");
  }
}
