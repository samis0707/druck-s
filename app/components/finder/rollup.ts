/**
 * Analyse-Rollup für den Staff-Finder (client-safe: keine Server-Imports).
 * Worst-of über alle Dateien eines Auftrags:
 * INFECTED > red > SUSPICIOUS/yellow > green/CLEAN > ohne Befund.
 */

export type RollupLevel = "withheld" | "problem" | "review" | "ok" | "pending";

export interface RollupFile {
  printability?: string | null;
  securityVerdict?: string | null;
}

export interface Rollup {
  level: RollupLevel;
  rank: number;
  label: string;
}

const LABEL: Record<RollupLevel, string> = {
  withheld: "Zurückgehalten",
  problem: "Problem",
  review: "Bitte prüfen",
  ok: "OK",
  pending: "Ausstehend",
};

export const ROLLUP_TOOLTIP =
  "Schlechtester Wert aller Dateien: Zurückgehalten (Sicherheit) vor Problem (Druckbarkeit) vor Bitte prüfen vor OK.";

function fileRank(file: RollupFile): number {
  if (file.securityVerdict === "INFECTED") return 4;
  if (file.printability === "red") return 3;
  if (file.securityVerdict === "SUSPICIOUS" || file.printability === "yellow") return 2;
  if (file.printability === "green" || file.securityVerdict === "CLEAN") return 1;
  return 0;
}

function levelOf(rank: number): RollupLevel {
  if (rank >= 4) return "withheld";
  if (rank === 3) return "problem";
  if (rank === 2) return "review";
  if (rank === 1) return "ok";
  return "pending";
}

/** Worst-of-Rollup über die Dateien eines Auftrags. */
export function rollupOf(files: RollupFile[]): Rollup {
  const rank = files.reduce((max, f) => Math.max(max, fileRank(f)), 0);
  const level = levelOf(rank);
  return { level, rank, label: LABEL[level] };
}

/** Einzeldatei-Rang für die Asset-Sortierung (Auffälligste zuerst). */
export function assetRank(file: RollupFile): number {
  return fileRank(file);
}

export function rollupTone(level: RollupLevel): "red" | "yellow" | "green" | "gray" {
  switch (level) {
    case "withheld":
      return "red";
    case "problem":
      return "red";
    case "review":
      return "yellow";
    case "ok":
      return "green";
    default:
      return "gray";
  }
}

/** CSS-Farbe der Schweregrad-Schiene (linke Kante) je Rollup-Stufe. */
export function rollupRail(level: RollupLevel): string {
  switch (level) {
    case "withheld":
    case "problem":
      return "var(--color-danger)";
    case "review":
      return "var(--color-warn)";
    case "ok":
      return "var(--color-brand-500)";
    default:
      return "var(--color-rule-strong)";
  }
}
