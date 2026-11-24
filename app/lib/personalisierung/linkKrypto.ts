/**
 * Zugriffs-Tokens der Kundenlinks verschlüsselt ablegen (AES-256-GCM), damit Mitarbeiter denselben Link
 * erneut kopieren können. Geprüft wird weiterhin nur über den SHA-256-Hash des Tokens.
 *
 * Schlüssel: PERS_LINK_KEY (32 Byte, Base64, z. B. `openssl rand -base64 32`). Fehlt er, wird er per HKDF aus
 * BETTER_AUTH_SECRET abgeleitet. Wer den Schlüssel wechselt, kann ältere Links nicht mehr anzeigen
 * (sie bleiben gültig); entschlüsseln liefert dann null.
 * Format: "v1:" + Base64(iv[12] + Tag[16] + Chiffre). Die Link-ID ist als Zusatzdaten (AAD) gebunden.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { config } from "../config";

const PRAEFIX = "v1:";

export function linkSchluessel(env: { key?: string; secret: string } = { key: process.env.PERS_LINK_KEY, secret: config.auth.secret }): Buffer {
  const roh = (env.key ?? "").trim();
  if (roh) {
    const k = Buffer.from(roh, "base64");
    if (k.length !== 32) throw new Error("PERS_LINK_KEY muss 32 Byte (Base64) lang sein.");
    return k;
  }
  return Buffer.from(hkdfSync("sha256", Buffer.from(env.secret), Buffer.from("druck-s/personalisierung"), Buffer.from("pers-link-token-v1"), 32));
}

export function verschluesselToken(token: string, linkId: string, key: Buffer = linkSchluessel()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(linkId));
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return PRAEFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Klartext-Token oder null (falscher Schlüssel, andere Link-ID, beschädigt, nicht vorhanden). */
export function entschluesselToken(enc: string | null | undefined, linkId: string, key?: Buffer): string | null {
  if (!enc || !enc.startsWith(PRAEFIX)) return null;
  try {
    const roh = Buffer.from(enc.slice(PRAEFIX.length), "base64");
    if (roh.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key ?? linkSchluessel(), roh.subarray(0, 12));
    d.setAAD(Buffer.from(linkId));
    d.setAuthTag(roh.subarray(12, 28));
    return Buffer.concat([d.update(roh.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
