/**
 * API-Schlüssel für den Maschinenzugriff auf /api/v1/kalkulation/… (Scope „kalkulation“).
 *
 * Der Partner-Schlüssel-Mechanismus (lib/partners) passt nicht: er hängt an der Tabelle partners
 * (Auftragseingang, Webhooks, Dateihosts) und kennt keinen Scope. Hier: eigene Tabelle, gleiche
 * Technik – `Authorization: Bearer kal_<64 hex>`, gespeichert wird nur der SHA-256-Hash plus ein
 * nicht geheimes Präfix, Vergleich in konstanter Zeit.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "../crypto";
import { query } from "../db";

export const KALKULATION_SCOPE = "kalkulation";
export const KEY_PATTERN = /^kal_[0-9a-f]{64}$/;
export const KEY_PREFIX_LENGTH = 12;

export function neuerKey(): { key: string; hash: string; prefix: string } {
  const key = `kal_${randomBytes(32).toString("hex")}`;
  return { key, hash: sha256Hex(key), prefix: key.slice(0, KEY_PREFIX_LENGTH) };
}

export function bearerKalkulationKey(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m && KEY_PATTERN.test(m[1]) ? m[1] : null;
}

export interface KalkulationKey {
  id: string;
  name: string;
  scopes: string[];
}

interface KeyRow extends KalkulationKey {
  keyHash: string;
  active: boolean;
}

export type KeyLookup = (prefix: string) => Promise<KeyRow[]>;

const lookupByPrefix: KeyLookup = async (prefix) => {
  const r = await query<KeyRow>(
    `SELECT id, name, scopes, key_hash AS "keyHash", active FROM kalkulation_api_keys WHERE key_prefix = $1`,
    [prefix],
  );
  return r.rows;
};

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Schlüssel → aktiver Eintrag oder null. Alle Kandidaten werden geprüft (gleichmäßige Laufzeit). */
export async function authentifiziereKey(
  authorization: string | null,
  lookup: KeyLookup = lookupByPrefix,
): Promise<KalkulationKey | null> {
  const key = bearerKalkulationKey(authorization);
  if (!key) return null;
  const hash = sha256Hex(key);
  let treffer: KeyRow | null = null;
  for (const row of await lookup(key.slice(0, KEY_PREFIX_LENGTH))) {
    if (gleich(row.keyHash, hash) && row.active) treffer = row;
  }
  if (!treffer) return null;
  // Zeitpunkt der letzten Nutzung höchstens einmal je Minute schreiben
  await query(
    `UPDATE kalkulation_api_keys SET last_used_at = now()
      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [treffer.id],
  ).catch(() => undefined);
  return { id: treffer.id, name: treffer.name, scopes: treffer.scopes };
}

export async function legeKeyAn(name: string, scopes: string[] = [KALKULATION_SCOPE], von: string | null = null) {
  const k = neuerKey();
  const r = await query<{ id: string }>(
    `INSERT INTO kalkulation_api_keys (name, key_hash, key_prefix, scopes, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name.slice(0, 80), k.hash, k.prefix, scopes, von],
  );
  return { id: r.rows[0].id, key: k.key, prefix: k.prefix };
}

export async function sperreKey(id: string): Promise<boolean> {
  const r = await query("UPDATE kalkulation_api_keys SET active = false WHERE id = $1 AND active", [id]);
  return (r.rowCount ?? 0) > 0;
}
