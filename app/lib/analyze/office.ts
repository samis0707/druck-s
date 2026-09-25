import { unzipSync } from "fflate";
import type { PrintabilityFinding } from "../analysis";

export interface OfficeInfo {
  kind: "docx" | "xlsx" | "pptx" | "unknown";
  unitCount: number;
  unitLabel: string;
  details: string[];
  sheets?: { name: string; rows: number }[];
}

/** Deterministic Office parsing via zip entries: counts, never layout. Pages are unknowable. */
export function parseOffice(fileName: string, bytes: Buffer): OfficeInfo {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch {
    return { kind: "unknown", unitCount: 0, unitLabel: "units", details: ["unreadable zip container"] };
  }
  const names = Object.keys(files);
  const text = (n: string) => Buffer.from(files[n] ?? []).toString("utf8");
  if (ext === "docx") {
    const paragraphs = (text("word/document.xml").match(/<w:p[\s>]/g) ?? []).length;
    const images = names.filter((n) => n.startsWith("word/media/")).length;
    const details = [`${paragraphs} paragraphs`, `${images} placed images`];
    return { kind: "docx", unitCount: paragraphs, unitLabel: "paragraphs", details };
  }
  if (ext === "xlsx") {
    const workbook = text("xl/workbook.xml");
    const sheetNames = [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => m[1]);
    const sheets = sheetNames.map((name, i) => {
      const xml = text(`xl/worksheets/sheet${i + 1}.xml`);
      return { name, rows: (xml.match(/<row[\s>]/g) ?? []).length };
    });
    const total = sheets.reduce((n, s) => n + s.rows, 0);
    return {
      kind: "xlsx",
      unitCount: total,
      unitLabel: "rows",
      details: sheets.map((s) => `${s.name}: ${s.rows} rows`),
      sheets,
    };
  }
  if (ext === "pptx") {
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
    return { kind: "pptx", unitCount: slides, unitLabel: "slides", details: [`${slides} slides`] };
  }
  return { kind: "unknown", unitCount: 0, unitLabel: "units", details: ["unsupported office type"] };
}

export function officeFindings(info: OfficeInfo): PrintabilityFinding[] {
  return [
    {
      check: "readability",
      severity: info.kind === "unknown" ? "red" : "yellow",
      summary:
        info.kind === "unknown"
          ? info.details.join("; ")
          : `${info.unitCount} ${info.unitLabel} counted (${info.details.join(", ")}); page count and layout are not machine-determinable, manual prepress check`,
    },
  ];
}
