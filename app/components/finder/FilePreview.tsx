"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FullScreenIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { inlineSrc, isImage, isPdf } from "@/components/finder/preview";

/**
 * Dateivorschau: Bild oder eingebettetes PDF, sonst null (Aufrufer zeigt Icon + Download).
 * `inline` ist die kompakte Vorschau in Karten (mit „Vollbild“-Button), `fullscreen` füllt die Bühne des Quicklooks.
 */
export function FilePreview({
  fileName,
  mimeType,
  src,
  withheld,
  withholdReasons,
  variant = "inline",
  onFullscreen,
}: {
  fileName: string;
  mimeType: string;
  /** Download-URL; die Anzeige-Variante (`?inline=1`) leitet die Komponente selbst ab. */
  src: string;
  withheld: boolean;
  withholdReasons: string[];
  variant?: "inline" | "fullscreen";
  /** Nur inline: zeigt den „Vollbild“-Button. */
  onFullscreen?: () => void;
}) {
  if (withheld) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Vorschau möglich — zurückgehalten
        {withholdReasons.length > 0 ? `: ${withholdReasons.join("; ")}` : "."}
      </p>
    );
  }
  const fullscreen = variant === "fullscreen";
  const shown = inlineSrc(src);
  let body: React.ReactNode = null;
  if (isImage(mimeType)) {
    body = (
      // Dynamische, authentifizierte Datei-URLs — next/image-Optimierung greift hier nicht.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={shown}
        alt={`Vorschau ${fileName}`}
        loading={fullscreen ? "eager" : "lazy"}
        className={
          fullscreen
            ? "size-full object-contain"
            : "max-h-64 w-auto max-w-full rounded-xl border border-border object-contain"
        }
      />
    );
  } else if (isPdf(mimeType, fileName)) {
    body = (
      <embed
        src={shown}
        type="application/pdf"
        aria-label={`Vorschau ${fileName}`}
        className={fullscreen ? "size-full" : "h-64 w-full rounded-xl border border-border"}
      />
    );
  }
  if (!body) return null;
  if (fullscreen || !onFullscreen) return body;
  return (
    <div className="relative w-fit max-w-full">
      {body}
      <Button
        type="button"
        variant="secondary"
        size="xs"
        className="absolute top-2 right-2 shadow-sm"
        onClick={onFullscreen}
        aria-label={`${fileName} im Vollbild öffnen`}
      >
        <HugeiconsIcon icon={FullScreenIcon} aria-hidden="true" />
        Vollbild
      </Button>
    </div>
  );
}
