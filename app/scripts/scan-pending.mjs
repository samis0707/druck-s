#!/usr/bin/env node
/**
 * Batch-Virenscan (CLAMAV_MODE=batch, docs/virenscan.md, openspec/changes/clamav-batch-scan).
 *
 * Läuft als Cron-Service (Railway: alle 10 Minuten, Image Dockerfile.scan) und beendet sich danach:
 *   1. Sperre holen (pg_try_advisory_lock) — ein zweiter Lauf parallel beendet sich sofort.
 *   2. Älteste Berichte mit security.scan.status = 'PENDING' holen (SCAN_BATCH_SIZE, SCAN_BATCH_MAX_MB).
 *   3. Nur wenn es etwas gibt oder keine Signaturen da sind: freshclam, höchstens alle
 *      FRESHCLAM_INTERVAL_HOURS (Zeitstempel-Datei auf dem Volume); scheitert es, mit vorhandenen
 *      Signaturen weiter, ohne Signaturen Abbruch (Exit 1).
 *   4. Dateien aus S3 in ein Temp-Verzeichnis (Name = Datei-ID, nie der Kundendateiname), EIN
 *      clamscan-Aufruf über alle (Signaturen werden einmal geladen), Ausgabe je Datei auswerten.
 *   5. Ergebnis wie beim Daemon-Scan in analysis_reports.security schreiben (CLEAN/SUSPICIOUS/INFECTED,
 *      `malware signature: …`); INFECTED und Aufgeben zusätzlich ins audit_log. Fehler je Datei:
 *      bleibt PENDING, `scan.attempts` + 1, ab SCAN_MAX_ATTEMPTS UNAVAILABLE (fail-open, manuell prüfen).
 *   6. Temp aufräumen, Exit 0 (auch bei Teilfehlern).
 *
 * Abhängigkeiten nur pg und @aws-sdk/client-s3 (wie die App). Logs enthalten IDs, nie Dateinamen,
 * Storage-Keys oder Inhalte.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

export const LOCK_KEY = "druck-s:scan-pending";
export const STAMP_FILE = ".druck-s-freshclam-stamp";
const MB = 1024 * 1024;

function intEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Env var ${name} must be a positive number`);
  return n;
}

/**
 * Einstellungen aus der Umgebung (Standardwerte passen zum Upload-Limit von 100 MB).
 * @param {Record<string, string | undefined>} [env]
 */
export function settingsFromEnv(env = process.env) {
  return {
    batchSize: Math.floor(intEnv(env, "SCAN_BATCH_SIZE", 200)),
    batchMaxBytes: intEnv(env, "SCAN_BATCH_MAX_MB", 2048) * MB,
    maxAttempts: Math.floor(intEnv(env, "SCAN_MAX_ATTEMPTS", 5)),
    maxFileMb: intEnv(env, "SCAN_MAX_FILE_MB", 100),
    freshclamIntervalHours: intEnv(env, "FRESHCLAM_INTERVAL_HOURS", 4),
    timeoutMs: intEnv(env, "SCAN_TIMEOUT_MINUTES", 30) * 60 * 1000,
    dbDir: env.CLAMAV_DB_DIR || "/var/lib/clamav",
    seedDir: env.CLAMAV_SEED_DIR || "",
    freshclamConfig: env.FRESHCLAM_CONFIG || "",
    tmpRoot: env.SCAN_TMP_DIR || os.tmpdir(),
  };
}

/** clamscan-Argumente: ein Lauf über das Temp-Verzeichnis, Grenzen bis zum Upload-Limit. */
export function clamscanArgs({ dbDir, dir, maxFileMb }) {
  const fileMb = Math.ceil(maxFileMb) + 1;
  return [
    "--recursive",
    "--no-summary",
    "--stdout",
    `--database=${dbDir}`,
    `--max-filesize=${fileMb}M`,
    // Gesamtmenge je Datei inkl. entpackter Inhalte (Office/ZIP/PDF-Streams).
    `--max-scansize=${Math.max(fileMb * 4, 400)}M`,
    dir,
  ];
}

/** INFECTED gewinnt, dann ERROR, dann CLEAN (bei mehreren Zeilen je Datei). */
const RESULT_RANK = { INFECTED: 3, ERROR: 2, CLEAN: 1 };

/**
 * clamscan-Ausgabe je Datei auswerten. Zeilen: `<pfad>: OK`, `<pfad>: <Signatur> FOUND`,
 * `<pfad>: <Grund> ERROR`, `<pfad>: Empty file`. Schlüssel ist der Dateiname im Temp-Verzeichnis
 * (= Datei-ID); unbekannte Pfade und sonstige Zeilen werden ignoriert. Fehlt eine ID im Ergebnis,
 * gilt sie als nicht geprüft.
 */
export function parseClamscanOutput(stdout, knownIds) {
  const known = new Set(knownIds);
  const out = new Map();
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trimEnd();
    // Der Pfad steht vorn und enthält kein ": " (Temp-Verzeichnis + UUID).
    const sep = line.indexOf(": ");
    if (sep <= 0) continue;
    const id = path.basename(line.slice(0, sep));
    if (!known.has(id)) continue;
    const rest = line.slice(sep + 2);
    let result = null;
    if (rest === "OK" || rest === "Empty file") result = { status: "CLEAN" };
    else if (rest.endsWith(" FOUND")) result = { status: "INFECTED", signature: rest.slice(0, -6).trim() || "unknown-signature" };
    else if (rest.endsWith(" ERROR")) result = { status: "ERROR", detail: rest.slice(0, -6).trim() || "scan error" };
    if (!result) continue;
    const prev = out.get(id);
    if (!prev || RESULT_RANK[result.status] > RESULT_RANK[prev.status]) out.set(id, result);
  }
  return out;
}

/** Älteste zuerst, höchstens `batchSize` Dateien und `batchMaxBytes` (mindestens eine Datei). */
export function selectBatch(rows, { batchSize, batchMaxBytes }) {
  const picked = [];
  let bytes = 0;
  for (const row of rows) {
    if (picked.length >= batchSize) break;
    const size = Number(row.sizeBytes) || 0;
    if (picked.length > 0 && bytes + size > batchMaxBytes) break;
    picked.push(row);
    bytes += size;
  }
  return picked;
}

/**
 * Neuer security-Wert für ein Ergebnis — dieselbe Semantik wie der Daemon-Scan
 * (lib/analyze/security.ts): INFECTED mit `malware signature: …`; sonst SUSPICIOUS, sobald es
 * Gründe gibt (strukturelle Befunde, Office, Scanner nicht verfügbar), ansonsten CLEAN.
 * outcome: { status: "CLEAN" } | { status: "INFECTED", signature } | { status: "ERROR", detail }.
 * Liefert { security, final } — final ist null, solange die Datei PENDING bleibt.
 */
export function resolveSecurity(security, outcome, { maxAttempts, now = new Date() }) {
  const reasons = Array.isArray(security?.reasons) ? [...security.reasons] : [];
  const prevScan = security?.scan ?? {};
  const attempts = Number(prevScan.attempts) || 0;
  const scannedAt = now.toISOString();
  const base = { mode: "batch", attempts };
  if (outcome.status === "INFECTED") {
    return {
      final: "INFECTED",
      security: {
        verdict: "INFECTED",
        reasons: [...reasons, `malware signature: ${outcome.signature}`],
        scan: { ...base, status: "INFECTED", signature: outcome.signature, scannedAt },
      },
    };
  }
  if (outcome.status === "CLEAN") {
    return {
      final: "CLEAN",
      security: {
        verdict: reasons.length > 0 ? "SUSPICIOUS" : "CLEAN",
        reasons,
        scan: { ...base, status: "CLEAN", scannedAt },
      },
    };
  }
  const detail = String(outcome.detail ?? "scan error").slice(0, 300);
  const next = attempts + 1;
  if (next >= maxAttempts || outcome.final === true) {
    return {
      final: "UNAVAILABLE",
      security: {
        verdict: "SUSPICIOUS",
        reasons: [...reasons, `malware scan unavailable (${detail}) — manual check`],
        scan: { mode: "batch", attempts: next, status: "UNAVAILABLE", error: detail, scannedAt },
      },
    };
  }
  return {
    final: null,
    security: {
      verdict: security?.verdict ?? (reasons.length > 0 ? "SUSPICIOUS" : "PENDING"),
      reasons,
      scan: { mode: "batch", attempts: next, status: "PENDING", error: detail },
    },
  };
}

/** freshclam fällig? Ohne Zeitstempel immer, sonst nach `intervalHours`. */
export function freshclamDue(stampMtimeMs, nowMs, intervalHours) {
  if (stampMtimeMs == null) return true;
  return nowMs - stampMtimeMs >= intervalHours * 60 * 60 * 1000;
}

/** Fehlertext ohne Pfade/Keys: Name, Code, HTTP-Status. */
export function safeError(err) {
  if (!err || typeof err !== "object") return String(err).slice(0, 200);
  const parts = [err.name || "Error"];
  if (err.code && err.code !== err.name) parts.push(String(err.code));
  const status = err.$metadata?.httpStatusCode;
  if (status) parts.push(`HTTP ${status}`);
  return parts.join(" ");
}

const SELECT_PENDING = `SELECT ar.file_id AS "fileId", f.request_id AS "requestId", f.storage_key AS "storageKey",
    f.size_bytes AS "sizeBytes", f.sha256, ar.security
  FROM analysis_reports ar JOIN request_files f ON f.id = ar.file_id
  WHERE (ar.security -> 'scan' ->> 'status') = 'PENDING'
  ORDER BY ar.measured_at ASC, ar.file_id ASC
  LIMIT $1`;

/** Ergebnis schreiben — nur, solange der Bericht noch PENDING ist (keine Neuanalyse überschreiben). */
export async function writeResult(client, row, resolved) {
  await client.query("BEGIN");
  try {
    const res = await client.query(
      `UPDATE analysis_reports SET security = $2::jsonb
       WHERE file_id = $1 AND (security -> 'scan' ->> 'status') = 'PENDING'`,
      [row.fileId, JSON.stringify(resolved.security)],
    );
    if (res.rowCount > 0 && (resolved.final === "INFECTED" || resolved.final === "UNAVAILABLE")) {
      const detail =
        resolved.final === "INFECTED"
          ? { fileId: row.fileId, signature: resolved.security.scan.signature, source: "batch-scan" }
          : { fileId: row.fileId, attempts: resolved.security.scan.attempts, source: "batch-scan" };
      await client.query(
        `INSERT INTO audit_log (action, actor_type, actor_id, request_id, detail)
         VALUES ($1, 'system', 'scan-pending', $2, $3::jsonb)`,
        [resolved.final === "INFECTED" ? "malware_detected" : "malware_scan_unavailable", row.requestId, JSON.stringify(detail)],
      );
    }
    await client.query("COMMIT");
    return res.rowCount > 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

/**
 * Einen Batch prüfen. deps: { client (pg), download(row, dest), scan(dir, ids) → {code, stdout, stderr},
 * log, settings, now() }. Liefert eine Zusammenfassung (Zähler).
 */
export async function processBatch(rows, deps) {
  const { client, download, scan, log, settings } = deps;
  const now = deps.now ?? (() => new Date());
  const summary = { total: rows.length, clean: 0, infected: 0, retry: 0, unavailable: 0, skipped: 0 };
  const outcomes = new Map();
  const maxFileBytes = settings.maxFileMb * MB;
  const dir = await fs.mkdtemp(path.join(settings.tmpRoot, "druck-s-scan-"));
  try {
    const toScan = [];
    for (const row of rows) {
      if (Number(row.sizeBytes) > maxFileBytes) {
        outcomes.set(row.fileId, { status: "ERROR", detail: `file larger than scan limit ${settings.maxFileMb} MB`, final: true });
        continue;
      }
      try {
        await download(row, path.join(dir, row.fileId));
        toScan.push(row.fileId);
      } catch (err) {
        outcomes.set(row.fileId, { status: "ERROR", detail: `download failed: ${safeError(err)}` });
      }
    }
    if (toScan.length > 0) {
      let result;
      try {
        result = await scan(dir, toScan);
      } catch (err) {
        result = { code: -1, stdout: "", stderr: safeError(err) };
      }
      const parsed = parseClamscanOutput(result.stdout ?? "", toScan);
      const stderr = (result.stderr ?? "").replaceAll(dir, "<tmp>").trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 300);
      if (![0, 1, 2].includes(result.code)) log(`[scan] clamscan beendet mit Code ${result.code}: ${stderr || "ohne Meldung"}`);
      for (const id of toScan) {
        outcomes.set(id, parsed.get(id) ?? { status: "ERROR", detail: `not scanned (clamscan exit ${result.code}${stderr ? `: ${stderr}` : ""})` });
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  for (const row of rows) {
    const outcome = outcomes.get(row.fileId);
    const resolved = resolveSecurity(row.security, outcome, { maxAttempts: settings.maxAttempts, now: now() });
    let written = false;
    try {
      written = await writeResult(client, row, resolved);
    } catch (err) {
      log(`[scan] Datei ${row.fileId}: Ergebnis nicht gespeichert (${safeError(err)})`);
      summary.skipped += 1;
      continue;
    }
    if (!written) {
      summary.skipped += 1;
      continue;
    }
    if (resolved.final === "CLEAN") summary.clean += 1;
    else if (resolved.final === "INFECTED") {
      summary.infected += 1;
      log(`[scan] Datei ${row.fileId} (Auftrag ${row.requestId}): INFECTED ${resolved.security.scan.signature}`);
    } else if (resolved.final === "UNAVAILABLE") {
      summary.unavailable += 1;
      log(`[scan] Datei ${row.fileId}: aufgegeben nach ${resolved.security.scan.attempts} Versuchen (${resolved.security.scan.error}) → UNAVAILABLE`);
    } else {
      summary.retry += 1;
      log(`[scan] Datei ${row.fileId}: Versuch ${resolved.security.scan.attempts} fehlgeschlagen (${resolved.security.scan.error}), bleibt PENDING`);
    }
  }
  return summary;
}

// ---------------------------------------------------------------- Laufzeit (nicht in Unit-Tests)

function run(cmd, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr = (stderr + d).slice(-8000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? (signal ? -1 : 0), stdout, stderr: signal ? `${stderr}\nkilled by ${signal}` : stderr });
    });
  });
}

async function signatureFiles(dir) {
  try {
    return (await fs.readdir(dir)).filter((f) => /\.(cvd|cld|cud)$/.test(f));
  } catch {
    return [];
  }
}

async function stampMtime(dbDir) {
  try {
    return (await fs.stat(path.join(dbDir, STAMP_FILE))).mtimeMs;
  } catch {
    return null;
  }
}

/** Leeres Volume einmalig aus den Signaturen im Image füllen (spart den ersten Voll-Download). */
async function seedSignatures(settings, log) {
  if (!settings.seedDir || (await signatureFiles(settings.dbDir)).length > 0) return;
  const seed = await signatureFiles(settings.seedDir);
  if (seed.length === 0) return;
  await fs.mkdir(settings.dbDir, { recursive: true });
  for (const f of seed) await fs.copyFile(path.join(settings.seedDir, f), path.join(settings.dbDir, f));
  log(`[scan] Signaturen aus dem Image übernommen (${seed.length} Dateien)`);
}

/** freshclam, höchstens alle FRESHCLAM_INTERVAL_HOURS. Liefert false, wenn keine Signaturen da sind. */
async function ensureSignatures(settings, log) {
  await seedSignatures(settings, log);
  const due = freshclamDue(await stampMtime(settings.dbDir), Date.now(), settings.freshclamIntervalHours);
  if (due) {
    const args = ["--stdout", "--foreground", `--datadir=${settings.dbDir}`];
    if (settings.freshclamConfig) args.push(`--config-file=${settings.freshclamConfig}`);
    try {
      const res = await run("freshclam", args, { timeoutMs: 10 * 60 * 1000 });
      if (res.code === 0) {
        await fs.writeFile(path.join(settings.dbDir, STAMP_FILE), new Date().toISOString());
        log("[scan] freshclam: Signaturen aktuell");
      } else {
        const tail = `${res.stdout}\n${res.stderr}`.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 400);
        log(`[scan] freshclam fehlgeschlagen (Code ${res.code}): ${tail}`);
      }
    } catch (err) {
      log(`[scan] freshclam nicht startbar: ${safeError(err)}`);
    }
  }
  return (await signatureFiles(settings.dbDir)).length > 0;
}

function s3Client(env) {
  return import("@aws-sdk/client-s3").then(({ S3Client, GetObjectCommand }) => {
    const client = new S3Client({
      region: env.S3_REGION || "us-east-1",
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "true") === "true",
      credentials: { accessKeyId: env.S3_ACCESS_KEY || "", secretAccessKey: env.S3_SECRET_KEY || "" },
    });
    const bucket = env.S3_BUCKET || "dam";
    /** Objekt streamend in `dest` schreiben, Größe und (falls bekannt) SHA-256 prüfen. */
    return async function download(row, dest) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: row.storageKey }));
      if (!out.Body) throw Object.assign(new Error("empty body"), { name: "EmptyBody" });
      const hash = createHash("sha256");
      let size = 0;
      const tap = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          size += chunk.length;
          cb(null, chunk);
        },
      });
      await pipeline(out.Body, tap, createWriteStream(dest, { mode: 0o600 }));
      if (row.sha256 && hash.digest("hex") !== String(row.sha256).toLowerCase()) {
        throw Object.assign(new Error("checksum mismatch"), { name: "ChecksumMismatch" });
      }
      if (row.sizeBytes != null && Number(row.sizeBytes) !== size) {
        throw Object.assign(new Error("size mismatch"), { name: "SizeMismatch" });
      }
    };
  });
}

/** @param {Record<string, string | undefined>} [env] */
export async function main(env = process.env, log = (m) => console.log(m)) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL fehlt");
  if (!env.S3_ENDPOINT) throw new Error("S3_ENDPOINT fehlt");
  const settings = settingsFromEnv(env);
  const started = Date.now();
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]?.ok) {
      log("[scan] anderer Lauf aktiv, beende");
      return 0;
    }
    const pending = await client.query(SELECT_PENDING, [settings.batchSize]);
    const rows = selectBatch(pending.rows, settings);
    const haveSignatures = (await signatureFiles(settings.dbDir)).length > 0;
    if (rows.length === 0 && haveSignatures) {
      // Leerer Lauf: freshclam nur, wenn fällig — sonst sofort fertig.
      if (freshclamDue(await stampMtime(settings.dbDir), Date.now(), settings.freshclamIntervalHours)) {
        await ensureSignatures(settings, log);
      }
      log(`[scan] nichts zu prüfen (${Date.now() - started} ms)`);
      return 0;
    }
    if (!(await ensureSignatures(settings, log))) {
      log(`[scan] ABBRUCH: keine Signaturen in ${settings.dbDir} und freshclam fehlgeschlagen; ${rows.length} Datei(en) bleiben PENDING`);
      return 1;
    }
    if (rows.length === 0) {
      log(`[scan] nichts zu prüfen (${Date.now() - started} ms)`);
      return 0;
    }
    log(`[scan] prüfe ${rows.length} Datei(en)${pending.rows.length > rows.length ? `, weitere ${pending.rows.length - rows.length}+ im nächsten Lauf` : ""}`);
    const summary = await processBatch(rows, {
      client,
      download: await s3Client(env),
      scan: (dir) => run("clamscan", clamscanArgs({ dbDir: settings.dbDir, dir, maxFileMb: settings.maxFileMb }), { timeoutMs: settings.timeoutMs }),
      log,
      settings,
    });
    log(
      `[scan] fertig in ${Math.round((Date.now() - started) / 1000)} s: ${summary.clean} sauber, ${summary.infected} infiziert, ` +
        `${summary.retry} erneut, ${summary.unavailable} aufgegeben, ${summary.skipped} übersprungen`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[scan] Fehler: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
