import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Analyse/KI-Notiz laufen im Route-Handler im Hintergrund an; hier abgeschaltet und unten
// gezielt mit der echten Analyse geprüft.
vi.mock("@/lib/assistantNote", () => ({ generateNote: vi.fn(async () => null) }));
vi.mock("@/lib/analyze/run", async (orig) => ({
  ...(await orig<typeof import("@/lib/analyze/run")>()),
  analyzeRequest: vi.fn(async () => []),
}));

import { query } from "@/lib/db";
import { bucketName, getStorage } from "@/lib/storage";
import { downloaders } from "@/lib/partners/fetchFile";
import { newPartnerKey } from "@/lib/partners/keys";
import { encryptWebhookSecret } from "@/lib/partners/secrets";
import { deliverPartnerWebhooks } from "@/lib/partners/webhook";
import { recordPreview } from "@/lib/requests/workflow";
import { recomputeStatus } from "@/lib/requests/events";
import { POST as create } from "@/app/api/partner/requests/route";
import { GET as read } from "@/app/api/partner/requests/[ref]/route";
import { POST as cancel } from "@/app/api/partner/requests/[ref]/cancel/route";

/**
 * Partner-Schnittstelle gegen den Compose-Stack (Postgres + S3):
 *   npm run test:int -- tests/partner.test.ts
 * Datei-Download und Webhook-Ziel sind lokal ersetzt (Downloader-Naht, lokaler HTTP-Server).
 */
const FILE_HOST = "files.partner.test";
let PDF = Buffer.alloc(0);
let SHA = "";
const SECRET = "whsec_integration";

let partnerId = "";
let otherPartnerId = "";
let apiKey = "";
let otherKey = "";
let staffId = "";
let hook: http.Server;
let hookUrl = "";
const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
let hookStatus = 200;
let downloads = 0;

function body(ref: string, overrides: Record<string, unknown> = {}) {
  return {
    partnerRef: ref,
    customer: { email: "gemeinschaft@partner.test", name: "Anna", organisation: "QZ Böckingen", phone: null },
    product: { hint: "flyer", label: "Flyer A6", widthMm: 105, heightMm: 148, bleedMm: 2, sides: 2, paper: null },
    quantity: 500,
    wishDate: "2026-12-01",
    delivery: { mode: "abholung", address: null },
    note: "Bitte matt",
    event: null,
    printerCheck: true,
    preflight: "warnung",
    file: { url: `https://${FILE_HOST}/sign/flyer.pdf?token=geheim`, name: "flyer.pdf", mime: "application/pdf", size: PDF.length, sha256: SHA },
    source: { system: "seeraeuber-digital", publication: "Blättle", link: "https://app.example/verlag/x" },
    ...overrides,
  };
}

function post(path: string, key: string | null, payload?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
function get(path: string, key: string) {
  return new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${key}` } });
}
const params = (ref: string) => ({ params: Promise.resolve({ ref }) });

async function cleanupRequests() {
  const files = await query<{ storage_key: string }>(
    "SELECT f.storage_key FROM request_files f JOIN requests r ON r.id = f.request_id WHERE r.partner_id = ANY($1)",
    [[partnerId, otherPartnerId]],
  );
  for (const f of files.rows) {
    await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: f.storage_key })).catch(() => {});
  }
  await query("DELETE FROM partner_webhook_outbox WHERE partner_id = ANY($1)", [[partnerId, otherPartnerId]]);
  await query("DELETE FROM audit_log WHERE request_id IN (SELECT id FROM requests WHERE partner_id = ANY($1))", [
    [partnerId, otherPartnerId],
  ]);
  await query("DELETE FROM requests WHERE partner_id = ANY($1)", [[partnerId, otherPartnerId]]);
}

beforeAll(async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([303.3, 425.2]); // A6 + 2 mm Beschnitt
  PDF = Buffer.from(await doc.save());
  SHA = createHash("sha256").update(PDF).digest("hex");
  hook = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: data });
      res.writeHead(hookStatus, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((r) => hook.listen(0, "127.0.0.1", r));
  hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/api/druck-s/webhook`;

  await query("DELETE FROM partner_webhook_outbox WHERE partner_id IN (SELECT id FROM partners WHERE slug LIKE 'itest-%')");
  await query("DELETE FROM requests WHERE partner_id IN (SELECT id FROM partners WHERE slug LIKE 'itest-%')");
  await query("DELETE FROM partners WHERE slug LIKE 'itest-%'");
  const a = newPartnerKey();
  const b = newPartnerKey();
  apiKey = a.key;
  otherKey = b.key;
  const enc = encryptWebhookSecret(SECRET);
  partnerId = (
    await query<{ id: string }>(
      `INSERT INTO partners (slug, name, key_hash, key_prefix, webhook_url, webhook_secret_enc, file_hosts)
       VALUES ('itest-seeraeuber', 'Seeräuber digital', $1, $2, $3, $4, $5) RETURNING id`,
      [a.hash, a.prefix, hookUrl, enc, [FILE_HOST]],
    )
  ).rows[0].id;
  otherPartnerId = (
    await query<{ id: string }>(
      `INSERT INTO partners (slug, name, key_hash, key_prefix, file_hosts)
       VALUES ('itest-other', 'Anderer Partner', $1, $2, $3) RETURNING id`,
      [b.hash, b.prefix, [FILE_HOST]],
    )
  ).rows[0].id;
  await query(`DELETE FROM "user" WHERE email = 'itest-partner-staff@example.com'`);
  staffId = (
    await query<{ id: string }>(
      `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), 'itest-partner-staff@example.com', 'S', 'staff', 'customer') RETURNING id`,
    )
  ).rows[0].id;
  // Kein Hintergrund-Anstoß aus den Routen: der Test stellt gezielt mit deliverPartnerWebhooks zu.
  const { config } = await import("@/lib/config");
  config.partner.webhookWorker = false;
  downloaders.default = async (url) => {
    downloads += 1;
    if (url.hostname !== FILE_HOST) throw new Error("unexpected host");
    return PDF;
  };
});

afterAll(async () => {
  await cleanupRequests();
  await query("DELETE FROM partners WHERE id = ANY($1)", [[partnerId, otherPartnerId]]);
  await query(`DELETE FROM "user" WHERE id = $1`, [staffId]);
  await new Promise((r) => hook.close(r));
});

beforeEach(async () => {
  await cleanupRequests();
  received.length = 0;
  hookStatus = 200;
  downloads = 0;
});

describe("Partner-Auth", () => {
  it("fehlender oder falscher Key → 401, deaktivierter Partner → 401", async () => {
    expect((await create(post("/api/partner/requests", null, body("r-auth")))).status).toBe(401);
    expect((await create(post("/api/partner/requests", newPartnerKey().key, body("r-auth")))).status).toBe(401);
    await query("UPDATE partners SET active = false WHERE id = $1", [partnerId]);
    try {
      expect((await create(post("/api/partner/requests", apiKey, body("r-auth")))).status).toBe(401);
    } finally {
      await query("UPDATE partners SET active = true WHERE id = $1", [partnerId]);
    }
  });
});

describe("Anlage", () => {
  it("201 mit Nummer, RECEIVED, VOUCHED, origin partner; zweiter Aufruf 200 mit gleicher ID", async () => {
    const res = await create(post("/api/partner/requests", apiKey, body("ref-1")));
    expect(res.status).toBe(201);
    const { request } = (await res.json()) as { request: { id: string; number: string; status: string } };
    expect(request.status).toBe("RECEIVED");
    expect(request.number).toMatch(/^\d{6}-\d{3,}$/);

    const row = (
      await query(
        `SELECT trust, origin, prospect_email, customer_id, product_hint, free_text, partner_ref, partner_meta, reference_text
           FROM requests WHERE id = $1`,
        [request.id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      trust: "VOUCHED",
      origin: "partner",
      prospect_email: "gemeinschaft@partner.test",
      customer_id: null,
      product_hint: "flyer",
      partner_ref: "ref-1",
    });
    expect(row.free_text).toContain("Auflage: 500 Stück");
    expect(row.reference_text).toBe("QZ Böckingen · Seeräuber digital");
    expect(JSON.stringify(row.partner_meta)).not.toContain("token=");
    const files = await query("SELECT sha256, size_bytes, file_name FROM request_files WHERE request_id = $1", [request.id]);
    expect(files.rows).toEqual([{ sha256: SHA, size_bytes: String(PDF.length), file_name: "flyer.pdf" }]);
    const events = await query("SELECT event FROM request_events WHERE request_id = $1 ORDER BY id", [request.id]);
    expect(events.rows.map((e) => e.event)).toEqual(["draft_created", "partner_submitted"]);
    expect(await recomputeStatus(request.id)).toBe("RECEIVED");

    const again = await create(post("/api/partner/requests", apiKey, body("ref-1", { quantity: 999 })));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { request: { id: string } }).request.id).toBe(request.id);
    expect(downloads).toBe(1);
    expect((await query("SELECT count(*)::int AS n FROM requests WHERE partner_ref = 'ref-1'")).rows[0].n).toBe(1);
  });

  it("gleichzeitige Aufrufe mit gleichem partnerRef ergeben genau einen Auftrag", async () => {
    const results = await Promise.all(
      [0, 1, 2].map(() => create(post("/api/partner/requests", apiKey, body("ref-race")))),
    );
    const ids = new Set<string>();
    for (const r of results) ids.add(((await r.json()) as { request: { id: string } }).request.id);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(ids.size).toBe(1);
  });

  it("bestehender Kunde wird direkt gebunden", async () => {
    await query(`DELETE FROM "user" WHERE email = 'kunde@partner.test'`);
    const u = await query<{ id: string }>(
      `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), 'kunde@partner.test', 'K', 'customer', 'customer') RETURNING id`,
    );
    try {
      const res = await create(
        post("/api/partner/requests", apiKey, body("ref-kunde", { customer: { email: "Kunde@Partner.test", name: "K", organisation: "O", phone: null } })),
      );
      expect(res.status).toBe(201);
      const { request } = (await res.json()) as { request: { id: string } };
      const row = (await query("SELECT customer_id, prospect_email FROM requests WHERE id = $1", [request.id])).rows[0];
      expect(row).toEqual({ customer_id: u.rows[0].id, prospect_email: null });
    } finally {
      await cleanupRequests();
      await query(`DELETE FROM "user" WHERE id = $1`, [u.rows[0].id]);
    }
  });

  it("Fehler: Validierung 400, fremder Host 400, SHA-256 422 – nichts angelegt", async () => {
    const bad = await create(post("/api/partner/requests", apiKey, { ...body("ref-bad"), quantity: -1 }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "invalid_body", error: expect.stringContaining("quantity") });

    const host = await create(
      post("/api/partner/requests", apiKey, body("ref-host", { file: { ...body("x").file, url: "https://evil.example/f.pdf" } })),
    );
    expect(host.status).toBe(400);
    expect(await host.json()).toMatchObject({ code: "file_host_not_allowed" });

    const sha = await create(
      post("/api/partner/requests", apiKey, body("ref-sha", { file: { ...body("x").file, sha256: "0".repeat(64) } })),
    );
    expect(sha.status).toBe(422);
    expect(await sha.json()).toMatchObject({ code: "file_sha256_mismatch" });

    const json = await create(
      new Request("http://localhost/api/partner/requests", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: "{kaputt",
      }),
    );
    expect(json.status).toBe(400);
    expect((await query("SELECT count(*)::int AS n FROM requests WHERE partner_id = $1", [partnerId])).rows[0].n).toBe(0);
  });

  it("Rate-Limit je Partner → 429", async () => {
    const { config } = await import("@/lib/config");
    const before = config.partner.rateLimitPerHour;
    config.partner.rateLimitPerHour = 1;
    try {
      expect((await create(post("/api/partner/requests", apiKey, body("ref-rl-1")))).status).toBe(201);
      const limited = await create(post("/api/partner/requests", apiKey, body("ref-rl-2")));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("3600");
      // Idempotente Wiederholung bleibt erlaubt.
      expect((await create(post("/api/partner/requests", apiKey, body("ref-rl-1")))).status).toBe(200);
    } finally {
      config.partner.rateLimitPerHour = before;
    }
  });
});

describe("Abruf und Storno", () => {
  it("GET nur für eigene Aufträge; Storno aus RECEIVED/IN_REVIEW, sonst 409; idempotent", async () => {
    const created = (await (await create(post("/api/partner/requests", apiKey, body("ref-c")))).json()) as {
      request: { id: string };
    };
    const got = await read(get("/api/partner/requests/ref-c", apiKey), params("ref-c"));
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ request: { id: created.request.id, status: "RECEIVED", partnerRef: "ref-c" } });
    expect((await read(get("/api/partner/requests/ref-c", otherKey), params("ref-c"))).status).toBe(404);
    expect((await cancel(post("/api/partner/requests/ref-c/cancel", otherKey), params("ref-c"))).status).toBe(404);
    expect((await read(get("/api/partner/requests/nope", apiKey), params("nope"))).status).toBe(404);

    await recordPreview({ requestId: created.request.id, actorType: "staff", actorId: staffId });
    const c1 = await cancel(post("/api/partner/requests/ref-c/cancel", apiKey), params("ref-c"));
    expect(c1.status).toBe(200);
    expect(await c1.json()).toMatchObject({ request: { status: "WITHDRAWN" } });
    const c2 = await cancel(post("/api/partner/requests/ref-c/cancel", apiKey), params("ref-c"));
    expect(c2.status).toBe(200);
    expect(await recomputeStatus(created.request.id)).toBe("WITHDRAWN");

    // Aus WAITING_APPROVAL nicht mehr möglich.
    const late = (await (await create(post("/api/partner/requests", apiKey, body("ref-late")))).json()) as {
      request: { id: string };
    };
    await query("UPDATE requests SET status = 'WAITING_APPROVAL' WHERE id = $1", [late.request.id]);
    const c3 = await cancel(post("/api/partner/requests/ref-late/cancel", apiKey), params("ref-late"));
    expect(c3.status).toBe(409);
    expect(await c3.json()).toMatchObject({ code: "not_withdrawable" });
  });
});

describe("Webhook-Outbox", () => {
  it("jeder Statuswechsel erzeugt genau einen Eintrag; Zustellung mit gültiger Signatur, in Reihenfolge", async () => {
    const created = (await (await create(post("/api/partner/requests", apiKey, body("ref-w")))).json()) as {
      request: { id: string; number: string };
    };
    await recordPreview({ requestId: created.request.id, actorType: "staff", actorId: staffId });
    // Kein Statuswechsel (zweite Vorschau) → kein Eintrag.
    await recordPreview({ requestId: created.request.id, actorType: "staff", actorId: staffId });
    const outbox = await query<{ payload: { status: string } }>(
      "SELECT payload FROM partner_webhook_outbox WHERE request_id = $1 ORDER BY id",
      [created.request.id],
    );
    expect(outbox.rows.map((r) => r.payload.status)).toEqual(["RECEIVED", "IN_REVIEW"]);

    const delivered = await deliverPartnerWebhooks({ limit: 50 });
    expect(delivered).toBeGreaterThanOrEqual(1);
    await deliverPartnerWebhooks({ limit: 50 });
    const mine = received.filter((r) => JSON.parse(r.body).partnerRef === "ref-w");
    expect(mine.map((r) => JSON.parse(r.body).status)).toEqual(["RECEIVED", "IN_REVIEW"]);
    for (const r of mine) {
      const ts = String(r.headers["x-druck-s-timestamp"]);
      expect(Math.abs(Date.now() / 1000 - Number(ts))).toBeLessThan(60);
      const expected = `v1=${createHmac("sha256", SECRET).update(`${ts}.${r.body}`).digest("hex")}`;
      expect(r.headers["x-druck-s-signature"]).toBe(expected);
      expect(JSON.parse(r.body)).toMatchObject({ event: "status_changed", number: created.request.number });
    }
    const state = await query("SELECT delivered_at IS NOT NULL AS done, attempts FROM partner_webhook_outbox WHERE request_id = $1", [
      created.request.id,
    ]);
    expect(state.rows.every((r) => r.done && r.attempts === 1)).toBe(true);
  });

  it("Fehler → Retry mit Backoff; 422 → aufgegeben; Partner ohne Webhook-URL → kein Eintrag", async () => {
    const created = (await (await create(post("/api/partner/requests", apiKey, body("ref-retry")))).json()) as {
      request: { id: string };
    };
    hookStatus = 503;
    await deliverPartnerWebhooks({ limit: 50 });
    let row = (
      await query(
        `SELECT attempts, delivered_at, failed_at, last_status, last_error,
                next_attempt_at > now() + interval '50 seconds' AS later
           FROM partner_webhook_outbox WHERE request_id = $1`,
        [created.request.id],
      )
    ).rows[0];
    expect(row).toMatchObject({ attempts: 1, delivered_at: null, failed_at: null, last_status: 503, last_error: "HTTP 503", later: true });

    await query("UPDATE partner_webhook_outbox SET next_attempt_at = now() WHERE request_id = $1", [created.request.id]);
    hookStatus = 422;
    await deliverPartnerWebhooks({ limit: 50 });
    row = (await query("SELECT attempts, failed_at IS NOT NULL AS failed FROM partner_webhook_outbox WHERE request_id = $1", [created.request.id]))
      .rows[0];
    expect(row).toEqual({ attempts: 2, failed: true });
    const audit = await query("SELECT count(*)::int AS n FROM audit_log WHERE request_id = $1 AND action = 'partner_webhook_failed'", [
      created.request.id,
    ]);
    expect(audit.rows[0].n).toBe(1);

    const other = (await (await create(post("/api/partner/requests", otherKey, body("ref-other")))).json()) as {
      request: { id: string };
    };
    expect(
      (await query("SELECT count(*)::int AS n FROM partner_webhook_outbox WHERE request_id = $1", [other.request.id])).rows[0].n,
    ).toBe(0);
  });
});

describe("Pipeline", () => {
  it("Partner-Datei läuft durch die vorhandene Analyse (Bericht mit Sicherheitsurteil)", async () => {
    const created = (await (await create(post("/api/partner/requests", apiKey, body("ref-a")))).json()) as {
      request: { id: string };
    };
    const real = await vi.importActual<typeof import("@/lib/analyze/run")>("@/lib/analyze/run");
    const reports = await real.analyzeRequest(created.request.id);
    expect(reports).toHaveLength(1);
    expect(["CLEAN", "SUSPICIOUS", "INFECTED"]).toContain(reports[0].security.verdict);
  });
});
