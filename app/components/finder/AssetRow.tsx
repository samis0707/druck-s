"use client";

import { ViewTransition } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  File01Icon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PdfIcon,
  Presentation01Icon,
} from "@hugeicons/core-free-icons";
import { Badge, toneVariant } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, type FinderFile } from "./finder-state";
import { severityLabel, severityTone } from "@/lib/ui-text";

export function mimeIcon(mimeType: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf") return PdfIcon;
  if (mimeType.startsWith("image/")) return FileImageIcon;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ["xls", "xlsx", "csv"].includes(ext))
    return FileSpreadsheetIcon;
  if (mimeType.includes("presentation") || ["ppt", "pptx"].includes(ext)) return Presentation01Icon;
  if (mimeType.includes("word") || mimeType.includes("officedocument") || ["doc", "docx", "txt"].includes(ext))
    return FileTextIcon;
  return File01Icon;
}

/** Eine Asset-Zeile: Mime-Icon, Name/Meta, Schweregrad-Badge mit Tooltip, Detail-Link. */
export function AssetRow({
  file,
  detailHref,
  withheld,
  withholdReasons,
}: {
  file: FinderFile;
  detailHref: string;
  withheld: boolean;
  withholdReasons: string[];
}) {
  const Icon = mimeIcon(file.mimeType, file.fileName);
  const tone = severityTone(file.printability ?? "");
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
      <ViewTransition name={`asset-${file.id}`} share="morph" default="none">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Icon} size={18} aria-hidden="true" />
        </span>
      </ViewTransition>
      <div className="min-w-0 flex-1">
        <Link href={detailHref} className="block truncate font-medium underline-offset-4 hover:underline">
          {file.fileName}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {formatBytes(file.sizeBytes)}
          {withheld && withholdReasons.length > 0 ? ` · ${withholdReasons.join("; ")}` : null}
        </p>
      </div>
      {file.printability ? (
        <Tooltip>
          <TooltipTrigger render={<Badge variant={toneVariant(tone)} />}>
            {severityLabel(file.printability)}
          </TooltipTrigger>
          <TooltipContent>Druckbarkeit: {severityLabel(file.printability)}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
