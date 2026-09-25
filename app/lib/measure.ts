import { listFiles, getRequest, readFileBytes } from "./requests/store";
import { parsePdf } from "./analyze/pdf";
import { parseOffice } from "./analyze/office";
import { parseRaster } from "./analyze/raster";

export interface FileMeasure {
  fileName: string;
  kind: "pdf" | "xlsx" | "docx" | "pptx" | "image" | "other";
  pages?: number;
  sheets?: { name: string; rows: number }[];
  rows?: number;
  paragraphs?: number;
  slides?: number;
  widthPx?: number | null;
  heightPx?: number | null;
}

export interface RequestMeasure {
  fileCount: number;
  files: FileMeasure[];
  /** Bare numbers found in the free text (counts to reconcile, not truths). */
  textNumbers: number[];
}

function kindOf(fileName: string, mime: string): FileMeasure["kind"] {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "xlsx") return "xlsx";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif"].includes(ext)) return "image";
  return "other";
}

/** Deterministic measurements from stored artifacts. Every number is traceable. */
export async function measureRequest(requestId: string): Promise<RequestMeasure> {
  const request = await getRequest(requestId);
  if (!request) throw new Error("Request not found");
  const files = await listFiles(requestId);
  const measures: FileMeasure[] = [];
  for (const file of files) {
    const kind = kindOf(file.fileName, file.mimeType);
    const base = { fileName: file.fileName, kind };
    if (kind === "other") {
      measures.push(base);
      continue;
    }
    const bytes = await readFileBytes(file);
    if (kind === "pdf") {
      const datum = await parsePdf(new Uint8Array(bytes));
      measures.push({ ...base, pages: datum.corrupt ? 0 : datum.pageCount });
    } else if (kind === "image") {
      const info = parseRaster(bytes);
      measures.push({ ...base, widthPx: info.widthPx, heightPx: info.heightPx });
    } else {
      const info = parseOffice(file.fileName, bytes);
      if (kind === "xlsx") measures.push({ ...base, sheets: info.sheets ?? [], rows: info.unitCount });
      else if (kind === "docx") measures.push({ ...base, paragraphs: info.unitCount });
      else measures.push({ ...base, slides: info.unitCount });
    }
  }
  const textNumbers = [...request.freeText.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) =>
    Number(m[0].replace(",", ".")),
  );
  return { fileCount: files.length, files: measures, textNumbers };
}
