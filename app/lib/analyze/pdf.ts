import { PDFDocument } from "pdf-lib";
import { decompressSync } from "fflate";
import type { PrintabilityFinding, UniformityFinding } from "../analysis";

const PT_PER_MM = 2.83465;
const BLEED_OK_MM = 3;

export interface PlacedImage {
  name: string;
  widthPx: number;
  heightPx: number;
  colorSpace: string;
  dpi: number | null;
}

export interface PdfPageDatum {
  page: number;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  sizeName: string | null;
}

export interface PdfDatum {
  pageCount: number;
  pages: PdfPageDatum[];
  fontsTotal: number;
  fontsEmbedded: number;
  colorModes: string[];
  images: PlacedImage[];
  corrupt: string | null;
}

const COMMON_SIZES: [string, number, number][] = [
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["A5", 148, 210],
  ["A6", 105, 148],
  ["DL", 99, 210],
  ["B5", 176, 250],
];

function sizeName(w: number, h: number): string | null {
  const [a, b] = w <= h ? [w, h] : [h, w];
  for (const [name, sw, sh] of COMMON_SIZES) {
    if (Math.abs(a - sw) <= 1 && Math.abs(b - sh) <= 1) return name;
  }
  return null;
}

/** objNum -> object body for all indirect objects. */
function parseObjects(raw: string): Map<string, string> {
  const objects = new Map<string, string>();
  const re = /(\d+)\s+\d+\s+obj([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) objects.set(m[1], m[2]);
  return objects;
}

function imageDictInfo(dict: string): { w: number; h: number; cs: string } | null {
  const w = dict.match(/\/Width\s+(\d+)/);
  const h = dict.match(/\/Height\s+(\d+)/);
  if (!w || !h) return null;
  const cs = dict.match(/\/ColorSpace\s*(\/[A-Za-z0-9]+|\[[^\]]{0,120}\])/);
  let colorSpace = cs?.[1] ?? "unknown";
  if (colorSpace.startsWith("/")) colorSpace = colorSpace.slice(1);
  if (colorSpace.startsWith("[")) {
    if (colorSpace.includes("DeviceRGB")) colorSpace = "DeviceRGB";
    else if (colorSpace.includes("DeviceCMYK")) colorSpace = "DeviceCMYK";
    else if (colorSpace.includes("DeviceGray")) colorSpace = "DeviceGray";
    else if (colorSpace.includes("Separation")) colorSpace = "Separation";
  }
  return { w: Number(w[1]), h: Number(h[1]), cs: colorSpace };
}

/** Decode all content streams (FlateDecode via fflate, plain otherwise) into operator text. */
export function decodeStreams(bytes: Buffer): string {
  const parts: string[] = [];
  const streamMark = Buffer.from("stream");
  const endMark = Buffer.from("endstream");
  let cursor = 0;
  while (cursor < bytes.length) {
    const start = bytes.indexOf(streamMark, cursor);
    if (start === -1) break;
    let dataStart = start + streamMark.length;
    if (bytes[dataStart] === 0x0d && bytes[dataStart + 1] === 0x0a) dataStart += 2;
    else if (bytes[dataStart] === 0x0a || bytes[dataStart] === 0x0d) dataStart += 1;
    const end = bytes.indexOf(endMark, dataStart);
    if (end === -1) break;
    let data = bytes.subarray(dataStart, end);
    while (data.length > 0 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
      data = data.subarray(0, data.length - 1);
    }
    try {
      parts.push(Buffer.from(decompressSync(new Uint8Array(data))).toString("latin1"));
    } catch {
      const text = data.toString("latin1");
      if (/cm|Do|\bRG\b|\bK\b/.test(text)) parts.push(text);
    }
    cursor = end + endMark.length;
  }
  return parts.join("\n");
}

/** Strippt String- und Hex-Literale aus Operator-Code in einem linearen Durchlauf.
 *  Die frühere Regex-Variante ist auf großen Dateien in V8-Backtracking
 *  gelaufen (RangeError: Maximum call stack size exceeded). Verschachtelte
 *  Klammern werden per Tiefenzähler korrekt behandelt. */
export function stripLiterals(code: string): string {
  const out: string[] = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === "(") {
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === "(") depth += 1;
        else if (code[i] === ")") depth -= 1;
        i += 1;
      }
      out.push("()");
      continue;
    }
    if (c === "<" && code[i + 1] !== "<") {
      let j = i + 1;
      let hex = true;
      while (j < n && code[j] !== ">") {
        const ch = code[j];
        if (!/[0-9a-fA-F\s]/.test(ch)) {
          hex = false;
          break;
        }
        j += 1;
      }
      if (hex && j < n) {
        out.push("<>");
        i = j + 1;
        continue;
      }
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}
/** name -> {placed width,height in points}, composing the graphics-state CTM.
 *  pdf-lib and friends emit stacked `cm` ops (translate * scale * ...), so the
 *  last `cm` alone is meaningless. We track q/Q blocks and multiply. */
export function placementMap(operators: string): Map<string, { wPt: number; hPt: number }> {
  const map = new Map<string, { wPt: number; hPt: number }>();
  type Matrix = [number, number, number, number, number, number];
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  const mul = (m1: Matrix, m2: Matrix): Matrix => [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
  const stack: Matrix[] = [];
  let ctm: Matrix = [...identity];
  // Strip string/hex literals so text content (e.g. a lone "q" in copy) never
  // disturbs graphics-state tracking (linear scan — regex blew the stack).
  const code = stripLiterals(operators);
  const token =
    /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm|\b(q|Q)\b|\/(\S+)\s+Do/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(code)) !== null) {
    if (m[7] !== undefined) {
      if (m[7] === "q") {
        stack.push(ctm);
      } else {
        const prev = stack.pop();
        if (prev) ctm = prev;
      }
    } else if (m[1] !== undefined) {
      const cm: Matrix = [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
      ];
      ctm = mul(ctm, cm);
    } else if (m[8] !== undefined) {
      map.set(m[8], {
        wPt: Math.hypot(ctm[0], ctm[1]),
        hPt: Math.hypot(ctm[2], ctm[3]),
      });
    }
  }
  return map;
}

function detectColorModes(raw: string, operators: string, images: PlacedImage[]): string[] {
  const modes = new Set<string>();
  const text = `${raw} ${operators}`;
  if (/\/(DeviceRGB|DefaultRGB)\b/.test(text) || /\brg\b/.test(operators) || /\bRG\b/.test(operators)) {
    modes.add("RGB");
  }
  if (/\/(DeviceCMYK|DefaultCMYK)\b/.test(text) || /(\bk\b|\bK\b)/.test(operators)) {
    modes.add("CMYK");
  }
  if (/\/(DeviceGray|DefaultGray)\b/.test(text) || /\bg\b|\bG\b/.test(operators)) modes.add("gray");
  if (/\/Separation\b/.test(text)) modes.add("spot");
  for (const img of images) {
    if (img.colorSpace === "DeviceRGB") modes.add("RGB");
    if (img.colorSpace === "DeviceCMYK") modes.add("CMYK");
    if (img.colorSpace === "DeviceGray") modes.add("gray");
  }
  return [...modes];
}

export async function parsePdf(input: Uint8Array): Promise<PdfDatum> {
  const bytes = Buffer.from(input);
  const raw = bytes.toString("latin1");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err) {
    return {
      pageCount: 0,
      pages: [],
      fontsTotal: 0,
      fontsEmbedded: 0,
      colorModes: [],
      images: [],
      corrupt: err instanceof Error ? err.message : "unreadable PDF",
    };
  }

  const pages: PdfPageDatum[] = [];
  const count = doc.getPageCount();
  for (let i = 0; i < count; i++) {
    const page = doc.getPage(i);
    const media = page.getMediaBox();
    const wMm = media.width / PT_PER_MM;
    const hMm = media.height / PT_PER_MM;
    let bleedMm = 0;
    try {
      const bleed = page.getBleedBox();
      const insetX = Math.min(bleed.x - media.x, media.x + media.width - (bleed.x + bleed.width));
      const insetY = Math.min(bleed.y - media.y, media.y + media.height - (bleed.y + bleed.height));
      bleedMm = Math.max(0, Math.min(insetX, insetY) / PT_PER_MM);
    } catch {
      bleedMm = 0;
    }
    pages.push({
      page: i + 1,
      widthMm: Math.round(wMm * 10) / 10,
      heightMm: Math.round(hMm * 10) / 10,
      bleedMm: Math.round(bleedMm * 10) / 10,
      sizeName: sizeName(wMm, hMm),
    });
  }

  // Fonts: BaseFont count vs FontFile(*) count (heuristic, labeled as such).
  const fontNames = [...raw.matchAll(/\/BaseFont\s*\/([^\s/>\]]+)/g)].map((m) => m[1]);
  const embeddedCount = (raw.match(/\/FontFile(2|3)?\b/g) ?? []).length;
  const fontsTotal = new Set(fontNames).size;
  const fontsEmbedded = Math.min(embeddedCount, fontsTotal);

  // Images: object dicts joined to XObject resource names.
  const objects = parseObjects(raw);
  const objImages = new Map<string, { w: number; h: number; cs: string }>();
  for (const [num, body] of objects) {
    if (!body.includes("/Subtype") || !body.includes("/Image")) continue;
    // Skip non-image XObjects (e.g. /Subtype /Form).
    if (!/\/Subtype\s*\/Image\b/.test(body)) continue;
    const info = imageDictInfo(body);
    if (info) objImages.set(num, info);
  }
  const nameToObj = new Map<string, string>();
  for (const body of objects.values()) {
    const xobj = body.match(/\/XObject\s*<<([\s\S]{0,4000}?)>>/);
    if (!xobj) continue;
    for (const m of xobj[1].matchAll(/\/(\S+)\s+(\d+)\s+\d+\s+R/g)) {
      nameToObj.set(m[1], m[2]);
    }
  }
  const operators = decodeStreams(bytes);
  const placements = placementMap(operators);
  const images: PlacedImage[] = [];
  for (const [name, objNum] of nameToObj) {
    const info = objImages.get(objNum);
    if (!info) continue;
    const placed = placements.get(name);
    images.push({
      name,
      widthPx: info.w,
      heightPx: info.h,
      colorSpace: info.cs,
      dpi:
        placed && placed.wPt > 0
          ? Math.round(info.w / (placed.wPt / 72))
          : null,
    });
  }

  const colorModes = detectColorModes(raw, operators, images);
  return { pageCount: count, pages, fontsTotal, fontsEmbedded, colorModes, images, corrupt: null };
}

export function pdfFindings(datum: PdfDatum, fileName: string): PrintabilityFinding[] {
  const findings: PrintabilityFinding[] = [];
  if (datum.corrupt) {
    return [
      {
        check: "readability",
        severity: "red",
        summary: `${fileName}: PDF cannot be parsed (${datum.corrupt})`,
      },
    ];
  }
  findings.push({
    check: "page_count",
    severity: "green",
    summary: `${datum.pageCount} page${datum.pageCount === 1 ? "" : "s"}`,
  });
  const sizes = new Set(datum.pages.map((p) => `${p.widthMm}x${p.heightMm}`));
  if (sizes.size <= 1) {
    const p = datum.pages[0];
    findings.push({
      check: "page_size",
      severity: "green",
      summary: p
        ? `all pages ${p.widthMm} x ${p.heightMm} mm${p.sizeName ? ` (${p.sizeName})` : ""}`
        : "no pages",
    });
  } else {
    const deviating = datum.pages.map((p) => `p.${p.page} ${p.widthMm}x${p.heightMm}`).join(", ");
    findings.push({
      check: "page_size",
      severity: "yellow",
      summary: `mixed page sizes: ${deviating}`,
    });
  }
  const minBleed = Math.min(...datum.pages.map((p) => p.bleedMm));
  findings.push({
    check: "bleed",
    severity: minBleed >= BLEED_OK_MM ? "green" : "yellow",
    summary:
      minBleed >= BLEED_OK_MM
        ? `bleed ${minBleed} mm on all pages`
        : `${minBleed} mm bleed (expected ${BLEED_OK_MM} mm) — confirm with prepress`,
  });
  if (datum.colorModes.length === 0) {
    findings.push({ check: "color_mode", severity: "yellow", summary: "color mode not detectable" });
  } else if (datum.colorModes.length === 1 && datum.colorModes[0] === "CMYK") {
    findings.push({ check: "color_mode", severity: "green", summary: "CMYK throughout" });
  } else {
    findings.push({
      check: "color_mode",
      severity: "yellow",
      summary: `${datum.colorModes.join(" + ")} detected — RGB/spot converts at print`,
    });
  }
  if (datum.fontsTotal === 0) {
    findings.push({ check: "fonts", severity: "green", summary: "no embedded fonts needed" });
  } else if (datum.fontsEmbedded >= datum.fontsTotal) {
    findings.push({
      check: "fonts",
      severity: "green",
      summary: `${datum.fontsEmbedded} of ${datum.fontsTotal} fonts embedded`,
    });
  } else {
    findings.push({
      check: "fonts",
      severity: "yellow",
      summary: `${datum.fontsEmbedded} of ${datum.fontsTotal} fonts embedded (heuristic) — missing fonts may reflow`,
    });
  }
  let worst: number | null = null;
  for (const img of datum.images) {
    if (img.dpi === null) {
      findings.push({
        check: "resolution",
        severity: "yellow",
        summary: `image ${img.name} ${img.widthPx}x${img.heightPx}px: placed size not auto-verifiable, manual check`,
      });
    } else {
      if (worst === null || img.dpi < worst) worst = img.dpi;
      if (img.dpi < 120) {
        findings.push({
          check: "resolution",
          severity: "red",
          summary: `image ${img.name} at ~${img.dpi} dpi is too low for print`,
        });
      } else if (img.dpi < 300) {
        findings.push({
          check: "resolution",
          severity: "yellow",
          summary: `image ${img.name} at ~${img.dpi} dpi is usable but below 300 dpi`,
        });
      } else {
        findings.push({
          check: "resolution",
          severity: "green",
          summary: `image ${img.name} at ~${img.dpi} dpi`,
        });
      }
    }
  }
  return findings;
}

export function pdfUniformity(datum: PdfDatum): UniformityFinding[] {
  if (datum.corrupt || datum.pages.length === 0) return [];
  const first = datum.pages[0];
  const sizeDeviants = datum.pages
    .filter((p) => `${p.widthMm}x${p.heightMm}` !== `${first.widthMm}x${first.heightMm}`)
    .map((p) => ({ page: p.page, value: `${p.widthMm}x${p.heightMm}mm` }));
  const bleedDeviants = datum.pages
    .filter((p) => p.bleedMm !== first.bleedMm)
    .map((p) => ({ page: p.page, value: `${p.bleedMm}mm` }));
  return [
    { aspect: "trim_size", consistent: sizeDeviants.length === 0, deviatingPages: sizeDeviants },
    { aspect: "bleed", consistent: bleedDeviants.length === 0, deviatingPages: bleedDeviants },
    { aspect: "color_mode", consistent: true, deviatingPages: [] },
  ];
}
