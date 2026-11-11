/**
 * Bestätigungscode der offenen Anfrage. Bewusst kein Login-Code: er ist an genau einen
 * Entwurf gebunden, erzeugt keine Sitzung und gibt keinen Zugang zum Portal.
 * Parameter wie bei den Better-Auth-Codes (6 Ziffern, Gültigkeit OTP_TTL_MINUTES, einmalig).
 */
import { createHmac, randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "../config";
import { safeEqual } from "../crypto";
import { query } from "../db";

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(requestId: string, code: string): string {
  return createHmac("sha256", config.auth.secret).update(`inquiry-code:${requestId}:${code}`).digest("hex");
}

/** Wie oft für diesen Entwurf schon ein Code verschickt wurde. */
export async function sentCount(requestId: string): Promise<number> {
  const res = await query<{ n: number }>("SELECT sent_count AS n FROM inquiry_codes WHERE request_id = $1", [requestId]);
  return res.rows[0]?.n ?? 0;
}

/** Neuen Code hinterlegen; ein früherer Code dieses Entwurfs wird damit ungültig. */
export async function storeCode(requestId: string, email: string, code: string): Promise<void> {
  await query(
    `INSERT INTO inquiry_codes (request_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     ON CONFLICT (request_id) DO UPDATE SET
       email = EXCLUDED.email, code_hash = EXCLUDED.code_hash, attempts = 0,
       sent_count = inquiry_codes.sent_count + 1, expires_at = EXCLUDED.expires_at, last_sent_at = now()`,
    [requestId, email, hashCode(requestId, code), config.ttl.otpMinutes],
  );
}

export type CodeCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "missing" | "expired" | "locked" | "invalid"; attemptsLeft?: number };

/**
 * Code prüfen, innerhalb der Transaktion der Bestätigung (Zeile ist gesperrt).
 * Ein Fehlversuch wird gezählt und bleibt gespeichert, weil der Aufrufer danach normal
 * committet; bei Erfolg löscht der Aufrufer die Zeile mit `consumeCode`.
 */
export async function checkCodeTx(client: PoolClient, requestId: string, code: string): Promise<CodeCheck> {
  const res = await client.query<{ email: string; code_hash: string; attempts: number; expired: boolean }>(
    `SELECT email, code_hash, attempts, expires_at < now() AS expired
       FROM inquiry_codes WHERE request_id = $1 FOR UPDATE`,
    [requestId],
  );
  const row = res.rows[0];
  if (!row) return { ok: false, reason: "missing" };
  if (row.expired) {
    await client.query("DELETE FROM inquiry_codes WHERE request_id = $1", [requestId]);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= config.inquiry.codeAttempts) {
    await client.query("DELETE FROM inquiry_codes WHERE request_id = $1", [requestId]);
    return { ok: false, reason: "locked" };
  }
  if (!safeEqual(hashCode(requestId, code), row.code_hash)) {
    const attempts = row.attempts + 1;
    await client.query("UPDATE inquiry_codes SET attempts = $2 WHERE request_id = $1", [requestId, attempts]);
    return { ok: false, reason: "invalid", attemptsLeft: Math.max(0, config.inquiry.codeAttempts - attempts) };
  }
  return { ok: true, email: row.email };
}

export async function consumeCodeTx(client: PoolClient, requestId: string): Promise<void> {
  await client.query("DELETE FROM inquiry_codes WHERE request_id = $1", [requestId]);
}
