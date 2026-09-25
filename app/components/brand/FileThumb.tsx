"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { mimeIcon } from "@/components/finder/AssetRow";

/** Größer als das lohnt keine Vorschau im Browser (Upload-Limit ist 100 MB). */
const MAX_PDF_PREVIEW_BYTES = 25 * 1024 * 1024;
const THUMB_WIDTH = 240;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function renderPdfFirstPage(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker liegt in /public (Kopie per scripts/copy-pdf-worker.mjs), passend zur installierten Version.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    void task.destroy();
  }
}

/** Vorschau einer lokalen Datei: Bild direkt, PDF erste Seite, sonst Dateityp-Icon. */
export function FileThumb({ file, scanning }: { file: File; scanning: boolean }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        if (file.type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(file);
          if (aktiv) setSrc(objectUrl);
        } else if (isPdf(file) && file.size <= MAX_PDF_PREVIEW_BYTES) {
          const url = await renderPdfFirstPage(file);
          if (aktiv) setSrc(url);
        }
      } catch {
        /* Keine Vorschau möglich (defekte oder verschlüsselte Datei) — Icon bleibt. */
      }
    })();
    return () => {
      aktiv = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-(--color-rule-strong) bg-white shadow-(--shadow-e1)">
      {src ? (
        // Lokale Blob-/Data-URL — next/image bringt hier nichts.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-muted text-muted-foreground">
          <HugeiconsIcon icon={mimeIcon(file.type, file.name)} size={26} aria-hidden="true" />
        </span>
      )}
      {scanning && <span className="file-scan" aria-hidden="true" />}
    </div>
  );
}
