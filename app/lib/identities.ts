/** Staff-provisioned identities on the Better Auth user (role/status/firm). */
import type { PoolClient } from "pg";
import { query } from "./db";
import { getAuth } from "./auth/instance";
import type { IdentityStatus } from "./auth/roles";

export type { IdentityStatus };

export interface Identity {
  id: string;
  email: string;
  displayName: string | null;
  firm: string | null;
  role: string;
  status: IdentityStatus;
  createdAt: string;
}

const USER_COLS = `id, email, name AS "displayName", firm, role, status,
  "createdAt" AS "createdAt"`;

function row(r: Record<string, string>): Identity {
  return {
    id: r.id,
    email: r.email,
    displayName: r.displayName ?? null,
    firm: r.firm ?? null,
    role: r.role ?? "customer",
    status: (r.status ?? "customer") as IdentityStatus,
    createdAt: r.createdAt,
  };
}

export async function findIdentityByEmail(email: string): Promise<Identity | null> {
  const res = await query(`SELECT ${USER_COLS} FROM "user" WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return res.rows[0] ? row(res.rows[0]) : null;
}

export async function getIdentity(id: string): Promise<Identity | null> {
  const res = await query(`SELECT ${USER_COLS} FROM "user" WHERE id = $1`, [id]);
  return res.rows[0] ? row(res.rows[0]) : null;
}

/**
 * Staff creates a prospect record. Goes through Better Auth so the user
 * exists for OTP sign-in later; the app-level status gates verification.
 */
export async function createProspect(input: {
  email: string;
  displayName?: string | null;
  firm?: string | null;
  callerHeaders: Headers;
}): Promise<Identity> {
  const auth = getAuth();
  const created = (await auth.api.createUser({
    headers: input.callerHeaders,
    body: {
      email: input.email.toLowerCase(),
      name: input.displayName ?? input.email,
      role: "customer",
      data: { status: "prospect", firm: input.firm ?? null },
    },
  })) as { user?: { id: string } };
  const identity = await getIdentity(created.user?.id ?? "");
  if (!identity) throw new Error("Prospect creation failed");
  return identity;
}

/**
 * Offene Anfrage: Interessent anlegen, nachdem er seine E-Mail-Adresse per Code bestätigt hat.
 * Der Datensatz gibt keinen Zugang (Status „prospect“): Anmeldung, Auftragsansicht und Freigabe
 * verlangen weiterhin die Freischaltung durch die Druckerei. Er sorgt nur dafür, dass der
 * Interessent unter „Kunden & Links“ erscheint und mit einem Klick freigeschaltet werden kann.
 * Besteht schon ein Datensatz, bleibt er unverändert; leere Felder (Name, Firma) werden ergänzt.
 */
export async function ensureProspect(
  client: PoolClient,
  input: { email: string; displayName: string; firm: string | null },
): Promise<{ id: string; created: boolean }> {
  const email = input.email.toLowerCase();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO "user" (id, email, name, "emailVerified", role, status, firm)
     VALUES (gen_random_uuid(), $1, $2, true, 'customer', 'prospect', $3)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, input.displayName, input.firm],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await client.query<{ id: string }>(
    `UPDATE "user" SET name = COALESCE(NULLIF(name, ''), $2), firm = COALESCE(NULLIF(firm, ''), $3),
            "emailVerified" = true, "updatedAt" = now()
      WHERE email = $1 AND status = 'prospect' RETURNING id`,
    [email, input.displayName, input.firm],
  );
  if (!existing.rows[0]) throw new Error("Prospect record could not be created");
  return { id: existing.rows[0].id, created: false };
}

/** Prospect matures to customer on the same record; history follows it. */
export async function matureToCustomer(id: string): Promise<Identity> {
  const res = await query(
    `UPDATE "user" SET status = 'customer' WHERE id = $1 AND status = 'prospect'
     RETURNING ${USER_COLS}`,
    [id],
  );
  if (!res.rows[0]) throw new Error("Identity cannot mature (not a prospect or missing)");
  return row(res.rows[0]);
}

export async function disableIdentity(id: string): Promise<void> {
  await query(`UPDATE "user" SET status = 'disabled' WHERE id = $1`, [id]);
}

export async function findStaffByEmail(email: string): Promise<Identity | null> {
  const identity = await findIdentityByEmail(email);
  if (!identity || (identity.role !== "staff" && identity.role !== "admin")) return null;
  return identity;
}

export async function getStaff(id: string): Promise<Identity | null> {
  const identity = await getIdentity(id);
  if (!identity || (identity.role !== "staff" && identity.role !== "admin")) return null;
  return identity;
}
