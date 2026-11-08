/**
 * Partner-Datei laden (SSRF-geschützt): nur HTTPS auf Port 443, nur exakt freigegebene Hosts,
 * keine Weiterleitungen, keine privaten/lokalen Zieladressen (geprüft auf die tatsächlich
 * verbundene IP über `lookup`, schützt auch gegen DNS-Rebinding), Größenlimit beim Streamen,
 * Zeitlimit, SHA-256-Abgleich. Fehlertexte enthalten nie die URL (signierte URLs tragen Tokens).
 */
import { createHash } from "node:crypto";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { MAX_FILE_BYTES } from "../limits";

export class PartnerFileError extends Error {
  constructor(
    message: string,
    /** 400 = Anfrage unzulässig (Host), 422 = Datei nicht ladbar oder passt nicht. */
    public readonly status: 400 | 422,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PartnerFileError";
  }
}

const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(addr, prefix, "ipv6");
}

/** Private, lokale, reservierte oder Dokumentations-Adresse? (IPv4-mapped IPv6 wird entpackt.) */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return BLOCKED.check(mapped[1], "ipv4");
    if (/^::ffff:/i.test(ip)) return true;
    return BLOCKED.check(ip, "ipv6");
  }
  return BLOCKED.check(ip, "ipv4");
}

/** URL gegen die Freigabeliste des Partners prüfen; liefert die geparste URL. */
export function checkFileUrl(raw: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PartnerFileError("file.url is not a valid URL", 400, "invalid_body");
  }
  if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443")) {
    throw new PartnerFileError("file.url must use https on port 443", 400, "file_host_not_allowed");
  }
  if (url.username || url.password) {
    throw new PartnerFileError("file.url must not contain credentials", 400, "invalid_body");
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(host)) {
    throw new PartnerFileError("file.url host is not allowed for this partner", 400, "file_host_not_allowed");
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** DNS-Auflösung, die private Ziele verweigert (wird von `https.request` für die Verbindung genutzt). */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error("file host resolves to a blocked address");
      e.code = "EBLOCKEDADDRESS";
      return callback(e, []);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export interface DownloadOptions {
  expectedSize: number;
  timeoutMs: number;
  maxBytes?: number;
}

/** Datei per HTTPS laden; bricht ab, sobald mehr als erwartet ankommt. */
export function downloadHttps(url: URL, opts: DownloadOptions): Promise<Buffer> {
  const max = Math.min(opts.maxBytes ?? MAX_FILE_BYTES, opts.expectedSize);
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err: Error | null, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as unknown as typeof dns.lookup,
        headers: { accept: "*/*", "user-agent": "druck-s-partner-intake/1" },
        // Kein Proxy, keine Weiterleitungen: https.request folgt Redirects nicht.
        agent: new https.Agent({ keepAlive: false }),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          return done(new PartnerFileError(`file download failed (HTTP ${status})`, 422, "file_unavailable"));
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > max) {
          res.destroy();
          return done(new PartnerFileError("file is larger than declared file.size", 422, "file_size_mismatch"));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > max) {
            res.destroy();
            done(new PartnerFileError("file is larger than declared file.size", 422, "file_size_mismatch"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => done(null, Buffer.concat(chunks)));
        res.on("error", () => done(new PartnerFileError("file download interrupted", 422, "file_unavailable")));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(new PartnerFileError("file download timed out", 422, "file_unavailable"));
    }, opts.timeoutMs);
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EBLOCKEDADDRESS") {
        done(new PartnerFileError("file host resolves to a blocked address", 400, "file_host_not_allowed"));
      } else {
        done(new PartnerFileError(`file download failed (${err.code ?? "network error"})`, 422, "file_unavailable"));
      }
    });
    req.end();
  });
}

export type Downloader = (url: URL, opts: DownloadOptions) => Promise<Buffer>;

/** Austauschbarer Standard-Downloader (Integrationstests ersetzen ihn; Produktion: downloadHttps). */
export const downloaders: { default: Downloader } = { default: downloadHttps };

/** Prüfen + laden + Größe/SHA-256 abgleichen. */
export async function fetchPartnerFile(
  file: { url: string; size: number; sha256: string },
  allowedHosts: string[],
  opts: { timeoutMs: number; download?: Downloader },
): Promise<Buffer> {
  const url = checkFileUrl(file.url, allowedHosts);
  const bytes = await (opts.download ?? downloaders.default)(url, { expectedSize: file.size, timeoutMs: opts.timeoutMs });
  if (bytes.length !== file.size) {
    throw new PartnerFileError("file size does not match file.size", 422, "file_size_mismatch");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== file.sha256.toLowerCase()) {
    throw new PartnerFileError("file content does not match file.sha256", 422, "file_sha256_mismatch");
  }
  return bytes;
}
