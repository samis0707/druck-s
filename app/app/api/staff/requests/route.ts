import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/guards";
import { query } from "@/lib/db";

/** Staff triage list, optionally filtered by status. Unverified drafts never appear. */
export async function GET(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await query(
    `SELECT r.id, r.number, r.product_hint AS "productHint", r.free_text AS "freeText",
            r.status, r.trust, r.origin, r.created_at AS "createdAt",
            COALESCE(u.email, r.prospect_email) AS email,
            (SELECT COUNT(*) FROM request_files f WHERE f.request_id = r.id) AS "fileCount",
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', f.id, 'fileName', f.file_name, 'mimeType', f.mime_type,
                'sizeBytes', f.size_bytes,
                'printability', ar.printability,
                'securityVerdict', ar.security->>'verdict'
              ) ORDER BY f.created_at)
              FROM request_files f LEFT JOIN analysis_reports ar ON ar.file_id = f.id
              WHERE f.request_id = r.id
            ), '[]') AS "files"
     FROM requests r LEFT JOIN "user" u ON u.id = r.customer_id
     WHERE r.status <> 'DRAFT' ${status ? "AND r.status = $1" : ""}
     ORDER BY r.created_at DESC`,
    status ? [status] : [],
  );
  return NextResponse.json({ requests: rows.rows });
}
