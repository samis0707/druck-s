/** Per-file analysis report. One stored truth, two renderings (design §4). */

export type Severity = "green" | "yellow" | "red";
/**
 * PENDING: Virenprüfung steht noch aus (CLAMAV_MODE=batch, docs/virenscan.md) und es gibt keine
 * strukturellen Befunde. Mit strukturellen Befunden bleibt es SUSPICIOUS, `scan.status` sagt PENDING.
 */
export type SecurityVerdict = "CLEAN" | "SUSPICIOUS" | "INFECTED" | "PENDING";

/** Ergebnis der Signaturprüfung (ClamAV). Fehlt bei Berichten von vor dem Batch-Modus. */
export type ScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "UNAVAILABLE";

export interface ScanState {
  status: ScanStatus;
  /** daemon: synchron per clamd beim Intake; batch: später durch scripts/scan-pending.mjs. */
  mode: "daemon" | "batch";
  /** Nur INFECTED: Signaturname. */
  signature?: string;
  /** Batch: fehlgeschlagene Versuche bisher (nach SCAN_MAX_ATTEMPTS → UNAVAILABLE). */
  attempts?: number;
  /** Letzter Fehler (ohne Dateiinhalte), bei UNAVAILABLE der Grund. */
  error?: string;
  scannedAt?: string;
}

export interface PrintabilityFinding {
  check: "page_size" | "page_count" | "bleed" | "color_mode" | "fonts" | "resolution" | "dimensions" | "readability";
  severity: Severity;
  summary: string;
  pages?: number[];
}

export interface UniformityFinding {
  aspect: "trim_size" | "bleed" | "color_mode";
  consistent: boolean;
  deviatingPages: { page: number; value: string }[];
}

export interface SecurityFinding {
  verdict: SecurityVerdict;
  reasons: string[];
  scan?: ScanState;
}

export interface AnalysisReport {
  fileId: string;
  printability: Severity;
  findings: PrintabilityFinding[];
  uniformity: UniformityFinding[] | null;
  security: SecurityFinding;
  measuredAt: string;
}
