import fs from "node:fs/promises";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scanBuffer = vi.fn();
vi.mock("../clamav", () => ({ scanBuffer: (b: Buffer) => scanBuffer(b) }));

import { resolveClamavMode } from "../config";
import { pendingSecurity, securityVerdict } from "./security";
import { SCAN_PENDING_LABEL, securityBadges, securityNotes, severityLabel, severityTone } from "../ui-text";
import {
  clamscanArgs,
  freshclamDue,
  parseClamscanOutput,
  processBatch,
  resolveSecurity,
  safeError,
  selectBatch,
  settingsFromEnv,
} from "../../scripts/scan-pending.mjs";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
const PDF_JS = Buffer.from("%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /JavaScript (x) >> endobj\n%%EOF");
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

describe("CLAMAV_MODE", () => {
  it("ist standardmäßig daemon und kennt batch", () => {
    expect(resolveClamavMode({})).toBe("daemon");
    expect(resolveClamavMode({ CLAMAV_MODE: "" })).toBe("daemon");
    expect(resolveClamavMode({ CLAMAV_MODE: " Batch " })).toBe("batch");
    expect(() => resolveClamavMode({ CLAMAV_MODE: "cron" })).toThrow(/CLAMAV_MODE/);
  });
});

describe("App-Seite: securityVerdict", () => {
  beforeEach(() => scanBuffer.mockReset());

  it("batch: setzt PENDING und ruft clamd nicht auf", async () => {
    const s = await securityVerdict("flyer.pdf", "application/pdf", PDF, "batch");
    expect(scanBuffer).not.toHaveBeenCalled();
    expect(s).toEqual({ verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch", attempts: 0 } });
  });

  it("batch: strukturelle Befunde bleiben SUSPICIOUS, Scan trotzdem PENDING", async () => {
    const s = await securityVerdict("flyer.pdf", "application/pdf", PDF_JS, "batch");
    expect(s.verdict).toBe("SUSPICIOUS");
    expect(s.reasons.join(" ")).toMatch(/JavaScript/);
    expect(s.scan?.status).toBe("PENDING");
    const office = pendingSecurity("liste.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("PK"));
    expect(office.verdict).toBe("SUSPICIOUS");
    expect(office.reasons).toContain("office format needs manual prepress check");
  });

  it("daemon: scannt synchron wie bisher", async () => {
    scanBuffer.mockResolvedValueOnce({ status: "INFECTED", signature: "Eicar-Test-Signature" });
    const infected = await securityVerdict("x.pdf", "application/pdf", PDF, "daemon");
    expect(scanBuffer).toHaveBeenCalledTimes(1);
    expect(infected.verdict).toBe("INFECTED");
    expect(infected.reasons).toContain("malware signature: Eicar-Test-Signature");
    expect(infected.scan).toMatchObject({ status: "INFECTED", mode: "daemon", signature: "Eicar-Test-Signature" });

    scanBuffer.mockResolvedValueOnce({ status: "UNAVAILABLE", detail: "clamd timeout" });
    const down = await securityVerdict("x.pdf", "application/pdf", PDF, "daemon");
    expect(down.verdict).toBe("SUSPICIOUS");
    expect(down.reasons[0]).toMatch(/malware scan unavailable \(clamd timeout\)/);

    scanBuffer.mockResolvedValueOnce({ status: "CLEAN" });
    expect((await securityVerdict("x.pdf", "application/pdf", PDF, "daemon")).verdict).toBe("CLEAN");
  });

  it("Batch-Ergebnis ergibt dasselbe Urteil wie der Daemon-Scan", async () => {
    const files: [string, string, Buffer][] = [
      ["a.pdf", "application/pdf", PDF],
      ["b.pdf", "application/pdf", PDF_JS],
      ["c.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK vbaProject.bin")],
      ["d.png", "image/jpeg", Buffer.from("x")],
    ];
    for (const [name, mime, bytes] of files) {
      for (const outcome of [{ status: "CLEAN" as const }, { status: "INFECTED" as const, signature: "Win.Test.EICAR_HDB-1" }]) {
        scanBuffer.mockResolvedValueOnce(outcome);
        const daemon = await securityVerdict(name, mime, bytes, "daemon");
        const batch = resolveSecurity(pendingSecurity(name, mime, bytes), outcome, { maxAttempts: 5 }).security;
        expect(batch.verdict, `${name} ${outcome.status}`).toBe(daemon.verdict);
        if (outcome.status === "INFECTED") expect(batch.reasons).toContain("malware signature: Win.Test.EICAR_HDB-1");
        else expect(batch.reasons).toEqual(daemon.reasons);
      }
    }
  });
});

describe("UI: Virenprüfung läuft", () => {
  const pending = { verdict: "PENDING", reasons: [], scan: { status: "PENDING" } };
  it("zeigt „Virenprüfung läuft“ statt „Manuell prüfen“", () => {
    expect(severityLabel("PENDING")).toBe(SCAN_PENDING_LABEL);
    expect(severityTone("PENDING")).toBe("gray");
    expect(securityBadges(pending, "staff")).toEqual([{ label: "Virenprüfung läuft", tone: "gray" }]);
    expect(securityBadges(pending, "customer")).toEqual([{ label: "Virenprüfung läuft", tone: "gray" }]);
    expect(securityNotes(pending)).toEqual(["Virenprüfung läuft"]);
  });
  it("strukturelle Befunde: Staff sieht beides, Kunde nur den laufenden Scan", () => {
    const s = { verdict: "SUSPICIOUS", reasons: ["PDF contains /JavaScript"], scan: { status: "PENDING" } };
    expect(securityBadges(s, "staff").map((b) => b.label)).toEqual(["Manuell prüfen", "Virenprüfung läuft"]);
    expect(securityBadges(s, "customer").map((b) => b.label)).toEqual(["Virenprüfung läuft"]);
    expect(securityNotes(s)).toEqual(["PDF contains /JavaScript", "Virenprüfung läuft"]);
  });
  it("ohne Batch-Scan unverändert", () => {
    expect(securityBadges({ verdict: "CLEAN", reasons: [] }, "customer")).toEqual([]);
    expect(securityBadges({ verdict: "INFECTED", reasons: ["x"] }, "customer")).toEqual([{ label: "Zurückgehalten", tone: "red" }]);
    expect(securityNotes({ verdict: "SUSPICIOUS", reasons: ["a"], scan: { status: "UNAVAILABLE" } })).toEqual(["a"]);
  });
});

describe("Scan-Job: clamscan-Ausgabe", () => {
  it("wertet OK, FOUND, ERROR und Empty file je Datei aus", () => {
    const dir = "/tmp/druck-s-scan-abc";
    const stdout = [
      `${dir}/${ID1}: OK`,
      `${dir}/${ID2}: Win.Test.EICAR_HDB-1 FOUND`,
      `${dir}/${ID3}: Can't allocate memory ERROR`,
      `${dir}/fremd: OK`,
      "LibClamAV Warning: something",
      "",
    ].join("\n");
    const r = parseClamscanOutput(stdout, [ID1, ID2, ID3, "44444444-4444-4444-8444-444444444444"]);
    expect(r.get(ID1)).toEqual({ status: "CLEAN" });
    expect(r.get(ID2)).toEqual({ status: "INFECTED", signature: "Win.Test.EICAR_HDB-1" });
    expect(r.get(ID3)).toEqual({ status: "ERROR", detail: "Can't allocate memory" });
    expect(r.has("fremd")).toBe(false);
    expect(r.has("44444444-4444-4444-8444-444444444444")).toBe(false);
    expect(parseClamscanOutput(`${dir}/${ID1}: Empty file\r\n`, [ID1]).get(ID1)).toEqual({ status: "CLEAN" });
  });

  it("INFECTED gewinnt bei mehreren Zeilen je Datei", () => {
    const r = parseClamscanOutput(`/t/${ID1}: OK\n/t/${ID1}: Eicar-Signature FOUND\n/t/${ID1}: OK`, [ID1]);
    expect(r.get(ID1)).toEqual({ status: "INFECTED", signature: "Eicar-Signature" });
  });

  it("setzt Größengrenzen bis zum Upload-Limit und lädt Signaturen einmal", () => {
    const args = clamscanArgs({ dbDir: "/var/lib/clamav", dir: "/tmp/x", maxFileMb: 100 });
    expect(args).toEqual(expect.arrayContaining(["--no-summary", "--recursive", "--database=/var/lib/clamav", "--max-filesize=101M", "--max-scansize=404M"]));
    expect(args.at(-1)).toBe("/tmp/x");
    expect(args).not.toContain("--infected");
  });
});

describe("Scan-Job: Auswahl und Statuswechsel", () => {
  const settings = { ...settingsFromEnv({}), tmpRoot: os.tmpdir() };

  it("Standardwerte", () => {
    expect(settings).toMatchObject({ batchSize: 200, maxAttempts: 5, maxFileMb: 100, freshclamIntervalHours: 4, dbDir: "/var/lib/clamav" });
    expect(() => settingsFromEnv({ SCAN_BATCH_SIZE: "x" })).toThrow(/SCAN_BATCH_SIZE/);
  });

  it("begrenzt Anzahl und Bytes, nimmt aber immer mindestens eine Datei", () => {
    const rows = [1, 2, 3, 4].map((n) => ({ fileId: `f${n}`, sizeBytes: String(n * 100) }));
    expect(selectBatch(rows, { batchSize: 2, batchMaxBytes: 10_000 }).map((r) => r.fileId)).toEqual(["f1", "f2"]);
    expect(selectBatch(rows, { batchSize: 10, batchMaxBytes: 300 }).map((r) => r.fileId)).toEqual(["f1", "f2"]);
    expect(selectBatch([{ fileId: "big", sizeBytes: 999 }], { batchSize: 10, batchMaxBytes: 1 })).toHaveLength(1);
  });

  it("zählt Fehlversuche und gibt nach SCAN_MAX_ATTEMPTS auf (UNAVAILABLE, fail-open)", () => {
    const start = { verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch", attempts: 0 } };
    const one = resolveSecurity(start, { status: "ERROR", detail: "download failed: NoSuchKey" }, { maxAttempts: 3 });
    expect(one.final).toBeNull();
    expect(one.security).toMatchObject({ verdict: "PENDING", scan: { status: "PENDING", attempts: 1, error: "download failed: NoSuchKey" } });
    const two = resolveSecurity(one.security, { status: "ERROR", detail: "x" }, { maxAttempts: 3 });
    const three = resolveSecurity(two.security, { status: "ERROR", detail: "x" }, { maxAttempts: 3 });
    expect(three.final).toBe("UNAVAILABLE");
    expect(three.security.verdict).toBe("SUSPICIOUS");
    expect(three.security.reasons).toEqual(["malware scan unavailable (x) — manual check"]);
    expect(three.security.scan).toMatchObject({ status: "UNAVAILABLE", attempts: 3 });
    const tooBig = resolveSecurity(start, { status: "ERROR", detail: "too big", final: true }, { maxAttempts: 5 });
    expect(tooBig.final).toBe("UNAVAILABLE");
  });

  it("freshclam höchstens alle paar Stunden", () => {
    const h = 60 * 60 * 1000;
    expect(freshclamDue(null, 0, 4)).toBe(true);
    expect(freshclamDue(0, 3 * h, 4)).toBe(false);
    expect(freshclamDue(0, 4 * h, 4)).toBe(true);
  });

  it("Fehlertexte ohne Storage-Key", () => {
    const err = Object.assign(new Error("The specified key does not exist: requests/r/uuid-Kunde Müller.pdf"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    expect(safeError(err)).toBe("NoSuchKey HTTP 404");
  });

  it("verarbeitet einen Batch mit gemockter DB/S3: CLEAN, INFECTED, Downloadfehler", async () => {
    const pending = (attempts = 0) => ({ verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch", attempts } });
    const rows = [
      { fileId: ID1, requestId: "r1", storageKey: "requests/r1/a-Geheim.pdf", sizeBytes: "10", sha256: null, security: pending() },
      { fileId: ID2, requestId: "r1", storageKey: "requests/r1/b.pdf", sizeBytes: "10", sha256: null, security: pending() },
      { fileId: ID3, requestId: "r2", storageKey: "requests/r2/c.pdf", sizeBytes: "10", sha256: null, security: pending(1) },
    ];
    const calls: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rowCount: sql.startsWith("UPDATE") ? 1 : 0, rows: [] };
      }),
    };
    let scannedDir = "";
    const download = vi.fn(async (row: { fileId: string }, dest: string) => {
      if (row.fileId === ID3) throw Object.assign(new Error("boom requests/r2/c.pdf"), { name: "NoSuchKey" });
      await fs.writeFile(dest, "data");
    });
    const scan = vi.fn(async (dir: string, ids: string[]) => {
      scannedDir = dir;
      expect(ids).toEqual([ID1, ID2]);
      expect((await fs.readdir(dir)).sort()).toEqual([ID1, ID2]);
      return { code: 1, stdout: `${dir}/${ID1}: OK\n${dir}/${ID2}: Eicar-Signature FOUND\n`, stderr: "" };
    });
    const logs: string[] = [];
    const summary = await processBatch(rows, { client, download, scan, settings, log: (m: string) => logs.push(m), now: () => new Date("2026-11-08T12:00:00Z") });

    expect(summary).toMatchObject({ total: 3, clean: 1, infected: 1, retry: 1, unavailable: 0, skipped: 0 });
    expect(scan).toHaveBeenCalledTimes(1);
    await expect(fs.stat(scannedDir)).rejects.toThrow();

    const updates = calls.filter((c) => c.sql.startsWith("UPDATE"));
    expect(updates).toHaveLength(3);
    for (const u of updates) expect(u.sql).toMatch(/'PENDING'/);
    const byId = new Map(updates.map((u) => [u.params![0], JSON.parse(String(u.params![1]))]));
    expect(byId.get(ID1)).toMatchObject({ verdict: "CLEAN", scan: { status: "CLEAN", mode: "batch", scannedAt: "2026-11-08T12:00:00.000Z" } });
    expect(byId.get(ID2)).toMatchObject({ verdict: "INFECTED", reasons: ["malware signature: Eicar-Signature"], scan: { status: "INFECTED", signature: "Eicar-Signature" } });
    expect(byId.get(ID3)).toMatchObject({ verdict: "PENDING", scan: { status: "PENDING", attempts: 2, error: "download failed: NoSuchKey" } });

    const audits = calls.filter((c) => c.sql.includes("INSERT INTO audit_log"));
    expect(audits).toHaveLength(1);
    expect(audits[0].params![0]).toBe("malware_detected");
    expect(audits[0].params![1]).toBe("r1");
    expect(JSON.parse(String(audits[0].params![2]))).toMatchObject({ fileId: ID2, signature: "Eicar-Signature" });
    expect(calls.filter((c) => c.sql === "COMMIT")).toHaveLength(3);

    const allLogs = logs.join("\n");
    expect(allLogs).not.toMatch(/Geheim|requests\//);
    expect(allLogs).toContain(ID2);
  });

  it("clamscan ohne Ergebnis: alle Dateien bleiben PENDING; zu große Dateien werden nicht geladen", async () => {
    const rows = [
      { fileId: ID1, requestId: "r1", storageKey: "k1", sizeBytes: "10", sha256: null, security: { verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch", attempts: 0 } } },
      { fileId: ID2, requestId: "r1", storageKey: "k2", sizeBytes: String(200 * 1024 * 1024), sha256: null, security: { verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch", attempts: 0 } } },
    ];
    const updates: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.startsWith("UPDATE")) updates.push(params!);
        return { rowCount: sql.startsWith("UPDATE") ? 1 : 0, rows: [] };
      }),
    };
    const download = vi.fn(async (_row: unknown, dest: string) => fs.writeFile(dest, "x"));
    const scan = vi.fn(async () => ({ code: 2, stdout: "", stderr: "LibClamAV Error: cl_load(): No such file or directory: /var/lib/clamav" }));
    const summary = await processBatch(rows, { client, download, scan, settings, log: () => {} });
    expect(download).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ retry: 1, unavailable: 1 });
    const one = JSON.parse(String(updates.find((u) => u[0] === ID1)![1]));
    expect(one.scan).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(one.scan.error).toMatch(/not scanned \(clamscan exit 2/);
    const two = JSON.parse(String(updates.find((u) => u[0] === ID2)![1]));
    expect(two.scan.status).toBe("UNAVAILABLE");
    expect(two.reasons[0]).toMatch(/larger than scan limit/);
  });

  it("überspringt Berichte, die inzwischen nicht mehr PENDING sind", async () => {
    const client = { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rowCount: 0, rows: [] })) };
    const rows = [{ fileId: ID1, requestId: "r1", storageKey: "k", sizeBytes: "1", sha256: null, security: { verdict: "PENDING", reasons: [], scan: { status: "PENDING", mode: "batch" } } }];
    const summary = await processBatch(rows, {
      client,
      download: async (_r: unknown, dest: string) => fs.writeFile(dest, "x"),
      scan: async (dir: string) => ({ code: 0, stdout: `${dir}/${ID1}: OK`, stderr: "" }),
      settings,
      log: () => {},
    });
    expect(summary).toMatchObject({ clean: 0, skipped: 1 });
    expect(client.query.mock.calls.some((c) => String(c[0]).includes("audit_log"))).toBe(false);
  });
});


