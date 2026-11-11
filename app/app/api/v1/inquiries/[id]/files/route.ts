import { inquiryError, inquiryFailure, inquiryJson } from "@/lib/inquiry/http";
import { getInquiry, requireOpenDraft } from "@/lib/inquiry/intake";
import { MAX_FILE_BYTES } from "@/lib/limits";
import { addFile, listFiles } from "@/lib/requests/store";

export const dynamic = "force-dynamic";

/** Dateien je Anfrage. Großzügig für echte Aufträge, eng genug gegen Missbrauch. */
const MAX_FILES = 20;

/** Offene Anfrage, Schritt 2 (optional): Dateien anhängen. Feldname `file`, mehrfach möglich. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await requireOpenDraft(id);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return inquiryError(400, "invalid_body", "Expected multipart/form-data with one or more 'file' fields");
    }
    const uploads = form.getAll("file").filter((f): f is File => f instanceof File);
    if (uploads.length === 0) return inquiryError(400, "invalid_body", "Missing 'file' field");
    const existing = await listFiles(id);
    if (existing.length + uploads.length > MAX_FILES) {
      return inquiryError(400, "too_many_files", `An inquiry can hold at most ${MAX_FILES} files`);
    }
    for (const upload of uploads) {
      if (upload.size === 0) return inquiryError(400, "empty_file", `${upload.name || "file"} is empty`);
      if (upload.size > MAX_FILE_BYTES) {
        return inquiryError(413, "file_too_large", `${upload.name || "file"} exceeds 100 MB`);
      }
    }
    for (const upload of uploads) {
      await addFile(id, {
        fileName: upload.name || "upload.bin",
        mimeType: upload.type || "application/octet-stream",
        bytes: Buffer.from(await upload.arrayBuffer()),
      });
    }
    return inquiryJson({ inquiry: await getInquiry(id) }, 201);
  } catch (err) {
    return inquiryFailure(err, "Datei-Upload");
  }
}
