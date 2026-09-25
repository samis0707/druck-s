import { fileResponse } from "@/lib/bundleFiles";
import { forbidden, notFound } from "@/lib/api";
import { requireCustomer } from "@/lib/guards";
import { assertServable, getFileWithReport, readFileBytes, WithheldError } from "@/lib/files";
import { getRequest } from "@/lib/requests/store";
import { recordPreview } from "@/lib/requests/workflow";

/** Owner file download. INFECTED files are withheld with re-export guidance. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const { id, fileId } = await ctx.params;
  const request = await getRequest(id);
  if (!request || request.customerId !== guard.user.id) {
    return notFound("Request not found");
  }
  let file;
  try {
    const loaded = await getFileWithReport(fileId);
    if (loaded.file.requestId !== id) return notFound("File not found");
    await assertServable(loaded.report);
    file = loaded.file;
  } catch (err) {
    if (err instanceof WithheldError) {
      return forbidden(
        "This file was flagged by the security scan and cannot be downloaded. Please export a fresh copy and upload it again.",
      );
    }
    throw err;
  }
  await recordPreview({ requestId: id, actorType: "customer", actorId: guard.user.id });
  return fileResponse(req, await readFileBytes(file), file.fileName, file.mimeType);
}
