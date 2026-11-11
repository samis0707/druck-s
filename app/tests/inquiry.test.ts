import { describe, expect, it } from "vitest";

/**
 * Offene Anfrage (Interessenten-Einstieg), Ende zu Ende über die Schnittstelle /api/v1.
 * Braucht wie tests/intake.test.ts die Compose-Infrastruktur und den Dev-Server:
 *   npm run test:int
 */
const BASE = process.env.APP_TEST_URL ?? "http://localhost:3100";
const MAILPIT = "http://localhost:8026";

type Json = Record<string, unknown>;
type InquiryView = { id: string; status: string; number: string | null; confirmUrl: string; draft: null | { files: { name: string }[]; contact: { email: string } | null; codeSent: boolean } };

async function post(path: string, body?: unknown): Promise<{ status: number; json: Json; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json, headers: res.headers };
}

async function mails(to: string): Promise<{ Subject: string; Text: string }[]> {
  const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
    messages: { ID: string; To: { Address: string }[] }[];
  };
  const mine = list.messages.filter((m) => m.To.some((t) => t.Address === to));
  return Promise.all(
    mine.map(async (m) => (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Subject: string; Text: string }),
  );
}

/** Neuester Code an diese Adresse (Mailpit listet die neueste Mail zuerst). */
async function latestCode(to: string): Promise<string> {
  const mine = (await mails(to)).find((m) => m.Subject.startsWith("Ihr Bestätigungscode"));
  if (!mine) throw new Error(`No code mail for ${to}`);
  return mine.Subject.match(/(\d{6})/)![1];
}

async function db() {
  return (await import("@/lib/db")).query;
}

function contact(email: string) {
  return { name: "Ines Interessent", email, organisation: "Verein Beispiel e. V.", phone: "07131 5550" };
}

async function draft(email: string | null): Promise<InquiryView> {
  const res = await post("/api/v1/inquiries", {
    product: "flyer",
    description: "250 Flyer DIN A5, beidseitig, matt. Abholung nächste Woche.",
    ...(email ? { contact: contact(email) } : {}),
  });
  expect(res.status).toBe(201);
  return res.json.inquiry as InquiryView;
}

describe("offene Anfrage: Interessent ohne Kundenkonto", () => {
  it("führt in vier Schritten vom Entwurf zum Eingang und legt einen Interessenten an", async () => {
    const email = `interessent-${Date.now()}@example.com`;
    const inquiry = await draft(email);
    expect(inquiry.status).toBe("draft");
    expect(inquiry.number).toBeNull();
    expect(inquiry.confirmUrl).toBe(`${BASE}/anfrage/${inquiry.id}`);
    expect(inquiry.draft?.contact?.email).toBe(`i•••@example.com`);

    const form = new FormData();
    form.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "flyer.pdf");
    form.append("file", new Blob(["zweite Datei"], { type: "text/plain" }), "hinweis.txt");
    let res = await fetch(`${BASE}/api/v1/inquiries/${inquiry.id}/files`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const withFiles = ((await res.json()) as { inquiry: InquiryView }).inquiry;
    expect(withFiles.draft?.files.map((f) => f.name)).toEqual(["flyer.pdf", "hinweis.txt"]);

    // Ohne Code keine Bestätigung.
    let confirm = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: "000000" });
    expect(confirm.status).toBe(400);
    expect(confirm.json.code).toBe("code_required");

    const sent = await post(`/api/v1/inquiries/${inquiry.id}/code`);
    expect(sent.status).toBe(202);
    expect(sent.json).toMatchObject({ sent: true, sentTo: "i•••@example.com" });
    const code = await latestCode(email);

    // Falscher Code zählt als Fehlversuch und ändert nichts.
    const wrong = code === "111111" ? "222222" : "111111";
    confirm = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: wrong });
    expect(confirm.status).toBe(400);
    expect(confirm.json.code).toBe("invalid_code");
    expect(String(confirm.json.error)).toContain("4 attempts left");

    confirm = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code });
    expect(confirm.status).toBe(200);
    const confirmed = confirm.json.inquiry as InquiryView;
    expect(confirmed.status).toBe("received");
    expect(confirmed.number).toMatch(/^\d{6}-\d{3}$/);
    expect(confirmed.draft).toBeNull();
    expect(confirm.headers.get("set-cookie")).toBeNull();

    const query = await db();
    const row = (
      await query<{ origin: string; trust: string; prospect_email: string; customer_id: string | null; free_text: string }>(
        "SELECT origin, trust, prospect_email, customer_id, free_text FROM requests WHERE id = $1",
        [inquiry.id],
      )
    ).rows[0];
    expect(row).toMatchObject({ origin: "inquiry", trust: "VOUCHED", prospect_email: email, customer_id: null });
    expect(row.free_text).toContain("Anfrage ohne Kundenkonto");
    expect(row.free_text).toContain("Ines Interessent, Verein Beispiel e. V.");
    const user = (await query<{ status: string; role: string; name: string; firm: string }>(
      `SELECT status, role, name, firm FROM "user" WHERE email = $1`,
      [email],
    )).rows[0];
    expect(user).toEqual({ status: "prospect", role: "customer", name: "Ines Interessent", firm: "Verein Beispiel e. V." });
    const events = (await query<{ event: string }>("SELECT event FROM request_events WHERE request_id = $1 ORDER BY id", [inquiry.id])).rows;
    expect(events.map((e) => e.event)).toEqual(["draft_created", "inquiry_confirmed"]);
    expect((await query("SELECT 1 FROM inquiry_codes WHERE request_id = $1", [inquiry.id])).rowCount).toBe(0);

    // Zweite Bestätigung und weitere Änderungen sind gesperrt; der Stand bleibt abrufbar.
    confirm = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code });
    expect(confirm.status).toBe(409);
    expect((await post(`/api/v1/inquiries/${inquiry.id}/code`)).status).toBe(409);
    res = await fetch(`${BASE}/api/v1/inquiries/${inquiry.id}`);
    expect(((await res.json()) as { inquiry: InquiryView }).inquiry).toMatchObject({ status: "received", draft: null });

    // Eingangsbestätigung an den Interessenten, Hinweis an das Team.
    const own = await mails(email);
    expect(own.some((m) => m.Subject === `Ihre Anfrage ${confirmed.number} ist eingegangen`)).toBe(true);
    const team = await mails(process.env.FIRM_INBOX ?? "print@example.com");
    expect(team.some((m) => m.Subject.startsWith(`Neue Anfrage ${confirmed.number} von Ines Interessent`))).toBe(true);
  });

  it("gibt dem Interessenten keinen Zugang: weder Anmeldung noch Auftragsansicht", async () => {
    const email = `ohne-zugang-${Date.now()}@example.com`;
    const inquiry = await draft(email);
    await post(`/api/v1/inquiries/${inquiry.id}/code`);
    expect((await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: await latestCode(email) })).status).toBe(200);

    expect((await post("/api/login/otp", { email })).status).toBe(403);
    expect((await fetch(`${BASE}/api/requests/${inquiry.id}`)).status).toBe(404);
    // Die allgemeine Upload-Tür leitet solche Adressen weiter zur offenen Anfrage.
    const created = await post("/api/drafts", { productHint: "flyer", freeText: "noch einer" });
    const otp = await post(`/api/drafts/${created.json.draftId}/otp`, { email });
    expect(otp.status).toBe(403);
    expect(otp.json.code).toBe("not_activated");
  });

  it("bindet die Anfrage nach der Freischaltung an das Kundenkonto", async () => {
    const email = `freischalten-${Date.now()}@example.com`;
    const staff = "staff-inquiry@example.com";
    const query = await db();
    await query(
      `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'S', 'staff', 'customer') ON CONFLICT (email) DO NOTHING`,
      [staff],
    );
    const inquiry = await draft(email);
    await post(`/api/v1/inquiries/${inquiry.id}/code`);
    await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: await latestCode(email) });

    expect((await post("/api/staff/login/otp", { email: staff })).status).toBe(201);
    const staffMail = (await mails(staff))[0];
    const login = await post("/api/staff/login/verify", { email: staff, code: `${staffMail.Subject} ${staffMail.Text}`.match(/(\d{6})/)![1] });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const id = (await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])).rows[0].id;
    const matured = await fetch(`${BASE}/api/staff/identities/${id}`, { method: "POST", headers: { cookie } });
    expect(matured.status).toBe(200);

    const row = (await query<{ customer_id: string }>("SELECT customer_id FROM requests WHERE id = $1", [inquiry.id])).rows[0];
    expect(row.customer_id).toBe(id);
    expect((await post("/api/login/otp", { email })).status).toBe(201);
  });
});

describe("offene Anfrage: bekannte Adressen", () => {
  it("ordnet die Anfrage einem freigeschalteten Kundenkonto zu, ohne Sitzung", async () => {
    const email = `kundin-${Date.now()}@example.com`;
    const query = await db();
    const id = (
      await query<{ id: string }>(
        `INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'K', 'customer', 'customer') RETURNING id`,
        [email],
      )
    ).rows[0].id;
    const inquiry = await draft(email);
    await post(`/api/v1/inquiries/${inquiry.id}/code`);
    const confirm = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: await latestCode(email) });
    expect(confirm.status).toBe(200);
    expect(String(confirm.json.message)).toContain("Kundenkonto");
    expect(confirm.headers.get("set-cookie")).toBeNull();
    const row = (
      await query<{ origin: string; trust: string; customer_id: string; prospect_email: string | null }>(
        "SELECT origin, trust, customer_id, prospect_email FROM requests WHERE id = $1",
        [inquiry.id],
      )
    ).rows[0];
    expect(row).toEqual({ origin: "door_a", trust: "VERIFIED", customer_id: id, prospect_email: null });
  });

  it("lehnt gesperrte Adressen und Team-Adressen ab", async () => {
    const query = await db();
    const gesperrt = `gesperrt-${Date.now()}@example.com`;
    const team = `team-${Date.now()}@example.com`;
    await query(`INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'G', 'customer', 'disabled')`, [gesperrt]);
    await query(`INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'T', 'staff', 'customer')`, [team]);
    let res = await post(`/api/v1/inquiries/${(await draft(gesperrt)).id}/code`);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("account_disabled");
    res = await post(`/api/v1/inquiries/${(await draft(team)).id}/code`);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("staff_account");
  });
});

describe("offene Anfrage: Grenzen und Fehler", () => {
  it("meldet ungültige Eingaben mit Code und Feldliste", async () => {
    let res = await post("/api/v1/inquiries", { product: "raumschiff", description: "" });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("invalid_body");
    expect((res.json.details as string[]).length).toBe(2);
    const raw = await fetch(`${BASE}/api/v1/inquiries`, { method: "POST", headers: { "content-type": "application/json" }, body: "{kaputt" });
    expect(((await raw.json()) as Json).code).toBe("invalid_json");
    res = await post(`/api/v1/inquiries/${(await draft(null)).id}/code`);
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("contact_required");
    res = await post("/api/v1/inquiries/keine-uuid/code");
    expect(res.status).toBe(404);
    expect((await fetch(`${BASE}/api/v1/inquiries/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    res = await post(`/api/v1/inquiries/${(await draft(null)).id}/confirm`, { code: "12" });
    expect(res.json.code).toBe("invalid_body");
  });

  it("nimmt den Kontakt auch erst beim Code-Versand an und sperrt nach fünf Fehlversuchen", async () => {
    const email = `spaeter-${Date.now()}@example.com`;
    const inquiry = await draft(null);
    const sent = await post(`/api/v1/inquiries/${inquiry.id}/code`, { contact: { name: "Später Kontakt", email } });
    expect(sent.status).toBe(202);
    const code = await latestCode(email);
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) {
      const res = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: wrong });
      expect(res.json.code).toBe("invalid_code");
    }
    // Auch der richtige Code hilft jetzt nicht mehr; ein neuer muss her.
    let res = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code });
    expect(res.status).toBe(410);
    expect(res.json.code).toBe("code_expired");
    expect((await post(`/api/v1/inquiries/${inquiry.id}/code`)).status).toBe(202);
    res = await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: await latestCode(email) });
    expect(res.status).toBe(200);
  });

  it("begrenzt Code-Mails je Anfrage und macht den vorigen Code ungültig", async () => {
    const email = `flut-${Date.now()}@example.com`;
    const inquiry = await draft(email);
    expect((await post(`/api/v1/inquiries/${inquiry.id}/code`)).status).toBe(202);
    const first = await latestCode(email);
    expect((await post(`/api/v1/inquiries/${inquiry.id}/code`)).status).toBe(202);
    const second = await latestCode(email);
    if (first !== second) {
      expect((await post(`/api/v1/inquiries/${inquiry.id}/confirm`, { code: first })).json.code).toBe("invalid_code");
    }
    for (let i = 0; i < 3; i += 1) expect((await post(`/api/v1/inquiries/${inquiry.id}/code`)).status).toBe(202);
    const blocked = await post(`/api/v1/inquiries/${inquiry.id}/code`);
    expect(blocked.status).toBe(429);
    expect(blocked.json.code).toBe("rate_limited");
    expect(blocked.headers.get("retry-after")).toBe("3600");
  });

  it("zeigt Einmal-Link- und Partner-Aufträge nicht über die offene Schnittstelle", async () => {
    const query = await db();
    const foreign = (
      await query<{ id: string }>(
        `INSERT INTO requests (trust, origin, product_hint, free_text, status) VALUES ('VERIFIED', 'door_a', 'flyer', 'fremd', 'RECEIVED') RETURNING id`,
      )
    ).rows[0].id;
    expect((await fetch(`${BASE}/api/v1/inquiries/${foreign}`)).status).toBe(404);
    expect((await post(`/api/v1/inquiries/${foreign}/code`)).status).toBe(404);
    await query("DELETE FROM requests WHERE id = $1", [foreign]);
  });

  it("liefert Beschreibung und Oberfläche der Schnittstelle aus", async () => {
    const spec = (await (await fetch(`${BASE}/api/v1/openapi.json`)).json()) as { openapi: string; paths: Json };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/api/v1/inquiries/{id}/confirm");
    const docs = await fetch(`${BASE}/api/docs`);
    expect(docs.headers.get("content-type")).toContain("text/html");
    expect(await docs.text()).toContain("/api/v1/openapi.json");
    expect((await fetch(`${BASE}/swagger/swagger-ui-bundle.js`)).status).toBe(200);
    const robots = await (await fetch(`${BASE}/robots.txt`)).text();
    expect(robots).toContain("Allow: /api/v1/");
    expect(robots).toContain("Disallow: /anfrage/");
  });
});
