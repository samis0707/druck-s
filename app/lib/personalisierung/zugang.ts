/**
 * Zugang zu einer Vorlage für Kunden und Gäste. `ref` ist entweder
 *  - ein Zugriffs-Token (64 Hex-Zeichen, aus einem öffentlichen Link): Gast ohne Konto, oder
 *  - die Vorlagen-ID (UUID): angemeldeter Kunde mit Zuordnung bzw. Öffentlich-Sichtbarkeit; Mitarbeiter dürfen alles.
 * Ungültiges, widerrufenes, abgelaufenes oder nicht freigegebenes wird einheitlich als 404 gemeldet.
 */
import { getSessionUser, isStaff } from "../auth/session";
import { clientIp } from "../guards";
import { persError } from "./http";
import { holeVorlage, istUuid, loeseLinkAuf, type VorlageDetail, type ZugriffsLink } from "./repo";
import { query } from "../db";

export interface Zugang {
  detail: VorlageDetail;
  link: ZugriffsLink | null;
  ip: string;
  akteur: { type: "customer" | "staff" | "system"; id: string | null };
}

const NICHT_GEFUNDEN = () => persError(404, "nicht_gefunden", "Diese Vorlage gibt es nicht oder der Zugang ist nicht mehr gültig.");

export async function loeseZugang(req: Request, ref: string): Promise<Zugang | Response> {
  const ip = clientIp(req);
  if (/^[0-9a-f]{64}$/.test(ref)) {
    const r = await loeseLinkAuf(ref);
    if (!r) return NICHT_GEFUNDEN();
    return { detail: r.vorlage, link: r.link, ip, akteur: { type: "system", id: null } };
  }
  if (!istUuid(ref)) return NICHT_GEFUNDEN();
  const user = await getSessionUser(req.headers);
  if (!user) return persError(401, "anmeldung", "Bitte melden Sie sich an.");
  const detail = await holeVorlage(ref);
  if (!detail) return NICHT_GEFUNDEN();
  if (isStaff(user)) return { detail, link: null, ip, akteur: { type: "staff", id: user.id } };
  if (user.role !== "customer" || detail.status !== "aktiv" || detail.archiviert) return NICHT_GEFUNDEN();
  let erlaubt = detail.sichtbarkeit === "oeffentlich";
  if (!erlaubt && detail.sichtbarkeit === "kunden") {
    const z = await query("SELECT 1 FROM pers_template_customers WHERE template_id = $1 AND customer_id = $2", [ref, user.id]);
    erlaubt = z.rows.length > 0;
  }
  if (!erlaubt) return NICHT_GEFUNDEN();
  return { detail, link: null, ip, akteur: { type: "customer", id: user.id } };
}
