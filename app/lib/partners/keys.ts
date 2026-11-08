/**
 * Partner-API-Keys: Format, Hash, Präfix und Vergleich. Rein (ohne DB), damit Skript-Parität
 * und Tests einfach bleiben. Gespeichert wird nur der SHA-256-Hash plus ein nicht geheimes Präfix.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "../crypto";

/** `dmp_` + 64 Hex-Zeichen (32 Byte Zufall). */
export const PARTNER_KEY_PATTERN = /^dmp_[0-9a-f]{64}$/;
/** Länge des angezeigten/gesuchten Präfixes, z. B. `dmp_1a2b3c4d`. */
export const PARTNER_KEY_PREFIX_LENGTH = 12;

export function newPartnerKey(): { key: string; hash: string; prefix: string } {
  const key = `dmp_${randomBytes(32).toString("hex")}`;
  return { key, hash: hashPartnerKey(key), prefix: partnerKeyPrefix(key) };
}

export function hashPartnerKey(key: string): string {
  return sha256Hex(key);
}

export function partnerKeyPrefix(key: string): string {
  return key.slice(0, PARTNER_KEY_PREFIX_LENGTH);
}

/** `Authorization: Bearer dmp_…` → Key oder null (falsches Schema/Format). */
export function bearerKey(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!m) return null;
  return PARTNER_KEY_PATTERN.test(m[1]) ? m[1] : null;
}

/** Hash-Vergleich in konstanter Zeit (beide Seiten sind SHA-256-Hex). */
export function hashMatches(storedHash: string, presentedKey: string): boolean {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hashPartnerKey(presentedKey), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
