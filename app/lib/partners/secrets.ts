/**
 * Webhook-Secrets der Partner. Sie müssen zum Signieren im Klartext verfügbar sein und liegen
 * deshalb verschlüsselt in der DB (`partners.webhook_secret_enc`):
 * AES-256-GCM, Schlüssel = HKDF-SHA256(BETTER_AUTH_SECRET, info "druck-s/partner-webhook-secret/v1"),
 * Format `v1.<iv>.<tag>.<ciphertext>` (base64url). Kein zusätzliches Env, nur node:crypto — damit
 * `scripts/partner-key.mjs` im Docker-Image (standalone, ohne Better-Auth-Quellen) identisch
 * verschlüsseln kann. Wer BETTER_AUTH_SECRET rotiert, setzt danach die Webhook-Secrets neu
 * (`node scripts/partner-key.mjs rotate-webhook-secret <slug>`).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { config } from "../config";

const INFO = "druck-s/partner-webhook-secret/v1";

function deriveKey(authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(authSecret, "utf8"), Buffer.alloc(0), INFO, 32));
}

export function encryptWebhookSecret(secret: string, authSecret = config.auth.secret): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(authSecret), iv);
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptWebhookSecret(encrypted: string, authSecret = config.auth.secret): string {
  const [version, iv, tag, ct] = encrypted.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unknown webhook secret format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(authSecret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
