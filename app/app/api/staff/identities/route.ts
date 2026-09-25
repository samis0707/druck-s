import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/guards";
import { query } from "@/lib/db";

/** Staff-Kundenverzeichnis fürs Backoffice. */
export async function GET(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const res = await query(
    `SELECT u.id, u.email, u.name AS "displayName", u.firm, u.status,
       (SELECT COUNT(*) FROM requests r WHERE r.customer_id = u.id OR r.prospect_email = u.email) AS "requestCount",
       (SELECT row_to_json(h) FROM (
          SELECT id, imported_at AS "importedAt", order_count AS "orderCount"
          FROM history_imports WHERE identity_id = u.id ORDER BY imported_at DESC LIMIT 1
        ) h) AS "latestDump"
     FROM "user" u ORDER BY u."createdAt" DESC`,
  );
  return NextResponse.json({ identities: res.rows });
}
