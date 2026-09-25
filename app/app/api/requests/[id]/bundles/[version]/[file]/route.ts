import { notFound } from "@/lib/api";
import { bundleFileName, fileResponse, mimeFromName } from "@/lib/bundleFiles";
import { getRequestForViewer } from "@/lib/requestAccess";
import { listBundles } from "@/lib/requests/workflow";
import { getRequestFile } from "@/lib/storageFiles";

/**
 * Auftragsbestätigung und Druckdateien einer Bundle-Version (`confirmation` | `print-<n>`).
 * Kunde nur eigene Aufträge, Staff alle.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; version: string; file: string }> },
) {
  const { id, version, file } = await ctx.params;
  const access = await getRequestForViewer(req, id);
  if ("error" in access) return access.error;
  const bundle = (await listBundles(id)).find((b) => String(b.version) === version);
  if (!bundle) return notFound("Bundle not found");
  let key: string | undefined;
  if (file === "confirmation") key = bundle.confirmationKey;
  else {
    const m = file.match(/^print-(\d+)$/);
    if (m) key = bundle.printFileKeys[Number(m[1])];
  }
  if (!key) return notFound("File not found");
  const name = bundleFileName(key);
  return fileResponse(req, await getRequestFile(key), name, mimeFromName(name));
}
