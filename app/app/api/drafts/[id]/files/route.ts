import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { addFile, getRequest, listFiles } from "@/lib/requests/store";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Stage one file onto a DRAFT. Cheap checks only; deep analysis runs after Send. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = await getRequest(id);
  if (!draft) return notFound("Draft not found");
  if (draft.status !== "DRAFT") return badRequest("This request was already sent");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const uploads = form.getAll("file").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return badRequest("Missing file field");
  const stored = [];
  for (const upload of uploads) {
    if (upload.size === 0) return badRequest("Empty file");
    if (upload.size > MAX_FILE_BYTES) return badRequest("File exceeds 100 MB");
    const fileName = upload.name || "upload.bin";
    const bytes = Buffer.from(await upload.arrayBuffer());
    stored.push(
      await addFile(id, {
        fileName,
        mimeType: upload.type || "application/octet-stream",
        bytes,
      }),
    );
  }
  const files = await listFiles(id);
  return NextResponse.json(
    {
      files: stored.map((s) => ({
        id: s.id,
        fileName: s.fileName,
        mimeType: s.mimeType,
        sizeBytes: Number(s.sizeBytes),
      })),
      fileCount: files.length,
    },
    { status: 201 },
  );
}
