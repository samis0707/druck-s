import { notFound } from "./api";
import { getSessionUser } from "./auth/session";
import { getRequest } from "./requests/store";
import type { PrintRequest } from "./requests/types";

/** Auftrag laden für Eigentümer oder Staff; sonst 404 (kein Hinweis auf Existenz). */
export async function getRequestForViewer(
  req: Request,
  id: string,
): Promise<{ request: PrintRequest; isStaff: boolean } | { error: Response }> {
  const request = await getRequest(id);
  if (!request) return { error: notFound("Request not found") };
  const session = await getSessionUser(req.headers);
  const isStaff = session !== null && (session.role === "staff" || session.role === "admin");
  const isOwner = session !== null && session.role === "customer" && request.customerId === session.id;
  if (!isStaff && !isOwner) return { error: notFound("Request not found") };
  return { request, isStaff };
}
