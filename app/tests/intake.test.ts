import { describe, expect, it } from "vitest";

/**
 * Section 3 route tests (dual intake doors) on Better Auth. Requires:
 * - compose infra up (postgres, minio, mailpit, clamav)
 * - dev server on APP_TEST_URL (default http://localhost:3100)
 * Run: npm run test:int
 */
const BASE = process.env.APP_TEST_URL ?? "http://localhost:3100";
const MAILPIT = "http://localhost:8026";
const STAFF_EMAIL = "staff-intake@example.com";

async function mailpitCode(to: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/messages`);
  const data = (await res.json()) as {
    messages: { ID: string; To: { Address: string }[] }[];
  };
  // Mailpit lists newest first; parallel suites use distinct staff emails.
  const mine = data.messages.find((m) => m.To.some((t) => t.Address === to));
  if (!mine) throw new Error(`No mail for ${to}`);
  const full = (await (
    await fetch(`${MAILPIT}/api/v1/message/${mine.ID}`)
  ).json()) as { Text: string; Subject: string };
  return `${full.Subject} ${full.Text}`.match(/(\d{6})/)![1];
}

async function staffCookie(): Promise<string> {
  let res = await fetch(`${BASE}/api/staff/login/otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL }),
  });
  expect(res.status).toBe(201);
  const code = await mailpitCode(STAFF_EMAIL);
  res = await fetch(`${BASE}/api/staff/login/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL, code }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("better-auth.session_token");
  return cookie.split(";")[0];
}

function uploadForm(fields: Record<string, string>, fileName: string, content: string): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("file", new Blob([content], { type: "text/plain" }), fileName);
  return form;
}

describe("3.1 generic upload form", () => {
  it("stages a draft with no session", async () => {
    let res = await fetch(`${BASE}/api/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productHint: "flyer", freeText: "500x A5 please" }),
    });
    expect(res.status).toBe(201);
    const { draftId } = (await res.json()) as { draftId: string };
    expect(draftId).toBeTruthy();
    res = await fetch(`${BASE}/api/drafts/${draftId}/files`, {
      method: "POST",
      body: uploadForm({}, "note.txt", "hello print"),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { fileCount: number };
    expect(data.fileCount).toBe(1);
  });
});

describe("3.2 Door A verify at Send", () => {
  it("refuses unknown emails and binds onboarded ones", async () => {
    // Unknown email refused at OTP step.
    let res = await fetch(`${BASE}/api/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productHint: "flyer", freeText: "hi" }),
    });
    const { draftId } = (await res.json()) as { draftId: string };
    await fetch(`${BASE}/api/drafts/${draftId}/files`, {
      method: "POST",
      body: uploadForm({}, "a.txt", "x"),
    });
    res = await fetch(`${BASE}/api/drafts/${draftId}/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@example.com" }),
    });
    expect(res.status).toBe(403);

    // Onboarded customer (seeded directly): full flow.
    const email = `customer-${Date.now()}@example.com`;
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), LOWER($1), 'T', 'customer', 'customer')`,
      [email],
    );
    res = await fetch(`${BASE}/api/drafts/${draftId}/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(201);
    const code = await mailpitCode(email);
    res = await fetch(`${BASE}/api/drafts/${draftId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      request: { status: string; trust: string };
    };
    expect(data.request.status).toBe("RECEIVED");
    expect(data.request.trust).toBe("VERIFIED");
    expect(res.headers.get("set-cookie") ?? "").toContain("better-auth.session_token");
    // Reused code is single-use.
    res = await fetch(`${BASE}/api/drafts/${draftId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    expect(res.status).toBe(400);
  });
});

describe("3.3 staff one-time links", () => {
  it("creates, submits, dies, and guides afterwards", async () => {
    const cookie = await staffCookie();
    const email = `prospect-${Date.now()}@example.com`;
    let res = await fetch(`${BASE}/api/staff/upload-links`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ email, displayName: "P", firm: "Acme" }),
    });
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const token = url.split("/u/")[1];
    expect(token).toBeTruthy();

    res = await fetch(`${BASE}/api/upload-links/${token}`);
    expect(res.status).toBe(200);

    res = await fetch(`${BASE}/api/upload-links/${token}/files`, {
      method: "POST",
      body: uploadForm({}, "brief.txt", "campaign stuff"),
    });
    expect(res.status).toBe(201);
    const { draftId } = (await res.json()) as { draftId: string };

    res = await fetch(`${BASE}/api/upload-links/${token}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, productHint: "campaign", freeText: "all spring assets" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { request: { status: string; trust: string } };
    expect(data.request.status).toBe("RECEIVED");
    expect(data.request.trust).toBe("VOUCHED");

    // Link is dead: second submit and resolve both guide onwards.
    res = await fetch(`${BASE}/api/upload-links/${token}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, productHint: "x", freeText: "y" }),
    });
    expect(res.status).toBe(410);
    res = await fetch(`${BASE}/api/upload-links/${token}`);
    expect(res.status).toBe(410);
  });
});

describe("3.4 prospect maturation", () => {
  it("matures and binds vouched history", async () => {
    const cookie = await staffCookie();
    const email = `mature-${Date.now()}@example.com`;
    let res = await fetch(`${BASE}/api/staff/upload-links`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ email }),
    });
    const { url } = (await res.json()) as { url: string };
    const token = url.split("/u/")[1];
    const r = await fetch(`${BASE}/api/upload-links/${token}/files`, {
      method: "POST",
      body: uploadForm({}, "f.txt", "z"),
    });
    const { draftId } = (await r.json()) as { draftId: string };
    await fetch(`${BASE}/api/upload-links/${token}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, productHint: "flyer", freeText: "t" }),
    });
    const { query } = await import("@/lib/db");
    const idRow = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
    const identityId = idRow.rows[0].id;
    res = await fetch(`${BASE}/api/staff/identities/${identityId}`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const bound = await query<{ customer_id: string }>(
      "SELECT customer_id FROM requests WHERE prospect_email = $1",
      [email],
    );
    expect(bound.rows[0].customer_id).toBe(identityId);
  });
});
