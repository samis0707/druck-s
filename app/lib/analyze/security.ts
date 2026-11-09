import { scanBuffer } from "../clamav";
import { config, type ClamavMode } from "../config";
import type { SecurityFinding, SecurityVerdict } from "../analysis";

const EXTENSION_MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain"],
};

const PDF_RISKY = ["/JavaScript", "/JS", "/Launch", "/EmbeddedFiles", "/OpenAction", "/AA"];

/** MIME-vs-extension check plus format-specific risk flags. Never blocks — only reports. */
export function structuralFlags(fileName: string, mimeType: string, bytes: Buffer): string[] {
  const reasons: string[] = [];
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const expected = EXTENSION_MIME[ext];
  if (expected && !expected.includes(mimeType)) {
    reasons.push(`extension .${ext} does not match MIME type ${mimeType}`);
  }
  const head = bytes.subarray(0, 4096).toString("latin1");
  if (ext === "pdf" || mimeType === "application/pdf") {
    for (const flag of PDF_RISKY) {
      if (bytes.includes(Buffer.from(flag, "latin1"))) reasons.push(`PDF contains ${flag}`);
    }
    void head;
  }
  if (["docx", "xlsx", "pptx"].includes(ext)) {
    const raw = bytes.toString("latin1");
    if (raw.includes("vbaProject.bin")) reasons.push("Office file contains macros");
    if (raw.includes("embeddings/")) reasons.push("Office file contains embedded objects");
  }
  return reasons;
}

function isOffice(fileName: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
    [".docx", ".xlsx", ".pptx"].some((e) => fileName.toLowerCase().endsWith(e))
  );
}

/** Office-Dateien brauchen immer eine manuelle Druckvorstufen-Prüfung (eigener Grund, falls keiner da). */
function withOfficeReason(fileName: string, mimeType: string, reasons: string[]): string[] {
  if (isOffice(fileName, mimeType) && !reasons.some((r) => r.startsWith("Office file"))) {
    return [...reasons, "office format needs manual prepress check"];
  }
  return reasons;
}

/**
 * Batch-Modus: Strukturprüfung jetzt, Signaturprüfung später (scripts/scan-pending.mjs).
 * Ohne strukturelle Befunde PENDING („Virenprüfung läuft“), sonst SUSPICIOUS wie bisher;
 * `scan.status` ist in beiden Fällen PENDING. Der Job setzt danach CLEAN/SUSPICIOUS/INFECTED
 * nach denselben Regeln wie der Daemon-Pfad.
 */
export function pendingSecurity(fileName: string, mimeType: string, bytes: Buffer): SecurityFinding {
  const reasons = withOfficeReason(fileName, mimeType, structuralFlags(fileName, mimeType, bytes));
  return {
    verdict: reasons.length > 0 ? "SUSPICIOUS" : "PENDING",
    reasons,
    scan: { status: "PENDING", mode: "batch", attempts: 0 },
  };
}

/**
 * Full security verdict: signature scan plus structural flags.
 * CLAMAV_MODE=daemon (Standard): synchron per clamd. CLAMAV_MODE=batch: kein Scan, PENDING.
 */
export async function securityVerdict(
  fileName: string,
  mimeType: string,
  bytes: Buffer,
  mode: ClamavMode = config.clamav.mode,
): Promise<SecurityFinding> {
  if (mode === "batch") return pendingSecurity(fileName, mimeType, bytes);
  const reasons = structuralFlags(fileName, mimeType, bytes);
  const scan = await scanBuffer(bytes);
  const scannedAt = new Date().toISOString();
  if (scan.status === "INFECTED") {
    return {
      verdict: "INFECTED",
      reasons: [...reasons, `malware signature: ${scan.signature}`],
      scan: { status: "INFECTED", mode: "daemon", signature: scan.signature, scannedAt },
    };
  }
  if (scan.status === "UNAVAILABLE") {
    reasons.push(`malware scan unavailable (${scan.detail}) — manual check`);
  }
  const all = withOfficeReason(fileName, mimeType, reasons);
  let verdict: SecurityVerdict = "CLEAN";
  if (all.length > 0) verdict = "SUSPICIOUS";
  if (isOffice(fileName, mimeType)) verdict = "SUSPICIOUS";
  return {
    verdict,
    reasons: all,
    scan:
      scan.status === "UNAVAILABLE"
        ? { status: "UNAVAILABLE", mode: "daemon", error: scan.detail, scannedAt }
        : { status: "CLEAN", mode: "daemon", scannedAt },
  };
}
