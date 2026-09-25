import { notFound } from "@/lib/api";
import { bundleFileName, fileResponse, mimeFromName } from "@/lib/bundleFiles";
import { query } from "@/lib/db";
import { getRequestForViewer } from "@/lib/requestAccess";
import { getRequestFile } from "@/lib/storageFiles";

/** Rechnung eines versendeten Auftrags (Kunde: eigener Auftrag, Staff: alle). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getRequestForViewer(req, id);
  if ("error" in access) return access.error;
  const res = await query<{ invoice_key: string }>(
    "SELECT invoice_key FROM shipments WHERE request_id = $1",
    [id],
  );
  const key = res.rows[0]?.invoice_key;
  if (!key) return notFound("Invoice not found");
  const name = bundleFileName(key);
  return fileResponse(req, await getRequestFile(key), name, mimeFromName(name));
}
