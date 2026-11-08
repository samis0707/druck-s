/** Guard für Partner-Routen: `Authorization: Bearer dmp_<64 hex>`. */
import { partnerError } from "./http";
import { query } from "../db";
import { bearerKey, hashMatches, partnerKeyPrefix } from "./keys";

export interface Partner {
  id: string;
  slug: string;
  name: string;
  webhookUrl: string | null;
  fileHosts: string[];
}

export interface PartnerKeyRow extends Partner {
  keyHash: string;
  active: boolean;
}

const COLS = `id, slug, name, webhook_url AS "webhookUrl", file_hosts AS "fileHosts",
  key_hash AS "keyHash", active`;

/** DB-Zugriff austauschbar für Unit-Tests. */
export type PartnerLookup = (keyPrefix: string) => Promise<PartnerKeyRow[]>;

export const lookupByPrefix: PartnerLookup = async (prefix) => {
  const res = await query<PartnerKeyRow>(`SELECT ${COLS} FROM partners WHERE key_prefix = $1`, [prefix]);
  return res.rows;
};

/**
 * Key → aktiver Partner oder null. Gesucht wird über das nicht geheime Präfix, verglichen wird der
 * SHA-256-Hash in konstanter Zeit (kein Lookup über den geheimen Wert selbst).
 */
export async function authenticatePartner(
  authorization: string | null,
  lookup: PartnerLookup = lookupByPrefix,
): Promise<Partner | null> {
  const key = bearerKey(authorization);
  if (!key) return null;
  const candidates = await lookup(partnerKeyPrefix(key));
  let match: PartnerKeyRow | null = null;
  for (const row of candidates) {
    // Alle Kandidaten prüfen, damit die Laufzeit nicht von der Trefferposition abhängt.
    if (hashMatches(row.keyHash, key) && row.active) match = row;
  }
  if (!match) return null;
  return {
    id: match.id,
    slug: match.slug,
    name: match.name,
    webhookUrl: match.webhookUrl,
    fileHosts: match.fileHosts ?? [],
  };
}

export async function requirePartner(
  req: Request,
  lookup?: PartnerLookup,
): Promise<{ partner: Partner } | { error: Response }> {
  const partner = await authenticatePartner(req.headers.get("authorization"), lookup);
  if (!partner) {
    const res = partnerError(401, "unauthorized", "Invalid or missing partner key");
    res.headers.set("www-authenticate", 'Bearer realm="druck-s partner api"');
    return { error: res };
  }
  return { partner };
}
