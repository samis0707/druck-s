import { NextResponse } from "next/server";
import { badRequest, gone, notFound } from "@/lib/api";
import { getIdentity } from "@/lib/identities";
import { resolveLink } from "@/lib/links";
import { addFile, createDraft, getRequest, listFiles } from "@/lib/requests/store";
import { MAX_FILE_BYTES } from "@/app/api/drafts/[id]/files/route";

/**
 * Door B staging: first call creates the vouched draft, later calls add files.
 * Pass draftId to append; hint/text are finalized at submit.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const link = await resolveLink(token);
  if (!link || link.state !== "active") {
    return link ? gone("This upload link can no longer be used.") : notFound("Link not found");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const draftId = form.get("draftId");
  let draft =
    typeof draftId === "string" && draftId ? await getRequest(draftId) : null;
  if (draftId && !draft) return notFound("Draft not found");
  if (draft && (draft.status !== "DRAFT" || draft.linkId !== link.id)) {
    return badRequest("This draft cannot accept more files");
  }
  if (!draft) {
    const identity = await getIdentity(link.identityId);
    if (!identity) return notFound("Link owner not found");
    draft = await createDraft({
      productHint: "",
      freeText: "",
      origin: "door_b",
      trust: "VOUCHED",
      prospectEmail: identity.email,
      linkId: link.id,
    });
  }
  const uploads = form.getAll("file").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return badRequest("Missing file field");
  for (const upload of uploads) {
    if (upload.size === 0) return badRequest("Empty file");
    if (upload.size > MAX_FILE_BYTES) return badRequest("File exceeds 100 MB");
    await addFile(draft.id, {
      fileName: upload.name || "upload.bin",
      mimeType: upload.type || "application/octet-stream",
      bytes: Buffer.from(await upload.arrayBuffer()),
    });
  }
  const files = await listFiles(draft.id);
  return NextResponse.json({ draftId: draft.id, fileCount: files.length }, { status: 201 });
}
