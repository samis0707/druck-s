/** Per-file analysis report. One stored truth, two renderings (design §4). */

export type Severity = "green" | "yellow" | "red";
export type SecurityVerdict = "CLEAN" | "SUSPICIOUS" | "INFECTED";

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
}

export interface AnalysisReport {
  fileId: string;
  printability: Severity;
  findings: PrintabilityFinding[];
  uniformity: UniformityFinding[] | null;
  security: SecurityFinding;
  measuredAt: string;
}
