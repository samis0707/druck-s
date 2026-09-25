import net from "node:net";
import { config } from "./config";

/**
 * Minimal clamd client (INSTREAM scan + PING) over TCP. No extra dependency.
 * Scanner-unreachable is fail-open: SUSPICIOUS with reason, never a block —
 * otherwise a down scanner would halt the whole firm.
 */
export type ScanOutcome =
  | { status: "CLEAN" }
  | { status: "INFECTED"; signature: string }
  | { status: "UNAVAILABLE"; detail: string };

const TIMEOUT_MS = 30000;

function sendCommand(payload: Buffer, expectBytes = 4096): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: config.clamav.host, port: config.clamav.port, timeout: TIMEOUT_MS },
      () => socket.write(payload),
    );
    const chunks: Buffer[] = [];
    socket.on("data", (d: Buffer) => chunks.push(d));
    socket.on("end", () => resolve(Buffer.concat(chunks)));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("clamd timeout"));
    });
    socket.on("error", reject);
    setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
        reject(new Error("clamd timeout"));
      }
    }, TIMEOUT_MS + 5000);
    void expectBytes;
  });
}

export async function pingScanner(): Promise<boolean> {
  try {
    const res = await sendCommand(Buffer.from("zPING\0", "ascii"));
    return res.toString("ascii").includes("PONG");
  } catch {
    return false;
  }
}

export async function scanBuffer(bytes: Buffer): Promise<ScanOutcome> {
  try {
    const header = Buffer.from("zINSTREAM\0", "ascii");
    const chunks: Buffer[] = [header];
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      const slice = bytes.subarray(offset, offset + 8192);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(slice.length, 0);
      chunks.push(len, Buffer.from(slice));
    }
    const end = Buffer.alloc(4);
    chunks.push(end);
    const res = await sendCommand(Buffer.concat(chunks));
    const text = res.toString("utf8").replace(/\0/g, "");
    // Typical: "stream: Eicar-Test-Signature FOUND"
    const named = text.match(/:\s*(.+?)\s+FOUND/);
    if (named) return { status: "INFECTED", signature: named[1].trim() };
    if (/FOUND/.test(text)) return { status: "INFECTED", signature: "unknown-signature" };
    return { status: "CLEAN" };
  } catch (err) {
    return {
      status: "UNAVAILABLE",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
