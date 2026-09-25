import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { requireStaff } from "@/lib/guards";
import { findIdentityByEmail } from "@/lib/identities";
import { importHistoryBundle } from "@/lib/historyImport";

/** Staff uploads a per-customer MIS history dump (raw XML kept, derivations automatic). */
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const email = form.get("email");
  const dump = form.get("dump");
  if (typeof email !== "string" || !email.trim()) return badRequest("email is required");
  if (!(dump instanceof File) || dump.size === 0) return badRequest("Missing dump file");
  if (dump.size > 10 * 1024 * 1024) return badRequest("Dump exceeds 10 MB");
  const identity = await findIdentityByEmail(email.trim().toLowerCase());
  if (!identity) return notFound("Identity not found");
  const xml = Buffer.from(await dump.arrayBuffer()).toString("utf8");
  const { import: record, orders } = await importHistoryBundle({
    identityId: identity.id,
    xml,
    fileName: dump.name || "mis-export.xml",
  });
  return NextResponse.json(
    { importId: record.id, orderCount: orders.length },
    { status: 201 },
  );
}
