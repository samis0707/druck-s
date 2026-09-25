import { getAuth } from "./instance";

/** Authenticated caller as seen by Better Auth (single source of truth). */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  firm: string | null;
}

/**
 * Validate the session behind these headers (signature, expiry, owner state).
 * Disabled accounts lose access immediately — checked live on every call.
 */
export async function getSessionUser(reqHeaders: Headers): Promise<SessionUser | null> {
  const data = await getAuth().api.getSession({ headers: reqHeaders });
  if (!data?.user || !data.session) return null;
  const u = data.user as typeof data.user & {
    role?: string | null;
    status?: string | null;
    firm?: string | null;
  };
  if ((u.status ?? "customer") === "disabled") return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role: u.role ?? "customer",
    status: u.status ?? "customer",
    firm: u.firm ?? null,
  };
}

export function isStaff(user: SessionUser): boolean {
  return user.role === "staff" || user.role === "admin";
}
