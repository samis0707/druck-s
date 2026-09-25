"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FilePreview } from "@/components/finder/FilePreview";
import { mimeIcon } from "@/components/finder/AssetRow";
import { formatBytes } from "@/components/finder/finder-state";
import { isPreviewable, stepIndex, type PreviewItem } from "@/components/finder/preview";
import "./quicklook.css";

/**
 * Vollbild-Quicklook: blättert beliebige Dateien (Kunde, Staff, Auftragsbestätigung, Druckdateien).
 * ←/→ blättern, Esc schließt (Dialog); bei nicht anzeigbaren Typen Icon + Download.
 */
export function Quicklook({
  open,
  onOpenChange,
  items,
  index,
  onIndex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PreviewItem[];
  index: number;
  onIndex: (index: number) => void;
}) {
  const shown = open && items.length > 0;

  useEffect(() => {
    if (!shown) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndex(stepIndex(index, 1, items.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndex(stepIndex(index, -1, items.length));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, index, items.length, onIndex]);

  const item = items[Math.min(index, items.length - 1)];
  return (
    <Dialog open={shown} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none p-0 ring-0 sm:max-w-none"
      >
        {item && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate leading-tight">{item.name}</DialogTitle>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="tabular-nums">
                    {index + 1} von {items.length}
                    {item.sizeBytes !== undefined ? ` · ${formatBytes(item.sizeBytes)}` : ""}
                  </span>
                  {item.group && <span>{item.group}</span>}
                  {item.badges?.map((b) => (
                    <Badge key={b.label} variant={toneVariant(b.tone)}>
                      {b.label}
                    </Badge>
                  ))}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {!item.withheld && (
                  <Button nativeButton={false} render={<a href={item.src} download />} variant="outline" size="sm">
                    <HugeiconsIcon icon={Download01Icon} aria-hidden="true" />
                    Herunterladen
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Vorherige Datei"
                  disabled={index <= 0}
                  onClick={() => onIndex(stepIndex(index, -1, items.length))}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Nächste Datei"
                  disabled={index >= items.length - 1}
                  onClick={() => onIndex(stepIndex(index, 1, items.length))}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" />
                </Button>
                <DialogClose render={<Button variant="secondary" size="sm" />}>Schließen</DialogClose>
              </div>
            </div>
            <div className="quicklook-stage">
              <div key={item.id} className="quicklook-stage-fill">
                {item.withheld ? (
                  <div className="quicklook-stage-fallback">
                    <FilePreview
                      fileName={item.name}
                      mimeType={item.mimeType}
                      src={item.src}
                      withheld
                      withholdReasons={item.withholdReasons ?? []}
                      variant="fullscreen"
                    />
                  </div>
                ) : isPreviewable(item.mimeType, item.name) ? (
                  <FilePreview
                    fileName={item.name}
                    mimeType={item.mimeType}
                    src={item.src}
                    withheld={false}
                    withholdReasons={[]}
                    variant="fullscreen"
                  />
                ) : (
                  <div className="quicklook-stage-fallback">
                    <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
                      <HugeiconsIcon icon={mimeIcon(item.mimeType, item.name)} size={30} aria-hidden="true" />
                    </span>
                    <p className="max-w-md break-words text-sm font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Keine Vorschau für diesen Dateityp — bitte herunterladen.
                    </p>
                    <Button nativeButton={false} render={<a href={item.src} download />}>
                      <HugeiconsIcon icon={Download01Icon} aria-hidden="true" />
                      Herunterladen
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <p className="hidden items-center gap-1.5 border-t border-border px-4 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="kbd">←</span> <span className="kbd">→</span> blättern · <span className="kbd">Esc</span>{" "}
              schließen
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
