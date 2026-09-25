import type { PrintabilityFinding } from "../analysis";

export interface RasterInfo {
  format: string;
  widthPx: number | null;
  heightPx: number | null;
  colorMode: string | null;
  dpi: number | null;
  dpiSource: string | null;
}

/** Deterministic raster parsing (no rendering): PNG IHDR/pHYs, JPEG SOF/density. */
export function parseRaster(bytes: Buffer): RasterInfo {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return parsePng(bytes);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  if (bytes.subarray(0, 6).toString("ascii").match(/^GIF8/)) {
    return {
      format: "gif",
      widthPx: bytes.readUInt16LE(6),
      heightPx: bytes.readUInt16LE(8),
      colorMode: "indexed",
      dpi: null,
      dpiSource: null,
    };
  }
  return { format: "unknown", widthPx: null, heightPx: null, colorMode: null, dpi: null, dpiSource: null };
}

function parsePng(bytes: Buffer): RasterInfo {
  let width: number | null = null;
  let height: number | null = null;
  let colorMode: string | null = null;
  let dpi: number | null = null;
  let dpiSource: string | null = null;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR" && data.length >= 13) {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const ct = data[9];
      colorMode = ct === 2 ? "RGB" : ct === 6 ? "RGBA" : ct === 0 ? "grayscale" : `png-ct${ct}`;
    }
    if (type === "pHYs" && data.length >= 9 && data[8] === 1) {
      const ppm = data.readUInt32BE(0);
      dpi = Math.round(ppm * 0.0254);
      dpiSource = "pHYs chunk";
    }
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return { format: "png", widthPx: width, heightPx: height, colorMode, dpi, dpiSource };
}

function parseJpeg(bytes: Buffer): RasterInfo {
  let width: number | null = null;
  let height: number | null = null;
  let dpi: number | null = null;
  let dpiSource: string | null = null;
  let colorMode: string | null = "YCbCr";
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      height = bytes.readUInt16BE(offset + 5);
      width = bytes.readUInt16BE(offset + 7);
      const components = bytes[offset + 9];
      colorMode = components === 1 ? "grayscale" : components === 3 ? "YCbCr" : `jpeg-c${components}`;
    }
    if (marker === 0xe0 && length >= 14 && bytes.subarray(offset + 4, offset + 9).toString("ascii") === "JFIF\0") {
      const units = bytes[offset + 11];
      const xDensity = bytes.readUInt16BE(offset + 12);
      if (xDensity > 0 && units === 1) {
        dpi = xDensity;
        dpiSource = "JFIF density";
      } else if (xDensity > 0 && units === 2) {
        dpi = Math.round(xDensity * 2.54);
        dpiSource = "JFIF density (cm)";
      }
    }
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  return { format: "jpeg", widthPx: width, heightPx: height, colorMode, dpi, dpiSource };
}

export function rasterFindings(info: RasterInfo, fileName: string): PrintabilityFinding[] {
  const findings: PrintabilityFinding[] = [];
  if (info.widthPx === null || info.heightPx === null) {
    findings.push({
      check: "dimensions",
      severity: "yellow",
      summary: `${fileName}: dimensions not machine-readable, manual check`,
    });
    return findings;
  }
  findings.push({
    check: "dimensions",
    severity: "green",
    summary: `${info.widthPx} x ${info.heightPx} px (${info.format}, ${info.colorMode ?? "unknown mode"})`,
  });
  if (info.colorMode === "RGB" || info.colorMode === "RGBA" || info.colorMode === "YCbCr") {
    findings.push({
      check: "color_mode",
      severity: "yellow",
      summary: `${info.colorMode} will convert to CMYK at print`,
    });
  }
  if (info.dpi === null) {
    findings.push({
      check: "resolution",
      severity: "yellow",
      summary: "no density metadata — effective DPI depends on placed size, manual check",
    });
  } else if (info.dpi < 120) {
    findings.push({
      check: "resolution",
      severity: "red",
      summary: `${info.dpi} dpi (${info.dpiSource}) is too low for print`,
    });
  } else if (info.dpi < 300) {
    findings.push({
      check: "resolution",
      severity: "yellow",
      summary: `${info.dpi} dpi (${info.dpiSource}) is usable but below 300 dpi`,
    });
  } else {
    findings.push({ check: "resolution", severity: "green", summary: `${info.dpi} dpi (${info.dpiSource})` });
  }
  return findings;
}
