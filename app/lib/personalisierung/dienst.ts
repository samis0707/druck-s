/**
 * Dienstschicht: Vorlage + Datensätze -> Prüfung, Vorschau, Druckdaten; Verknüpfung mit Anfragen;
 * Mengenbegrenzung für Gäste nach dem Muster der offenen Anfrage (Zählung im audit_log).
 * Es werden keine Datensatzwerte geloggt; Audit-Einträge enthalten nur Zähler und Kennungen.
 */
import { appendAudit } from "../auditLog";
import type { AuditAction } from "../audit";
import { config } from "../config";
import { query } from "../db";
import { addFile } from "../requests/store";
import { PersFehler } from "./dateien";
import { erzeugePdf, erzeugeVorschau, pruefeDatensaetze, RenderFehler, type Ergebnis } from "./render";
import type { Meldung } from "./render";
import { holeVorlage, ladeRessourcen, type VorlageDetail } from "./repo";
import { datensaetzeXlsx } from "./tabelle";
import { DatensatzSchema, type Datensatz } from "./schema";

export function renderGrenzen() {
  return { maxDatensaetze: config.personalisierung.maxDatensaetze, maxNutzen: config.personalisierung.maxNutzen };
}

/** Grenzen je IP und Stunde; 0 = unbegrenzt. Wirft PersFehler 429. */
export async function begrenzeJeIp(action: Extract<AuditAction, "pers_preview" | "pers_check" | "pers_table" | "pers_draft_created">, ip: string | null | undefined, limit: number): Promise<void> {
  if (limit <= 0 || !ip || ip === "unknown") return;
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_log WHERE action = $1 AND ip = $2 AND created_at > now() - interval '1 hour'`,
    [action, ip],
  );
  if (Number(r.rows[0]?.n ?? 0) >= limit) throw new PersFehler("Zu viele Anfragen von dieser Adresse, bitte später erneut versuchen.", 429, "rate_limited");
}

export async function zaehle(action: AuditAction, ip: string | null | undefined, actor: { type: "customer" | "staff" | "system"; id?: string | null } = { type: "system" }, detail: Record<string, unknown> = {}) {
  await appendAudit({ action, actorType: actor.type, actorId: actor.id ?? null, ip: ip ?? null, detail });
}

export function normalisiereDatensaetze(eingabe: unknown): Datensatz[] {
  if (!Array.isArray(eingabe)) throw new PersFehler("Die Datensätze müssen eine Liste sein.");
  if (eingabe.length > config.personalisierung.maxDatensaetze) {
    throw new PersFehler(`Es sind höchstens ${config.personalisierung.maxDatensaetze} Datensätze erlaubt.`, 413, "zu_viele");
  }
  return eingabe.map((d, i) => {
    const p = DatensatzSchema.safeParse(d);
    if (!p.success) throw new PersFehler(`Datensatz ${i + 1} ist ungültig.`);
    return p.data;
  });
}

function uebersetze(e: unknown): never {
  if (e instanceof RenderFehler) throw new PersFehler(e.message, e.code === "zu_viele_datensaetze" || e.code === "zu_viele_nutzen" ? 413 : 400, e.code);
  throw e;
}

export async function pruefe(d: VorlageDetail, datensaetze: Datensatz[]): Promise<Meldung[]> {
  try {
    return await pruefeDatensaetze(d.vorlage, await ladeRessourcen(d), datensaetze, renderGrenzen());
  } catch (e) {
    return uebersetze(e);
  }
}

export async function vorschau(d: VorlageDetail, datensatz: Datensatz | null): Promise<Ergebnis> {
  try {
    return await erzeugeVorschau(d.vorlage, await ladeRessourcen(d), datensatz);
  } catch (e) {
    return uebersetze(e);
  }
}

export interface DruckdatenErgebnis {
  pdfDateiId: string;
  datenDateiId: string;
  seiten: number;
  nutzen: number;
  boegen: number | null;
  meldungen: Meldung[];
}

/**
 * Erzeugt aus einer Vorlagen-Version und Datensätzen das Druck-PDF sowie die Datentabelle (XLSX) und
 * legt beides als request_files an der Anfrage ab (laufen so durch dieselbe Pipeline wie andere
 * Dateien) und verknüpft sie in pers_request_outputs. Bei Fehlermeldungen wird nichts abgelegt und
 * ein PersFehler mit Code "pruefung" geworfen (Meldungen in `details`).
 */
export async function erzeugeDruckdatenFuerAnfrage(
  requestId: string,
  opt: { templateId: string; version?: number; datensaetze: Datensatz[]; modus?: "einzeln" | "ausgeschossen"; actor?: { type: "customer" | "staff" | "system"; id?: string | null } },
): Promise<DruckdatenErgebnis> {
  const d = await holeVorlage(opt.templateId, opt.version);
  if (!d) throw new PersFehler("Vorlage nicht gefunden.", 404, "nicht_gefunden");
  const anfrage = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [requestId]);
  if (!anfrage.rows[0]) throw new PersFehler("Anfrage nicht gefunden.", 404, "nicht_gefunden");
  const modus = opt.modus ?? d.vorlage.ausgabe.modus;
  let ergebnis: Ergebnis;
  try {
    ergebnis = await erzeugePdf(d.vorlage, await ladeRessourcen(d), opt.datensaetze, { modus, grenzen: renderGrenzen() });
  } catch (e) {
    return uebersetze(e);
  }
  if (!ergebnis.pdf) {
    const err = new PersFehler(`Die Daten enthalten ${ergebnis.meldungen.filter((m) => m.schwere === "fehler").length} Fehler und können nicht erzeugt werden.`, 400, "pruefung");
    (err as PersFehler & { details?: Meldung[] }).details = ergebnis.meldungen;
    throw err;
  }
  const basis = d.vorlage.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "personalisierung";
  const pdf = await addFile(requestId, { fileName: `${basis}-druck.pdf`, mimeType: "application/pdf", bytes: Buffer.from(ergebnis.pdf) });
  const xlsx = datensaetzeXlsx(d.vorlage, opt.datensaetze);
  const daten = await addFile(requestId, {
    fileName: `${basis}-daten.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: Buffer.from(xlsx),
  });
  await query(
    `INSERT INTO pers_request_outputs (request_id, template_id, template_version, pdf_file_id, data_file_id, mode, record_count, nutzen_count, page_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [requestId, d.id, d.version, pdf.id, daten.id, modus, opt.datensaetze.length, ergebnis.nutzen, ergebnis.seiten],
  );
  await appendAudit({
    action: "pers_generated",
    actorType: opt.actor?.type ?? "system",
    actorId: opt.actor?.id ?? null,
    requestId,
    detail: { templateId: d.id, version: d.version, records: opt.datensaetze.length, pages: ergebnis.seiten, mode: modus },
  });
  return { pdfDateiId: pdf.id, datenDateiId: daten.id, seiten: ergebnis.seiten, nutzen: ergebnis.nutzen, boegen: ergebnis.boegen, meldungen: ergebnis.meldungen };
}
