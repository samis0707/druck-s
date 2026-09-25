import { forbidden, unauthorized } from "./api";
import { getSessionUser, isStaff } from "./auth/session";

/** Guard for staff-only Route Handlers. */
export async function requireStaff(req: Request) {
  const user = await getSessionUser(req.headers);
  if (!user) return { error: unauthorized() } as const;
  if (!isStaff(user)) return { error: forbidden("Staff access required") } as const;
  return { user } as const;
}

/** Guard for customer Route Handlers. */
export async function requireCustomer(req: Request) {
  const user = await getSessionUser(req.headers);
  if (!user) return { error: unauthorized() } as const;
  if (user.role !== "customer") return { error: forbidden("Customer login required") } as const;
  return { user } as const;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
