import { NextResponse } from "next/server";

/** Anzeigename aus dem Storage-Key (`bundles/<id>/v1-print-0-<uuid>-<name>`). */
export function bundleFileName(key: string): string {
  const base = key.split("/").pop() ?? key;
  return base
    .replace(/^v\d+-(?:confirmation|print-\d+)-[0-9a-f-]{36}-/, "")
    .replace(/^invoice-[0-9a-f-]{36}-/, "");
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  zip: "application/zip",
  ai: "application/postscript",
  eps: "application/postscript",
};

export function mimeFromName(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Datei-Antwort; `?inline=1` liefert zur Anzeige im Vorschau-Fenster statt als Download. */
export function fileResponse(req: Request, bytes: Buffer, fileName: string, mimeType: string): NextResponse {
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
