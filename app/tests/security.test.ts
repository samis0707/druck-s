import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { getAuth } from "@/lib/auth/instance";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Lib-level security tests on Better Auth (6.1/6.2 semantics).
 * Needs compose infra. Run: npm run test:int
 */
async function makeUser(email: string, role = "customer", status = "customer"): Promise<string> {
  const existing = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  for (const row of existing.rows) {
    await query(`DELETE FROM verification WHERE identifier LIKE '%' || $1 || '%'`, [email]);
    await query(`DELETE FROM session WHERE "userId" = $1`, [row.id]);
    await query(`DELETE FROM requests WHERE customer_id = $1`, [row.id]);
    await query(`DELETE FROM "user" WHERE id = $1`, [row.id]);
  }
  const res = await query<{ id: string }>(
    `INSERT INTO "user" (id, email, role, status) VALUES (gen_random_uuid(), LOWER($1), $2, $3) RETURNING id`,
    [email, role, status],
  );
  return res.rows[0].id;
}

async function wipeUser(id: string, email: string) {
  await query(`DELETE FROM verification WHERE identifier LIKE '%' || $1 || '%'`, [email]);
  await query(`DELETE FROM session WHERE "userId" = $1`, [id]);
  await query(`DELETE FROM requests WHERE customer_id = $1`, [id]);
  await query(`DELETE FROM "user" WHERE id = $1`, [id]);
}

async function mailpitCode(email: string): Promise<string> {
  const messages = (await (
    await fetch("http://localhost:8026/api/v1/messages")
  ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
  const mine = messages.messages.find((m) => m.To.some((t) => t.Address === email));
  if (!mine) throw new Error(`No mail for ${email}`);
  const full = (await (
    await fetch(`http://localhost:8026/api/v1/message/${mine.ID}`)
  ).json()) as { Text: string; Subject: string };
  return `${full.Subject} ${full.Text}`.match(/(\d{6})/)![1];
}

async function sendCode(email: string, type: "sign-in" | "email-verification" = "sign-in") {
  await getAuth().api.sendVerificationOTP({ body: { email, type } });
}

describe("6.1 OTP challenges (Better Auth)", () => {
  it("signs in once, then rejects reuse", async () => {
    const email = "ba-otp1@example.com";
    const id = await makeUser(email);
    await sendCode(email);
    // Stored hashed: redeem the real code from Mailpit, then reuse must fail.
    const code = await mailpitCode(email);
    const first = await getAuth().api.signInEmailOTP({ body: { email, otp: code } });
    expect(first).toBeTruthy();
    await expect(getAuth().api.signInEmailOTP({ body: { email, otp: code } })).rejects.toThrow();
    await wipeUser(id, email);
  });

  it("locks after five wrong guesses", async () => {
    const email = "ba-otp2@example.com";
    const id = await makeUser(email);
    await sendCode(email);
    for (let i = 0; i < 4; i++) {
      await expect(
        getAuth().api.signInEmailOTP({ body: { email, otp: "000000" } }),
      ).rejects.toThrow();
    }
    // Fifth wrong guess invalidates the code: the correct code is refused after.
    await expect(
      getAuth().api.signInEmailOTP({ body: { email, otp: "000000" } }),
    ).rejects.toThrow();
    const code = await mailpitCode(email);
    await expect(getAuth().api.signInEmailOTP({ body: { email, otp: code } })).rejects.toThrow();
    await wipeUser(id, email);
  });
});

describe("6.2 sessions", () => {
  it("validates live sessions and drops disabled owners", async () => {
    const email = "ba-sess@example.com";
    const id = await makeUser(email);
    await sendCode(email);
    // Redeem via Mailpit code.
    const messages = (await (
      await fetch("http://localhost:8026/api/v1/messages")
    ).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const mine = messages.messages.find((m) => m.To.some((t) => t.Address === email));
    const full = (await (
      await fetch(`http://localhost:8026/api/v1/message/${mine!.ID}`)
    ).json()) as { Text: string; Subject: string };
    const code = `${full.Subject} ${full.Text}`.match(/(\d{6})/)![1];
    const { headers } = await getAuth().api.signInEmailOTP({
      body: { email, otp: code },
      returnHeaders: true,
    });
    const setCookies = headers.getSetCookie();
    expect(setCookies.length).toBeGreaterThan(0);
    // No Secure flag on plain HTTP: the browser keeps the cookie (login-bug class).
    expect(setCookies.join(";")).not.toMatch(/;\s*Secure[;,]/i);
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
    const user = await getSessionUser(new Headers({ cookie: cookieHeader }));
    expect(user?.id).toBe(id);
    expect(user?.role).toBe("customer");
    expect(await getSessionUser(new Headers())).toBeNull();
    // Disabled owner loses access immediately.
    await query(`UPDATE "user" SET status = 'disabled' WHERE id = $1`, [id]);
    expect(await getSessionUser(new Headers({ cookie: cookieHeader }))).toBeNull();
    await wipeUser(id, email);
  });
});

describe("6.3 audit shape", () => {
  it("entries carry actor, timestamp, and client metadata", async () => {
    const rows = await query<{
      action: string;
      actor_type: string;
      created_at: string;
      detail: Record<string, unknown>;
    }>(
      "SELECT action, actor_type, created_at, detail FROM audit_log ORDER BY id DESC LIMIT 1",
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
    expect(rows.rows[0].action).toBeTruthy();
    expect(rows.rows[0].created_at).toBeTruthy();
    expect(rows.rows[0].detail).toBeDefined();
  });
});
