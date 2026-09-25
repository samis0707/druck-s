import { describe, expect, it } from "vitest";

/**
 * Section 5 tests (approval + shipping) on Better Auth.
 * Run: npm run test:int
 */
const BASE = process.env.APP_TEST_URL ?? "http://localhost:3100";
const MAILPIT = "http://localhost:8026";
const STAFF_EMAIL = "staff-approval@example.com";

interface MailMsg {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

async function latestMessage(to: string): Promise<MailMsg> {
  const res = await fetch(`${MAILPIT}/api/v1/messages`);
  const data = (await res.json()) as { messages: MailMsg[] };
  const mine = data.messages.find((m) => m.To.some((t) => t.Address === to));
  if (!mine) throw new Error(`No mail for ${to}`);
  return mine;
}

async function latestCode(to: string): Promise<string> {
  const mine = await latestMessage(to);
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

async function customerCookie(email: string): Promise<string> {
  let res = await fetch(`${BASE}/api/login/otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  expect(res.status).toBe(201);
  const code = await latestCode(email);
  res = await fetch(`${BASE}/api/login/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

function confirmationForm(reason?: string): FormData {
  const form = new FormData();
  form.set("confirmation", new Blob(["confirmation-pdf"], { type: "application/pdf" }), "best.pdf");
  form.append("printFile", new Blob(["print-1"], { type: "application/pdf" }), "print-1.pdf");
  form.append("printFile", new Blob(["print-2"], { type: "application/pdf" }), "print-2.pdf");
  if (reason) form.set("reason", reason);
  return form;
}

/** Fresh IN_REVIEW request owned by a new customer, via lib (fast setup). */
async function reviewFixture(tag: string) {
  const { query } = await import("@/lib/db");
  const email = `approve-${tag}-${Date.now()}@example.com`;
  await query(
    `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), LOWER($1), 'A', 'customer', 'customer')`,
    [email],
  );
  const { createDraft, addFile, submitDraft } = await import("@/lib/requests/store");
  const { recordPreview } = await import("@/lib/requests/workflow");
  const customerId = (
    await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])
  ).rows[0].id;
  const draft = await createDraft({
    productHint: "name-tag",
    freeText: "130 pcs",
    origin: "door_a",
    trust: "VERIFIED",
    customerId,
  });
  await addFile(draft.id, { fileName: "t.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 x") });
  await submitDraft(draft.id, { type: "system" });
  const staffRow = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
    STAFF_EMAIL,
  ]);
  await recordPreview({ requestId: draft.id, actorType: "staff", actorId: staffRow.rows[0].id });
  return { email, customerId, requestId: draft.id };
}

describe("5.1 attach triggers approval mail", () => {
  it("versions v1, moves to WAITING, mails PDFs", async () => {
    const f = await reviewFixture("a1");
    const cookie = await staffCookie();
    const res = await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie },
      body: confirmationForm(),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { bundle: { version: number } }).bundle.version).toBe(1);
    const { query } = await import("@/lib/db");
    const st = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [
      f.requestId,
    ]);
    expect(st.rows[0].status).toBe("WAITING_APPROVAL");
    const mail = await latestMessage(f.email);
    expect(mail.Subject).toMatch(/zur Freigabe/);
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
      Attachments: unknown[];
    };
    expect(full.Attachments).toHaveLength(3);
  });
});

describe("5.2 change request stays Waiting", () => {
  it("logs intent and returns a mailto payload", async () => {
    const f = await reviewFixture("a2");
    const scookie = await staffCookie();
    await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: confirmationForm(),
    });
    const ccookie = await customerCookie(f.email);
    const res = await fetch(`${BASE}/api/requests/${f.requestId}/change-request`, {
      method: "POST",
      headers: { cookie: ccookie },
    });
    expect(res.status).toBe(201);
    const { mailto } = (await res.json()) as { mailto: { to: string; subject: string; body: string } };
    expect(mailto.to).toContain("@");
    expect(mailto.subject).toMatch(/Änderungswunsch/);
    expect(mailto.body).toContain(f.requestId);
    const { query } = await import("@/lib/db");
    const st = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [
      f.requestId,
    ]);
    expect(st.rows[0].status).toBe("WAITING_APPROVAL");
  });
});

describe("5.3 replace resends with reason", () => {
  it("bumps to v2 and states the reason", async () => {
    const f = await reviewFixture("a3");
    const scookie = await staffCookie();
    await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: confirmationForm(),
    });
    const res = await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: confirmationForm("paper changed to 170g"),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { bundle: { version: number } }).bundle.version).toBe(2);
    const mail = await latestMessage(f.email);
    expect(mail.Subject).toMatch(/Geänderte/);
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
      Text: string;
    };
    expect(full.Text).toContain("paper changed to 170g");
  });
});

describe("5.4 OTP-gated approval", () => {
  it("rejects bad codes, approves once with receipts", async () => {
    const f = await reviewFixture("a4");
    const scookie = await staffCookie();
    await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: confirmationForm(),
    });
    const ccookie = await customerCookie(f.email);
    let res = await fetch(`${BASE}/api/requests/${f.requestId}/approval/otp`, {
      method: "POST",
      headers: { cookie: ccookie },
    });
    expect(res.status).toBe(201);
    // Wrong code rejected, status unchanged.
    res = await fetch(`${BASE}/api/requests/${f.requestId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code: "000000" }),
    });
    expect(res.status).toBe(400);
    const code = await latestCode(f.email);
    res = await fetch(`${BASE}/api/requests/${f.requestId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(200);
    const { query } = await import("@/lib/db");
    const st = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [
      f.requestId,
    ]);
    expect(st.rows[0].status).toBe("IN_PROGRESS");
    // Receipt to customer, notice to firm inbox.
    const receipt = await latestMessage(f.email);
    expect(receipt.Subject).toMatch(/freigegeben/);
    const notice = await latestMessage("print@example.com");
    expect(notice.Subject).toMatch(/Freigabe erteilt/);
    // Reused code rejected (consumed).
    res = await fetch(`${BASE}/api/requests/${f.requestId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(400);
  });
});

describe("5.5 shipped bundle", () => {
  it("needs invoice plus tracking or date, only from In Progress", async () => {
    const f = await reviewFixture("a5");
    const scookie = await staffCookie();
    // Early shipment from IN_REVIEW is rejected.
    let form = new FormData();
    form.set("invoice", new Blob(["inv"], { type: "application/pdf" }), "inv.pdf");
    form.set("trackingNumber", "TRK1");
    let res = await fetch(`${BASE}/api/staff/requests/${f.requestId}/shipment`, {
      method: "POST",
      headers: { cookie: scookie },
      body: form,
    });
    expect(res.status).toBe(400);

    // Move to IN_PROGRESS via approval.
    await fetch(`${BASE}/api/staff/requests/${f.requestId}/confirmation`, {
      method: "POST",
      headers: { cookie: scookie },
      body: confirmationForm(),
    });
    const ccookie = await customerCookie(f.email);
    res = await fetch(`${BASE}/api/requests/${f.requestId}/approval/otp`, {
      method: "POST",
      headers: { cookie: ccookie },
    });
    const code = await latestCode(f.email);
    await fetch(`${BASE}/api/requests/${f.requestId}/approval/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ccookie },
      body: JSON.stringify({ code }),
    });

    // Invoice alone: stored, not shipped.
    form = new FormData();
    form.set("invoice", new Blob(["inv"], { type: "application/pdf" }), "inv.pdf");
    res = await fetch(`${BASE}/api/staff/requests/${f.requestId}/shipment`, {
      method: "POST",
      headers: { cookie: scookie },
      body: form,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { shipped: boolean }).shipped).toBe(false);
    // Invoice-only sends no shipping mail: the newest mail is still the approval receipt.
    expect((await latestMessage(f.email)).Subject).toMatch(/freigegeben/);
    const { query } = await import("@/lib/db");
    const stored = await query<{ key: string | null }>(
      "SELECT detail->>'invoiceKey' AS key FROM request_events WHERE request_id = $1 AND event = 'invoice_attached'",
      [f.requestId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].key).toContain("invoice-");
    const detail = (await (await fetch(`${BASE}/api/requests/${f.requestId}`, { headers: { cookie: scookie } })).json()) as {
      invoicePending: boolean;
    };
    expect(detail.invoicePending).toBe(true);
    // The invoice is not downloadable before the shipment is complete.
    const hidden = await fetch(`${BASE}/api/requests/${f.requestId}/invoice`, { headers: { cookie: ccookie } });
    expect(hidden.status).toBe(404);

    // Tracking alone completes it (stored invoice is reused).
    form = new FormData();
    form.set("trackingNumber", "TRK-789");
    res = await fetch(`${BASE}/api/staff/requests/${f.requestId}/shipment`, {
      method: "POST",
      headers: { cookie: scookie },
      body: form,
    });
    expect(await res.json()).toEqual({ shipped: true, mailed: true });
    const shippedMsg = await latestMessage(f.email);
    expect(shippedMsg.Subject).toMatch(/versendet/);
    const shippedFull = (await (await fetch(`${MAILPIT}/api/v1/message/${shippedMsg.ID}`)).json()) as {
      Text: string;
      Attachments: { FileName: string }[];
    };
    expect(shippedFull.Text).toContain("TRK-789");
    expect(shippedFull.Attachments).toHaveLength(1);
    expect(shippedFull.Attachments[0].FileName).toBe("inv.pdf");
    const visible = await fetch(`${BASE}/api/requests/${f.requestId}/invoice`, { headers: { cookie: ccookie } });
    expect(visible.status).toBe(200);
    const st = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [
      f.requestId,
    ]);
    expect(st.rows[0].status).toBe("SHIPPED");
  });
});
