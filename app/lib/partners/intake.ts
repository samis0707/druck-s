/**
 * Partner-Tür in dieselbe Pipeline wie Door A/B: Datei laden und prüfen, Auftrag + Datei +
 * Events in einer Transaktion (draft_created → partner_submitted, DRAFT → RECEIVED, Nummer),
 * danach Analyse/Virenscan und KI-Notiz wie bei Door A/B (im Route-Handler angestoßen).
 */
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { appendAudit } from "../auditLog";
import { config } from "../config";
import { query, withTx } from "../db";
import { findIdentityByEmail } from "../identities";
import { appendEventTx, TransitionError } from "../requests/events";
import type { RequestStatus } from "../requests/types";
import { bucketName, getStorage } from "../storage";
import { putRequestFile } from "../storageFiles";
import type { Partner } from "./auth";
import { fetchPartnerFile, type Downloader } from "./fetchFile";
import { partnerFreeText, partnerMeta } from "./freeText";
import type { PartnerRequestBody } from "./validate";

/** Antwortform für den Partner (`{ request: … }`). */
export interface PartnerRequestView {
  id: string;
  number: string | null;
  status: RequestStatus;
  partnerRef: string;
  createdAt: string;
  trackingNumber: string | null;
  specialDeliveryDate: string | null;
}

export class PartnerIntakeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PartnerIntakeError";
  }
}

export async function findPartnerRequest(partnerId: string, partnerRef: string): Promise<PartnerRequestView | null> {
  const res = await query<PartnerRequestView>(
    `SELECT r.id, r.number, r.status, r.partner_ref AS "partnerRef", r.created_at AS "createdAt",
            s.tracking_number AS "trackingNumber", s.special_delivery_date::text AS "specialDeliveryDate"
       FROM requests r LEFT JOIN shipments s ON s.request_id = r.id
      WHERE r.partner_id = $1 AND r.partner_ref = $2`,
    [partnerId, partnerRef],
  );
  return res.rows[0] ?? null;
}

/** Neue Aufträge dieses Partners in der letzten Stunde (Rate-Limit, instanzübergreifend über die DB). */
export async function partnerRequestsLastHour(partnerId: string): Promise<number> {
  const res = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM requests WHERE partner_id = $1 AND created_at > now() - interval '1 hour'",
    [partnerId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

async function deleteObject(key: string) {
  try {
    await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  } catch {
    // Verwaistes Objekt ist harmlos; der Auftrag existiert nicht.
  }
}

/**
 * Anlegen, idempotent über (partner, partnerRef): ein vorhandener Auftrag wird unverändert
 * zurückgegeben (`created: false`), auch bei gleichzeitigen Aufrufen.
 */
export async function createPartnerRequest(
  partner: Partner,
  body: PartnerRequestBody,
  deps: { download?: Downloader } = {},
): Promise<{ request: PartnerRequestView; created: boolean }> {
  const existing = await findPartnerRequest(partner.id, body.partnerRef);
  if (existing) return { request: existing, created: false };

  if (config.partner.rateLimitPerHour > 0) {
    const recent = await partnerRequestsLastHour(partner.id);
    if (recent >= config.partner.rateLimitPerHour) {
      throw new PartnerIntakeError("Too many new requests, try again later", 429, "rate_limited");
    }
  }

  // Kunde = Gemeinschaft: freigeschaltetes Konto bindet direkt, sonst prospect_email
  // (die Staff-Freischaltung bindet solche Aufträge später an das Konto).
  const identity = await findIdentityByEmail(body.customer.email);
  if (identity?.status === "disabled") {
    throw new PartnerIntakeError("The customer account is disabled at the print firm", 422, "customer_disabled");
  }
  const customerId = identity && identity.role === "customer" && identity.status === "customer" ? identity.id : null;

  const bytes = await fetchPartnerFile(body.file, partner.fileHosts, {
    timeoutMs: config.partner.fileTimeoutSeconds * 1000,
    download: deps.download,
  });

  const requestId = randomUUID();
  const storageKey = `requests/${requestId}/${randomUUID()}-${body.file.name}`;
  await putRequestFile(storageKey, bytes, body.file.mime);

  try {
    const request = await withTx(async (client) => {
      await client.query(
        `INSERT INTO requests
           (id, customer_id, prospect_email, trust, origin, product_hint, reference_text, free_text,
            status, partner_id, partner_ref, partner_meta)
         VALUES ($1, $2, $3, 'VOUCHED', 'partner', $4, $5, $6, 'DRAFT', $7, $8, $9)`,
        [
          requestId,
          customerId,
          customerId ? null : body.customer.email,
          body.product.hint,
          `${body.customer.organisation} · ${partner.name}`.slice(0, 300),
          partnerFreeText(body, partner.name),
          partner.id,
          body.partnerRef,
          JSON.stringify(partnerMeta(body)),
        ],
      );
      await client.query(
        `INSERT INTO request_events (request_id, event, actor_type, actor_id, detail)
         VALUES ($1, 'draft_created', 'partner', $2, '{}')`,
        [requestId, partner.id],
      );
      await client.query(
        `INSERT INTO request_files (request_id, storage_key, file_name, mime_type, size_bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [requestId, storageKey, body.file.name, body.file.mime, bytes.length, body.file.sha256],
      );
      await appendEventTx(client, {
        requestId,
        event: "partner_submitted",
        actorType: "partner",
        actorId: partner.id,
        detail: { partner: partner.slug, partnerRef: body.partnerRef },
      });
      const res = await client.query<{ number: string | null; status: RequestStatus; createdAt: string }>(
        `SELECT number, status, created_at AS "createdAt" FROM requests WHERE id = $1`,
        [requestId],
      );
      return res.rows[0];
    });
    await appendAudit({
      action: "partner_request_created",
      actorType: "partner",
      actorId: partner.id,
      requestId,
      detail: { partner: partner.slug, partnerRef: body.partnerRef },
    });
    return {
      created: true,
      request: {
        id: requestId,
        number: request.number,
        status: request.status,
        partnerRef: body.partnerRef,
        createdAt: request.createdAt,
        trackingNumber: null,
        specialDeliveryDate: null,
      },
    };
  } catch (err) {
    await deleteObject(storageKey);
    // Gleichzeitiger zweiter Aufruf mit demselben partnerRef → vorhandenen Auftrag liefern.
    if ((err as { code?: string }).code === "23505") {
      const again = await findPartnerRequest(partner.id, body.partnerRef);
      if (again) return { request: again, created: false };
    }
    throw err;
  }
}

/** Zurückziehen (nur aus RECEIVED/IN_REVIEW; wiederholter Aufruf auf WITHDRAWN ist idempotent). */
export async function withdrawPartnerRequest(
  partner: Partner,
  partnerRef: string,
): Promise<{ request: PartnerRequestView; changed: boolean }> {
  const found = await findPartnerRequest(partner.id, partnerRef);
  if (!found) throw new PartnerIntakeError("Request not found", 404, "not_found");
  if (found.status === "WITHDRAWN") return { request: found, changed: false };
  try {
    await withTx((client) =>
      appendEventTx(client, {
        requestId: found.id,
        event: "withdrawn",
        actorType: "partner",
        actorId: partner.id,
        detail: { partner: partner.slug },
      }),
    );
  } catch (err) {
    if (err instanceof TransitionError && err.from === "WITHDRAWN") {
      const again = await findPartnerRequest(partner.id, partnerRef);
      if (again) return { request: again, changed: false };
    }
    if (err instanceof TransitionError) {
      throw new PartnerIntakeError(
        `Request can no longer be withdrawn (status ${err.from ?? "unknown"})`,
        409,
        "not_withdrawable",
      );
    }
    throw err;
  }
  await appendAudit({
    action: "partner_request_withdrawn",
    actorType: "partner",
    actorId: partner.id,
    requestId: found.id,
    detail: { partner: partner.slug, partnerRef },
  });
  const after = await findPartnerRequest(partner.id, partnerRef);
  return { request: after ?? { ...found, status: "WITHDRAWN" }, changed: true };
}
