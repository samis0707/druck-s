import { query } from "../db";
import type { AnalysisReport, PrintabilityFinding, Severity, UniformityFinding } from "../analysis";
import { getRequestFile } from "../storageFiles";
import { FILE_COLS } from "../requests/store";
import type { RequestFile } from "../requests/types";
import { parsePdf, pdfFindings, pdfUniformity } from "./pdf";
import { parseRaster, rasterFindings } from "./raster";
import { officeFindings, parseOffice } from "./office";
import { securityVerdict } from "./security";

const REPORT_COLS = `file_id AS "fileId", printability, findings, uniformity, security,
  measured_at AS "measuredAt"`;

function rollup(findings: PrintabilityFinding[]): Severity {
  if (findings.some((f) => f.severity === "red")) return "red";
  if (findings.some((f) => f.severity === "yellow")) return "yellow";
  return "green";
}

function extOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

/** Analyze one stored file and persist its report (upsert by file). */
export async function analyzeFile(fileId: string): Promise<AnalysisReport> {
  const rows = await query<RequestFile>(`SELECT ${FILE_COLS} FROM request_files WHERE id = $1`, [
    fileId,
  ]);
  const file = rows.rows[0];
  if (!file) throw new Error("File not found");
  const bytes = await getRequestFile(file.storageKey);
  const ext = extOf(file.fileName);
  const mime = file.mimeType;

  let findings: PrintabilityFinding[];
  let uniformity: UniformityFinding[] | null = null;
  if (mime === "application/pdf" || ext === "pdf") {
    const datum = await parsePdf(new Uint8Array(bytes));
    findings = pdfFindings(datum, file.fileName);
    uniformity = pdfUniformity(datum);
  } else if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif"].includes(ext)
  ) {
    const info = parseRaster(bytes);
    findings = rasterFindings(info, file.fileName);
  } else if (["docx", "xlsx", "pptx"].includes(ext)) {
    const info = parseOffice(file.fileName, bytes);
    findings = officeFindings(info);
  } else {
    findings = [
      {
        check: "readability",
        severity: "yellow",
        summary: `${file.fileName}: no analyzer for this type, manual prepress check`,
      },
    ];
  }

  const security = await securityVerdict(file.fileName, mime, bytes);
  const report: Omit<AnalysisReport, "measuredAt"> & { measuredAt?: string } = {
    fileId: file.id,
    printability: rollup(findings),
    findings,
    uniformity,
    security,
  };
  const saved = await query<AnalysisReport>(
    `INSERT INTO analysis_reports (file_id, printability, findings, uniformity, security)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (file_id) DO UPDATE SET
       printability = EXCLUDED.printability, findings = EXCLUDED.findings,
       uniformity = EXCLUDED.uniformity, security = EXCLUDED.security,
       measured_at = now()
     RETURNING ${REPORT_COLS}`,
    [
      report.fileId,
      report.printability,
      JSON.stringify(report.findings),
      report.uniformity ? JSON.stringify(report.uniformity) : null,
      JSON.stringify(report.security),
    ],
  );
  return saved.rows[0];
}

/** Analyze every file of a request that has no report yet. */
export async function analyzeRequest(requestId: string): Promise<AnalysisReport[]> {
  const files = await query<RequestFile>(
    `SELECT ${FILE_COLS} FROM request_files f WHERE f.request_id = $1
     AND NOT EXISTS (SELECT 1 FROM analysis_reports r WHERE r.file_id = f.id)
     ORDER BY f.created_at ASC`,
    [requestId],
  );
  const reports: AnalysisReport[] = [];
  for (const file of files.rows) {
    reports.push(await analyzeFile(file.id));
  }
  return reports;
}

export async function getReport(fileId: string): Promise<AnalysisReport | null> {
  const res = await query<AnalysisReport>(
    `SELECT ${REPORT_COLS} FROM analysis_reports WHERE file_id = $1`,
    [fileId],
  );
  return res.rows[0] ?? null;
}
