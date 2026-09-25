/** Staff-provisioned identities on the Better Auth user (role/status/firm). */
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
