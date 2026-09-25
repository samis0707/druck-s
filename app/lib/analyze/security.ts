import { scanBuffer } from "../clamav";
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

/** Full security verdict: signature scan plus structural flags. */
export async function securityVerdict(
  fileName: string,
  mimeType: string,
  bytes: Buffer,
): Promise<SecurityFinding> {
  const reasons = structuralFlags(fileName, mimeType, bytes);
  const scan = await scanBuffer(bytes);
  if (scan.status === "INFECTED") {
    return { verdict: "INFECTED", reasons: [...reasons, `malware signature: ${scan.signature}`] };
  }
  if (scan.status === "UNAVAILABLE") {
    reasons.push(`malware scan unavailable (${scan.detail}) — manual check`);
  }
  const office =
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
    [".docx", ".xlsx", ".pptx"].some((e) => fileName.toLowerCase().endsWith(e));
  let verdict: SecurityVerdict = "CLEAN";
  if (reasons.length > 0) verdict = "SUSPICIOUS";
  if (office) {
    verdict = "SUSPICIOUS";
    if (!reasons.some((r) => r.startsWith("Office file"))) {
      reasons.push("office format needs manual prepress check");
    }
  }
  return { verdict, reasons };
}
