import { getReport } from "./analyze/run";
import { getRequestFile } from "./storageFiles";
import { FILE_COLS } from "./requests/store";
import { query } from "./db";
import type { RequestFile } from "./requests/types";
import type { AnalysisReport } from "./analysis";

export class WithheldError extends Error {
  constructor(public readonly reasons: string[]) {
    super("This file is withheld from download");
    this.name = "WithheldError";
  }
}

/** Load a file row with its report (report may be missing if analysis is pending). */
export async function getFileWithReport(
  fileId: string,
): Promise<{ file: RequestFile; report: AnalysisReport | null }> {
  const res = await query<RequestFile>(`SELECT ${FILE_COLS} FROM request_files WHERE id = $1`, [
    fileId,
  ]);
  const file = res.rows[0];
  if (!file) throw new Error("File not found");
  return { file, report: await getReport(fileId) };
}

/**
 * INFECTED files are never served to anyone. Everyone else gets bytes;
 * the caller decides the wording (staff: ask customer for fresh export,
 * customer: please export a fresh copy).
 */
export async function assertServable(report: AnalysisReport | null): Promise<void> {
  if (report?.security.verdict === "INFECTED") {
    throw new WithheldError(report.security.reasons);
  }
}

export async function readFileBytes(file: RequestFile): Promise<Buffer> {
  return getRequestFile(file.storageKey);
}
