import { ermittleClientIp } from "./clientIp";
import { config } from "./config";
import { forbidden, unauthorized } from "./api";
import { getSessionUser, isStaff } from "./auth/session";
import { authentifiziereKey } from "./kalkulation/keys";

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

/** Client-Adresse hinter den eigenen Proxys (Regeln und Begründung in lib/clientIp.ts). */
export function clientIp(req: Request): string {
  return ermittleClientIp(req.headers, config.clientIp);
}

/**
 * Guard für Maschinen-Routen der Kalkulation: `Authorization: Bearer kal_…` mit passendem Scope
 * (lib/kalkulation/keys.ts). 401 ohne gültigen Schlüssel, 403 bei fehlendem Scope.
 */
export async function requireKalkulationKey(req: Request, scope = "kalkulation") {
  const key = await authentifiziereKey(req.headers.get("authorization"));
  if (!key) {
    const res = unauthorized("Gültiger API-Schlüssel erforderlich");
    res.headers.set("www-authenticate", 'Bearer realm="druck-s kalkulation"');
    return { error: res } as const;
  }
  if (!key.scopes.includes(scope)) return { error: forbidden(`Scope „${scope}“ fehlt`) } as const;
  return { key } as const;
}
