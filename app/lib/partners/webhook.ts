/**
 * Status-Webhooks an Partner über eine Outbox:
 * - `enqueuePartnerWebhookTx` läuft in der Transaktion des Statuswechsels (appendEventTx), damit
 *   kein Wechsel ohne Meldung bleibt und keine Meldung ohne Wechsel entsteht.
 * - `deliverPartnerWebhooks` stellt fällige Einträge zu (Worker in instrumentation.ts): HMAC-SHA256
 *   über `${timestamp}.${body}` in `x-druck-s-signature: v1=<hex>`, Backoff, Reihenfolge je Auftrag.
 * Logs und `last_error` enthalten weder URL noch Secret.
 */
import { createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import { appendAudit } from "../auditLog";
import { config } from "../config";
import { query, withTx } from "../db";
import type { RequestStatus } from "../requests/types";
import { decryptWebhookSecret } from "./secrets";

export interface PartnerWebhookPayload {
  event: "status_changed";
  partnerRef: string;
  number: string | null;
  status: RequestStatus;
  occurredAt: string;
  trackingNumber?: string | null;
  specialDeliveryDate?: string | null;
}

/** Statuswerte, die ein Partner sehen kann (DRAFT existiert für Partner-Aufträge nie nach außen). */
export const PARTNER_VISIBLE_STATUSES: readonly RequestStatus[] = [
  "RECEIVED",
  "IN_REVIEW",
  "WAITING_APPROVAL",
  "IN_PROGRESS",
  "SHIPPED",
  "WITHDRAWN",
];

/** Gemeldet wird jeder echte Statuswechsel in einen für Partner sichtbaren Status. */
export function shouldNotifyPartner(from: RequestStatus, to: RequestStatus): boolean {
  return from !== to && PARTNER_VISIBLE_STATUSES.includes(to);
}

export function buildWebhookPayload(input: {
  partnerRef: string;
  number: string | null;
  status: RequestStatus;
  occurredAt: Date;
  shipment?: { trackingNumber: string | null; specialDeliveryDate: string | null } | null;
}): PartnerWebhookPayload {
  const payload: PartnerWebhookPayload = {
    event: "status_changed",
    partnerRef: input.partnerRef,
    number: input.number,
    status: input.status,
    occurredAt: input.occurredAt.toISOString(),
  };
  if (input.status === "SHIPPED") {
    payload.trackingNumber = input.shipment?.trackingNumber ?? null;
    payload.specialDeliveryDate = input.shipment?.specialDeliveryDate ?? null;
  }
  return payload;
}

/** `v1=<hex>` = HMAC-SHA256(secret, `${timestamp}.${rawBody}`) — identisch zu Seeräuber digital. */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** Wartezeit in Minuten nach dem n-ten Fehlversuch (1-basiert). */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720, 720, 720, 720] as const;
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

export function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
}

/** Antworten, bei denen ein erneuter Versuch nichts ändert (Format abgelehnt). */
export function isPermanentFailure(status: number): boolean {
  return status === 400 || status === 410 || status === 422;
}

/**
 * Outbox-Eintrag für einen Statuswechsel (nur Partner-Aufträge mit Webhook-URL).
 * Läuft in der Transaktion von appendEventTx; die Auftragszeile ist dort gesperrt.
 */
export async function enqueuePartnerWebhookTx(
  client: PoolClient,
  requestId: string,
  status: RequestStatus,
): Promise<void> {
  const res = await client.query<{
    partner_id: string;
    partner_ref: string;
    number: string | null;
    webhook_url: string | null;
    occurred_at: Date;
  }>(
    `SELECT r.partner_id, r.partner_ref, r.number, p.webhook_url, now() AS occurred_at
       FROM requests r JOIN partners p ON p.id = r.partner_id
      WHERE r.id = $1`,
    [requestId],
  );
  const row = res.rows[0];
  if (!row || !row.webhook_url) return;
  let shipment = null;
  if (status === "SHIPPED") {
    const s = await client.query<{ trackingNumber: string | null; specialDeliveryDate: string | null }>(
      `SELECT tracking_number AS "trackingNumber", special_delivery_date::text AS "specialDeliveryDate"
         FROM shipments WHERE request_id = $1`,
      [requestId],
    );
    shipment = s.rows[0] ?? null;
  }
  const payload = buildWebhookPayload({
    partnerRef: row.partner_ref,
    number: row.number,
    status,
    occurredAt: new Date(row.occurred_at),
    shipment,
  });
  await client.query(
    "INSERT INTO partner_webhook_outbox (partner_id, request_id, payload) VALUES ($1, $2, $3)",
    [row.partner_id, requestId, JSON.stringify(payload)],
  );
}

interface ClaimedRow {
  id: string;
  requestId: string;
  payload: PartnerWebhookPayload;
  attempts: number;
  slug: string;
  active: boolean;
  url: string | null;
  secretEnc: string | null;
}

/** Fällige Einträge reservieren (Lease 5 min, SKIP LOCKED: mehrere Instanzen stören sich nicht). */
async function claimDue(limit: number): Promise<ClaimedRow[]> {
  return withTx(async (client) => {
    const res = await client.query<ClaimedRow>(
      `WITH due AS (
         SELECT o.id FROM partner_webhook_outbox o
          WHERE o.delivered_at IS NULL AND o.failed_at IS NULL AND o.next_attempt_at <= now()
            AND NOT EXISTS (
              SELECT 1 FROM partner_webhook_outbox e
               WHERE e.request_id = o.request_id AND e.id < o.id
                 AND e.delivered_at IS NULL AND e.failed_at IS NULL)
          ORDER BY o.id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE partner_webhook_outbox o
          SET next_attempt_at = now() + interval '5 minutes'
         FROM due, partners p
        WHERE o.id = due.id AND p.id = o.partner_id
       RETURNING o.id::text AS id, o.request_id AS "requestId", o.payload, o.attempts,
                 p.slug, p.active, p.webhook_url AS url, p.webhook_secret_enc AS "secretEnc"`,
      [limit],
    );
    return res.rows.sort((a, b) => Number(a.id) - Number(b.id));
  });
}

async function markDelivered(id: string, status: number) {
  await query(
    `UPDATE partner_webhook_outbox
        SET delivered_at = now(), attempts = attempts + 1, last_status = $2, last_error = NULL
      WHERE id = $1`,
    [id, status],
  );
}

async function markFailed(row: ClaimedRow, status: number | null, error: string, permanent = false) {
  const attempts = row.attempts + 1;
  const giveUp = permanent || attempts >= MAX_ATTEMPTS || (status !== null && isPermanentFailure(status));
  if (giveUp) {
    await query(
      `UPDATE partner_webhook_outbox
          SET attempts = $2, last_status = $3, last_error = $4, failed_at = now()
        WHERE id = $1`,
      [row.id, attempts, status, error],
    );
    await appendAudit({
      action: "partner_webhook_failed",
      actorType: "system",
      requestId: row.requestId,
      detail: { partner: row.slug, outboxId: row.id, attempts, status, error },
    });
    console.warn(`Partner-Webhook ${row.id} (${row.slug}) aufgegeben nach ${attempts} Versuchen: ${error}`);
    return;
  }
  await query(
    `UPDATE partner_webhook_outbox
        SET attempts = $2, last_status = $3, last_error = $4,
            next_attempt_at = now() + make_interval(mins => $5)
      WHERE id = $1`,
    [row.id, attempts, status, error, backoffMinutes(attempts)],
  );
  console.warn(`Partner-Webhook ${row.id} (${row.slug}) Versuch ${attempts} fehlgeschlagen: ${error}`);
}

/** Fehlertext ohne URL/Query (fetch-Fehler können die Ziel-URL enthalten). */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    const cause = (err as { cause?: { code?: string } }).cause;
    return cause?.code ? `network error (${cause.code})` : "network error";
  }
  return "network error";
}

export interface DeliverOptions {
  limit?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** Fällige Webhooks zustellen. Liefert die Zahl erfolgreich zugestellter Einträge. */
export async function deliverPartnerWebhooks(opts: DeliverOptions = {}): Promise<number> {
  const rows = await claimDue(opts.limit ?? 20);
  const doFetch = opts.fetchImpl ?? fetch;
  let sent = 0;
  for (const row of rows) {
    if (!row.active || !row.url || !row.secretEnc) {
      // Partner deaktiviert oder Webhook nicht eingerichtet: nicht endlos versuchen.
      await markFailed(row, null, !row.active ? "partner inactive" : "webhook not configured", true);
      continue;
    }
    let secret: string;
    try {
      secret = decryptWebhookSecret(row.secretEnc);
    } catch {
      await markFailed(row, null, "webhook secret cannot be decrypted (BETTER_AUTH_SECRET changed?)", true);
      continue;
    }
    const body = JSON.stringify(row.payload);
    const timestamp = String(Math.floor((opts.now?.() ?? Date.now()) / 1000));
    try {
      const res = await doFetch(row.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "druck-s-webhook/1",
          "x-druck-s-timestamp": timestamp,
          "x-druck-s-signature": signWebhook(secret, timestamp, body),
          "x-druck-s-delivery": row.id,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        cache: "no-store",
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 200 && res.status < 300) {
        await markDelivered(row.id, res.status);
        sent += 1;
      } else {
        await markFailed(row, res.status, `HTTP ${res.status}`);
      }
    } catch (err) {
      await markFailed(row, null, describeError(err));
    }
  }
  return sent;
}

let running = false;

/** Ein Durchlauf ohne Überlappung im selben Prozess (Intervall + Anstoß nach Partner-Aufrufen). */
export async function runPartnerWebhookWorker(): Promise<void> {
  if (running || !config.partner.webhookWorker) return;
  running = true;
  try {
    // Mehrere Runden, solange volle Batches kommen.
    for (let i = 0; i < 10; i += 1) {
      const sent = await deliverPartnerWebhooks();
      if (sent < 20) break;
    }
  } catch (err) {
    console.error("Partner-Webhook-Worker:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}
