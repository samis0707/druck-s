"use client";

/* Daten laden bzw. Zustand abgleichen: setState in Effekten ist hier gewollt. */
/* eslint-disable react-hooks/set-state-in-effect */

/* pdf.js: eine Seite eines PDFs auf einen Canvas zeichnen (Design im Editor, Vorschau für Kunden). */

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

export function ladePdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    // Worker liegt in /public (scripts/copy-static-assets.mjs), passend zur installierten Version.
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

/** PDF-Dokument aus Bytes; wird bei neuen Bytes ersetzt und aufgeräumt. */
export function usePdfDokument(bytes: Uint8Array | null): { dokument: PDFDocumentProxy | null; fehler: string | null } {
  const [zustand, setZustand] = useState<{ dokument: PDFDocumentProxy | null; fehler: string | null }>({ dokument: null, fehler: null });
  useEffect(() => {
    if (!bytes) {
      setZustand({ dokument: null, fehler: null });
      return;
    }
    let abgebrochen = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    ladePdfJs()
      .then((pdfjs) => {
        // pdf.js übernimmt den Puffer; eine Kopie hält die Bytes für andere Nutzer intakt.
        task = pdfjs.getDocument({ data: bytes.slice() });
        return task.promise;
      })
      .then((doc) => {
        if (!abgebrochen) setZustand({ dokument: doc, fehler: null });
      })
      .catch(() => {
        if (!abgebrochen) setZustand({ dokument: null, fehler: "Das PDF konnte nicht angezeigt werden." });
      });
    return () => {
      abgebrochen = true;
      if (task) void task.destroy();
    };
  }, [bytes]);
  return zustand;
}

/**
 * Zeichnet Seite `seite` (ab 1) so, dass sie `breitePx` CSS-Pixel breit ist (scharf auch auf Retina).
 * Die Höhe folgt dem Seitenverhältnis des PDFs.
 */
export function PdfSeite({
  dokument,
  seite,
  breitePx,
  className,
  label,
  onGerendert,
}: {
  dokument: PDFDocumentProxy | null;
  seite: number;
  breitePx: number;
  className?: string;
  label?: string;
  onGerendert?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seiteVorhanden, setSeiteVorhanden] = useState(true);
  useEffect(() => {
    const canvas = ref.current;
    if (!dokument || !canvas || breitePx <= 0) return;
    if (seite < 1 || seite > dokument.numPages) {
      setSeiteVorhanden(false);
      return;
    }
    setSeiteVorhanden(true);
    let abgebrochen = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
    dokument
      .getPage(seite)
      .then((page) => {
        if (abgebrochen) return;
        const basis = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (breitePx / basis.width) * dpr });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${breitePx}px`;
        canvas.style.height = `${(basis.height / basis.width) * breitePx}px`;
        renderTask = page.render({ canvas, viewport });
        return renderTask.promise.then(() => {
          if (!abgebrochen) onGerendert?.();
        });
      })
      .catch(() => {
        /* abgebrochene Renderläufe sind normal */
      });
    return () => {
      abgebrochen = true;
      renderTask?.cancel();
    };
    // onGerendert bewusst nicht als Abhängigkeit: es ändert nichts am Bild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokument, seite, breitePx]);
  if (!seiteVorhanden) return null;
  return <canvas ref={ref} className={className} role="img" aria-label={label ?? `Seite ${seite}`} />;
}
