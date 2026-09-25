import { describe, expect, it } from "vitest";

/**
 * 8.2 end-to-end verification: one full journey per door, routes only,
 * from upload to SHIPPED, asserting statuses, mails, versions, audit.
 * Run: npm run test:int
 */
const BASE = process.env.APP_TEST_URL ?? "http://localhost:3100";
const MAILPIT = "http://localhost:8026";
const STAFF_EMAIL = "staff-e2e@example.com";

async function latestCode(to: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/messages`);
  const data = (await res.json()) as {
    messages: { ID: string; To: { Address: string }[] }[];
  };
  const mine = data.messages.find((m) => m.To.some((t) => t.Address === to));
  if (!mine) throw new Error(`No mail for ${to}`);
  const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mine.ID}`)).json()) as {
    Text: string;
  };
  return full.Text.match(/(\d{6})/)![1];
}

async function staffCookie(): Promise<string> {
  let res = await fetch(`${BASE}/api/staff/login/otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL }),
  });
  expect(res.status).toBe(201);
  const code = await latestCode(STAFF_EMAIL);
  res = await fetch(`${BASE}/api/staff/login/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL, code }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function statusOf(id: string): Promise<string> {
  const { query } = await import("@/lib/db");
  const res = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [id]);
  return res.rows[0].status;
}

async function seedCustomer(email: string): Promise<void> {
  const { query } = await import("@/lib/db");
  await query('INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), LOWER($1), \'E\', \'customer\', \'customer\') ON CONFLICT (email) DO NOTHING', [
    email,
  ]);
}

describe("8.2 Door A full journey to shipped", () => {
  it("upload, verify, preview, confirm, approve, deliver", async () => {
    const email = `e2e-a-${Date.now()}@example.com`;
    await seedCustomer(email);
    const scookie = await staffCookie();

    // Upload + verify.
    let res = await fetch(`${BASE}/api/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productHint: "name-tag", freeText: "130 pcs" }),
    });
    const { draftId } = (await res.json()) as { draftId: string };
    const form = new FormData();
    form.set("file", new Blob(["%PDF-1.7 tags"], { type: "application/pdf" }), "tags.pdf");
    await fetch(`${BASE}/api/drafts/${draftId}/files`, { method: "POST", body: form });
    res = await fetch(`${BASE}/api/drafts/${draftId}/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(201);
    const code = await latestCode(email);
    res = await fetch(`${BASE}/api/drafts/${draftId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    expect(res.status).toBe(200);
    expect(await statusOf(draftId)).toBe("RECEIVED");

    // Staff preview via download.
    const { query } = await import("@/lib/db");
    const fileRow = await query<{ id: string }>(
      "SELECT id FROM request_files WHERE request_id = $1",
      [draftId],
    );
    res = await fetch(`${BASE}/api/staff/requests/${draftId}/files/${fileRow.rows[0].id}`, {
      headers: { cookie: scookie },
    });
    expect(res.status).toBe(200);
    expect(await statusOf(draftId)).toBe("IN_REVIEW");

    // Confirmation -> approval -> shipment with special-delivery date.
    const cform = new FormData();
    cform.set("confirmation", new Blob(["conf"], { type: "application/pdf" }), "conf.pdf");
    cform.append("printFile", new Blob(["print"], { type: "application/pdf" }), "print.pdf");
    res = await fetch(`${BASE}/api/staff/requests/${draftId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: cform,
    });
    expect(res.status).toBe(201);
    const ccookie = await (async () => {
      let r = await fetch(`${BASE}/api/login/otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const cd = await latestCode(email);
      r = await fetch(`${BASE}/api/login/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: cd }),
      });
      return (r.headers.get("set-cookie") ?? "").split(";")[0];
    })();
    res = await fetch(`${BASE}/api/requests/${draftId}/approval/otp`, {
      method: "POST",
      headers: { cookie: ccookie },
    });
    const acode = await latestCode(email);
    res = await fetch(`${BASE}/api/requests/${draftId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code: acode }),
    });
    expect(res.status).toBe(200);
    expect(await statusOf(draftId)).toBe("IN_PROGRESS");

    const sform = new FormData();
    sform.set("invoice", new Blob(["inv"], { type: "application/pdf" }), "inv.pdf");
    sform.set("specialDeliveryDate", "2026-10-01");
    res = await fetch(`${BASE}/api/staff/requests/${draftId}/shipment`, {
      method: "POST",
      headers: { cookie: scookie },
      body: sform,
    });
    expect(((await res.json()) as { shipped: boolean }).shipped).toBe(true);
    expect(await statusOf(draftId)).toBe("SHIPPED");

    // Audit covers the journey.
    const audit = await query<{ count: string }>(
      "SELECT COUNT(*) FROM audit_log WHERE request_id = $1",
      [draftId],
    );
    expect(Number(audit.rows[0].count)).toBeGreaterThanOrEqual(4);
  }, 180000);
});

describe("8.2 Door B full journey to shipped", () => {
  it("link, submit, mature, preview, confirm, approve, track", async () => {
    const email = `e2e-b-${Date.now()}@example.com`;
    const scookie = await staffCookie();
    let res = await fetch(`${BASE}/api/staff/upload-links`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: scookie },
      body: JSON.stringify({ email }),
    });
    const { url } = (await res.json()) as { url: string };
    const token = url.split("/u/")[1];

    const form = new FormData();
    form.set("file", new Blob(["campaign"], { type: "text/plain" }), "brief.txt");
    res = await fetch(`${BASE}/api/upload-links/${token}/files`, { method: "POST", body: form });
    const { draftId } = (await res.json()) as { draftId: string };
    res = await fetch(`${BASE}/api/upload-links/${token}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, productHint: "campaign", freeText: "spring" }),
    });
    expect(res.status).toBe(201);
    expect(await statusOf(draftId)).toBe("RECEIVED");

    // Mature, then the owner can approve later.
    const { query } = await import("@/lib/db");
    const idRow = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
    await fetch(`${BASE}/api/staff/identities/${idRow.rows[0].id}`, {
      method: "POST",
      headers: { cookie: scookie },
    });
    const fileRow = await query<{ id: string }>(
      "SELECT id FROM request_files WHERE request_id = $1",
      [draftId],
    );
    await fetch(`${BASE}/api/staff/requests/${draftId}/files/${fileRow.rows[0].id}`, {
      headers: { cookie: scookie },
    });
    expect(await statusOf(draftId)).toBe("IN_REVIEW");

    const cform = new FormData();
    cform.set("confirmation", new Blob(["conf"], { type: "application/pdf" }), "conf.pdf");
    cform.append("printFile", new Blob(["print"], { type: "application/pdf" }), "print.pdf");
    await fetch(`${BASE}/api/staff/requests/${draftId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: cform,
    });
    const ccookie = await (async () => {
      let r = await fetch(`${BASE}/api/login/otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const cd = await latestCode(email);
      r = await fetch(`${BASE}/api/login/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: cd }),
      });
      return (r.headers.get("set-cookie") ?? "").split(";")[0];
    })();
    res = await fetch(`${BASE}/api/requests/${draftId}/approval/otp`, {
      method: "POST",
      headers: { cookie: ccookie },
    });
    const acode = await latestCode(email);
    await fetch(`${BASE}/api/requests/${draftId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code: acode }),
    });
    expect(await statusOf(draftId)).toBe("IN_PROGRESS");

    const sform = new FormData();
    sform.set("invoice", new Blob(["inv"], { type: "application/pdf" }), "inv.pdf");
    sform.set("trackingNumber", "TRK-E2E");
    res = await fetch(`${BASE}/api/staff/requests/${draftId}/shipment`, {
      method: "POST",
      headers: { cookie: scookie },
      body: sform,
    });
    expect(((await res.json()) as { shipped: boolean }).shipped).toBe(true);
    expect(await statusOf(draftId)).toBe("SHIPPED");
  }, 180000);
});
