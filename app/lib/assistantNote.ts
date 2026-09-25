import { query } from "./db";
import { sha256Hex } from "./crypto";
import { getMistral, mistralModel } from "./mistral";
import { getRequest, listFiles } from "./requests/store";
import { getReport } from "./analyze/run";
import { measureRequest } from "./measure";
import { latestHistoryImport } from "./historyImport";
import { PRODUCT_HINTS } from "./ui-text";
import type { AssistantNote, NoteSource } from "./assistant";
import { assembleSystemPrompt, loadAssistantInstructions } from "./assistantPrompt";

/** Allowlist für den Kategorie-Vorschlag: exakt die Produkt-Hint-Werte. */
export const CATEGORY_VALUES = PRODUCT_HINTS.map((h) => h.value);

/** Commerce/commission language the note must never contain (Deutsch und Englisch). */
const BLOCKLIST = [
  /€/,
  /\bEUR\b/i,
  /\bprices?\b/i,
  /\bcosts?\b/i,
  /\bdiscounts?\b/i,
  /\binvoices?\b/i,
  /\bpayments?\b/i,
  /\bdelivery (date|time|promise)/i,
  /\bwill cost\b/i,
  /preis/i,
  /kosten/i,
  /\bkostet\b/i,
  /rabatt/i,
  /rechnung/i,
  /zahlung/i,
  /liefer(zeit|termin|datum|zusage|versprechen)/i,
  /\bwird\s+kosten\b/i,
];

const SOURCE_KINDS = ["file", "analysis", "history", "text"];

export type ChatFn = (input: { system: string; user: string }) => Promise<string>;

async function defaultChat({ system, user }: { system: string; user: string }): Promise<string> {
  const mistral = getMistral();
  const res = await mistral.chat.complete({
    model: mistralModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    responseFormat: { type: "json_object" },
  });
  const content = res.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((c) => (c.type === "text" ? c.text : "")).join("")
    : (content ?? "");
  return typeof text === "string" ? text : JSON.stringify(text);
}

export interface NoteContext {
  requestId: string;
  productHint: string;
  referenceText: string | null;
  freeText: string;
  measures: Awaited<ReturnType<typeof measureRequest>>;
  reports: { fileName: string; printability: string; findings: { check: string; summary: string }[] }[];
  historyMd: string | null;
  historyState: "present" | "absent" | "stale";
  historyImportId: string | null;
}

async function buildContext(requestId: string): Promise<NoteContext> {
  const request = await getRequest(requestId);
  if (!request) throw new Error("Request not found");
  const measures = await measureRequest(requestId);
  const files = await listFiles(requestId);
  const reports = [];
  for (const f of files) {
    const report = await getReport(f.id);
    if (report) {
      reports.push({
        fileName: f.fileName,
        printability: report.printability,
        findings: report.findings.map((x) => ({ check: x.check, summary: x.summary })),
      });
    }
  }
  const ownerId =
    request.customerId ??
    (request.linkId
      ? (
          await query<{ identity_id: string }>("SELECT identity_id FROM upload_links WHERE id = $1", [
            request.linkId,
          ])
        ).rows[0]?.identity_id ?? null
      : null);
  let historyMd: string | null = null;
  let historyImportId: string | null = null;
  if (ownerId) {
    const bundle = await latestHistoryImport(ownerId);
    if (bundle) {
      historyMd = bundle.md;
      historyImportId = bundle.id;
    }
  }
  return {
    requestId,
    productHint: request.productHint,
    referenceText: request.referenceText,
    freeText: request.freeText,
    measures,
    reports,
    historyMd,
    historyState: historyMd ? "present" : "absent",
    historyImportId,
  };
}

function inputHash(ctx: NoteContext, instructions: string): string {
  return sha256Hex(
    JSON.stringify({
      instructions,
      hint: ctx.productHint,
      text: ctx.freeText,
      measures: ctx.measures,
      reports: ctx.reports,
      historyImportId: ctx.historyImportId,
    }),
  );
}

function validateBullets(
  bullets: { text: string; sources: NoteSource[] }[],
  ctx: NoteContext,
): string | null {
  if (!Array.isArray(bullets) || bullets.length === 0 || bullets.length > 8) {
    return "bullets must be 1-8 items";
  }
  const knownFiles = new Set(ctx.measures.files.map((f) => f.fileName));
  const historyLines = ctx.historyMd ? ctx.historyMd.split("\n").length : 0;
  for (const b of bullets) {
    if (typeof b.text !== "string" || b.text.length === 0 || b.text.length > 500) {
      return "each bullet needs 1-500 chars of text";
    }
    if (!Array.isArray(b.sources) || b.sources.length === 0) return "each bullet needs sources";
    for (const s of b.sources) {
      if (!SOURCE_KINDS.includes(s.kind)) return `unknown source kind ${s.kind}`;
      if (s.kind === "file" || s.kind === "analysis") {
        const name = s.kind === "file" ? s.ref : s.ref.replace(/^analysis:/, "");
        if (!knownFiles.has(s.kind === "file" ? s.ref : name)) {
          return `unknown file source ${s.ref}`;
        }
      }
      if (s.kind === "history") {
        const m = s.ref.match(/^history:md:(\d+)$/);
        if (!m || Number(m[1]) < 1 || Number(m[1]) > historyLines) {
          return `bad history source ${s.ref}`;
        }
      }
    }
    for (const pattern of BLOCKLIST) {
      if (pattern.test(b.text)) return `forbidden commercial language: ${pattern}`;
    }
  }
  if (ctx.historyState === "absent") {
    const all = bullets.map((b) => b.text).join(" ");
    if (!/keine historie/i.test(all) && !/no history/i.test(all)) return "must disclose missing history";
  }
  return null;
}

/** Kategorie-Vorschlag prüfen: fehlend → null (kein Retry), ungültig → Retry, danach null. */
function validateCategory(value: unknown): { value: string | null; problem: string | null } {
  if (value === undefined || value === null) return { value: null, problem: null };
  if (typeof value === "string" && CATEGORY_VALUES.includes(value)) return { value, problem: null };
  return { value: null, problem: `unknown category ${JSON.stringify(value)}` };
}

const NOTE_COLS = `id, request_id AS "requestId", bundle_version AS "bundleVersion",
  input_hash AS "inputHash", bullets, history_state AS "historyState",
  suggested_category AS "suggestedCategory", created_at AS "createdAt"`;

type StoredNote = AssistantNote & { inputHash: string };

/**
 * Generate (or return the frozen) assistant note. Frozen after IN_REVIEW:
 * regeneration only while RECEIVED. Throws when the provider is unavailable
 * or output fails validation — callers treat that as "no note", never a block.
 */
export async function generateNote(
  requestId: string,
  deps?: { chat?: ChatFn; instructions?: string },
): Promise<StoredNote> {
  const request = await getRequest(requestId);
  if (!request) throw new Error("Request not found");
  if (request.status !== "RECEIVED") {
    const existing = await latestNote(requestId);
    if (!existing) throw new Error("Note generation only runs on received requests");
    return existing;
  }
  const ctx = await buildContext(requestId);
  const instructions = deps?.instructions ?? (await loadAssistantInstructions());
  const systemPrompt = assembleSystemPrompt(instructions, CATEGORY_VALUES);
  const hash = inputHash(ctx, instructions);
  const prior = await query<StoredNote>(
    `SELECT ${NOTE_COLS} FROM assistant_notes WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [requestId],
  );
  if (prior.rows[0]?.inputHash === hash) return prior.rows[0];

  const chat = deps?.chat ?? defaultChat;
  const user = JSON.stringify({
    productHint: ctx.productHint,
    referenceText: ctx.referenceText,
    freeText: ctx.freeText,
    measurements: ctx.measures,
    reports: ctx.reports,
    history: ctx.historyMd ?? "NO HISTORY ON FILE",
    chosenHint: ctx.productHint,
    allowedCategories: CATEGORY_VALUES,
  });

  async function save(bullets: { text: string; sources: NoteSource[] }[], suggestedCategory: string | null) {
    const saved = await query<StoredNote>(
      `INSERT INTO assistant_notes (request_id, input_hash, bullets, history_state, suggested_category)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${NOTE_COLS}`,
      [requestId, hash, JSON.stringify(bullets), ctx.historyState, suggestedCategory],
    );
    return saved.rows[0];
  }

  let lastError: string | null = null;
  let guteBullets: { text: string; sources: NoteSource[] }[] | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const system =
      attempt === 0
        ? systemPrompt
        : `${systemPrompt}\nSTRIKTER NEUVERSUCH: Der vorherige Entwurf hat die Regeln verletzt (${lastError}). Korrigieren Sie ihn.`;
    const raw = await chat({ system, user });
    let parsed: { bullets?: { text: string; sources: NoteSource[] }[]; suggestedCategory?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = "not JSON";
      continue;
    }
    const problem = validateBullets(parsed.bullets ?? [], ctx);
    if (problem) {
      lastError = problem;
      continue;
    }
    guteBullets = parsed.bullets ?? [];
    const kat = validateCategory(parsed.suggestedCategory);
    if (!kat.problem) return save(guteBullets, kat.value);
    lastError = kat.problem;
  }
  // Nur die Kategorie schlug fehl (Bullets waren gültig) → mit null speichern.
  if (guteBullets) return save(guteBullets, null);
  throw new Error(`Assistant output failed validation: ${lastError}`);
}

export async function latestNote(requestId: string): Promise<StoredNote | null> {
  const res = await query<StoredNote>(
    `SELECT ${NOTE_COLS} FROM assistant_notes WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [requestId],
  );
  return res.rows[0] ?? null;
}
