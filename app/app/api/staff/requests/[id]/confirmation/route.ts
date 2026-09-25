import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { clientIp, requireStaff } from "@/lib/guards";
import { getIdentity } from "@/lib/identities";
import { attachConfirmation } from "@/lib/approvalFlow";
import { getRequest } from "@/lib/requests/store";
import { MAX_FILE_BYTES } from "@/app/api/drafts/[id]/files/route";

/**
 * Staff attaches order confirmation (Auftragsbestätigung) + print files. This IS the send:
 * versions the bundle, moves to WAITING_APPROVAL, mails the customer.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const request = await getRequest(id);
  if (!request) return notFound("Auftrag nicht gefunden");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Erwartet wurde ein Formular mit Dateien (multipart).");
  }
  const confirmation = form.get("confirmation");
  if (!(confirmation instanceof File) || confirmation.size === 0) {
    return badRequest("Die Auftragsbestätigung fehlt.");
  }
  if (confirmation.size > MAX_FILE_BYTES) return badRequest("Die Auftragsbestätigung überschreitet 100 MB.");
  const prints = form
    .getAll("printFile")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (prints.length === 0) return badRequest("Mindestens eine Druckdatei ist erforderlich.");
  for (const f of prints) {
    if (f.size > MAX_FILE_BYTES) return badRequest(`Die Druckdatei ${f.name} überschreitet 100 MB.`);
  }
  const reason = form.get("reason");
  let customerEmail: string | null = null;
  if (request.customerId) {
    customerEmail = (await getIdentity(request.customerId))?.email ?? null;
  } else {
    customerEmail = request.prospectEmail;
  }
  if (!customerEmail) return badRequest("Der Auftrag hat keine Kunden-E-Mail-Adresse.");
  try {
    const bundle = await attachConfirmation({
      requestId: id,
      staffId: guard.user.id,
      staffEmail: "",
      customerEmail,
      confirmation: {
        fileName: confirmation.name,
        mimeType: confirmation.type || "application/pdf",
        bytes: Buffer.from(await confirmation.arrayBuffer()),
      },
      printFiles: await Promise.all(
        prints.map(async (f) => ({
          fileName: f.name,
          mimeType: f.type || "application/pdf",
          bytes: Buffer.from(await f.arrayBuffer()),
        })),
      ),
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      ip: clientIp(req),
    });
    return NextResponse.json(
      { bundle: { version: bundle.version, id: bundle.id } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && /Cannot attach confirmation/.test(err.message)) {
      return badRequest("Die Auftragsbestätigung kann in diesem Status nicht angehängt werden.");
    }
    throw err;
  }
}
