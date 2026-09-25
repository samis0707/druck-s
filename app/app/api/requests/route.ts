import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/guards";
import { query } from "@/lib/db";

/** Eigene Aufträge des angemeldeten Kunden (Übersicht). */
export async function GET(req: Request) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const rows = await query(
    `SELECT r.id, r.number, r.product_hint AS "productHint", r.free_text AS "freeText",
            r.status, r.created_at AS "createdAt",
            (SELECT COUNT(*) FROM request_files f WHERE f.request_id = r.id) AS "fileCount"
     FROM requests r
     WHERE r.customer_id = $1 AND r.status <> 'DRAFT'
     ORDER BY r.created_at DESC`,
    [guard.user.id],
  );
  return NextResponse.json({ requests: rows.rows });
}
