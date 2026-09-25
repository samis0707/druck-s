import { fileResponse } from "@/lib/bundleFiles";
import { forbidden, notFound } from "@/lib/api";
import { requireStaff } from "@/lib/guards";
import { assertServable, getFileWithReport, readFileBytes, WithheldError } from "@/lib/files";
import { getRequest } from "@/lib/requests/store";
import { recordPreview } from "@/lib/requests/workflow";

/** Staff file download. First staff preview moves RECEIVED to IN_REVIEW. INFECTED is withheld. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const { id, fileId } = await ctx.params;
  const request = await getRequest(id);
  if (!request) return notFound("Request not found");
  let file;
  try {
    const loaded = await getFileWithReport(fileId);
    if (loaded.file.requestId !== id) return notFound("File not found");
    await assertServable(loaded.report);
    file = loaded.file;
  } catch (err) {
    if (err instanceof WithheldError) {
      return forbidden(`Withheld for safety (${err.reasons.join("; ")}). Ask the customer for a fresh export.`);
    }
    throw err;
  }
  await recordPreview({ requestId: id, actorType: "staff", actorId: guard.user.id });
  return fileResponse(req, await readFileBytes(file), file.fileName, file.mimeType);
}
