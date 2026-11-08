import type { PoolClient } from "pg";
import { query } from "../db";
import {
  TRANSITIONS,
  type RequestEvent,
  type RequestStatus,
} from "./types";
import { assignRequestNumber } from "../requestNumber";
import { enqueuePartnerWebhookTx, shouldNotifyPartner } from "../partners/webhook";

export class TransitionError extends Error {
  constructor(
    public readonly event: RequestEvent,
    public readonly from: RequestStatus | null,
  ) {
    super(`Illegal transition: event ${event} from ${from ?? "missing request"}`);
    this.name = "TransitionError";
  }
}

export interface EventInput {
  requestId: string;
  event: RequestEvent;
  actorType?: "customer" | "staff" | "system" | "partner" | null;
  actorId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Guarded append: locks the request row, validates the event against the
 * transition table, records the event, and moves the cached status.
 * Throws TransitionError without side effects on illegal moves.
 */
export async function appendEvent(input: EventInput): Promise<RequestStatus> {
  const { getPool } = await import("../db");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    try {
      const status = await appendEventTx(client, input);
      await client.query("COMMIT");
      return status;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}

export async function appendEventTx(
  client: PoolClient,
  input: EventInput,
): Promise<RequestStatus> {
  const current = await client.query<{ status: RequestStatus; partner_id: string | null }>(
    "SELECT status, partner_id FROM requests WHERE id = $1 FOR UPDATE",
    [input.requestId],
  );
  if (current.rowCount === 0) throw new TransitionError(input.event, null);
  const from = current.rows[0].status;
  const rule = TRANSITIONS[input.event];
  if (!rule.from.includes(from)) throw new TransitionError(input.event, from);
  await client.query(
    "INSERT INTO request_events (request_id, event, actor_type, actor_id, detail) VALUES ($1, $2, $3, $4, $5)",
    [
      input.requestId,
      input.event,
      input.actorType ?? null,
      input.actorId ?? null,
      JSON.stringify(input.detail ?? {}),
    ],
  );
  await client.query(
    "UPDATE requests SET status = $1, updated_at = now() WHERE id = $2",
    [rule.to, input.requestId],
  );
  if (from === "DRAFT" && rule.to === "RECEIVED") await assignRequestNumber(client, input.requestId);
  // Partner-Aufträge: Statuswechsel in derselben Transaktion für den Webhook vormerken (Outbox).
  if (current.rows[0].partner_id && shouldNotifyPartner(from, rule.to)) {
    await enqueuePartnerWebhookTx(client, input.requestId, rule.to);
  }
  return rule.to;
}

/** Recompute status purely from the event log (self-healing read path). */
export async function recomputeStatus(requestId: string): Promise<RequestStatus | null> {
  const res = await query<{ event: RequestEvent }>(
    "SELECT event FROM request_events WHERE request_id = $1 ORDER BY id ASC",
    [requestId],
  );
  if (res.rowCount === 0) return null;
  // Fold through the table: each event's target becomes the status.
  let folded: RequestStatus | null = null;
  for (const row of res.rows) {
    folded = TRANSITIONS[row.event].to;
  }
  return folded;
}

/** Pure helper used by unit tests: is this event legal from this status? */
export function canTransition(from: RequestStatus, event: RequestEvent): boolean {
  return TRANSITIONS[event].from.includes(from);
}
