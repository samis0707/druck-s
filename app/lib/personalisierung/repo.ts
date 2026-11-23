/**
 * Datenzugriff der Personalisierung (rohes SQL über lib/db.ts, Dateien im Objektspeicher).
 * Datensatzwerte (Personendaten) stehen ausschließlich in pers_drafts.records und in den
 * Anfrage-Dateien; sie werden nie geloggt.
 */
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import { scanBuffer } from "../clamav";
import { config } from "../config";
import { query, withTx } from "../db";
import { randomToken, safeEqual, sha256Hex } from "../crypto";
import { bucketName, getStorage } from "../storage";
import { getRequestFile, putRequestFile, sha256Hex as sha256Bytes } from "../storageFiles";
import { PersFehler, pruefeBild, pruefePdf, pruefeSchrift, type PdfInfo } from "./dateien";
import type { Ressourcen } from "./render/typen";
import {
  aktivierungsProbleme,
  DatensatzSchema,
  farbenInVorlage,
  FarbeSchema,
  parseVorlage,
  SICHTBARKEIT,
  STANDARD_FARBEN,
  STATUS,
  type Datensatz,
  type Farbe,
  type Sichtbarkeit,
  type SchriftSchnitt,
  type Vorlage,
  type VorlagenStatus,
} from "./schema";

// ---------------------------------------------------------------------------------------------
// Objektspeicher mit kleinem Cache (Dateien sind unveränderlich, der Schlüssel ist eindeutig)

const cache = new Map<string, Uint8Array>();
let cacheBytes = 0;
const CACHE_MAX_BYTES = 64 * 1024 * 1024;

async function lade(key: string): Promise<Uint8Array> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const bytes = new Uint8Array(await getRequestFile(key));
  if (bytes.length < CACHE_MAX_BYTES / 4) {
    cache.set(key, bytes);
    cacheBytes += bytes.length;
    while (cacheBytes > CACHE_MAX_BYTES) {
      const [aeltester] = cache.keys();
      cacheBytes -= cache.get(aeltester)?.length ?? 0;
      cache.delete(aeltester);
    }
  }
  return bytes;
}

async function loescheObjekt(key: string): Promise<void> {
  cache.delete(key);
  try {
    await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  } catch {
    // Objekt ist schon weg – die Zeile wird trotzdem entfernt.
  }
}

export type ScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "UNAVAILABLE";

/**
 * Virenprüfung beim Hochladen. Daemon-Modus: synchron (INFECTED lehnt ab, Scanner nicht erreichbar =
 * UNAVAILABLE, fail-open wie überall). Batch-Modus: PENDING; scripts/scan-pending.mjs prüft später und
 * setzt scan_status. Bis dahin darf Personal die Datei im Editor benutzen, die Vorlage lässt sich aber nicht
 * veröffentlichen (pruefeDateiScan), und INFECTED wird nie geliefert oder verwendet.
 */
async function virenpruefung(bytes: Uint8Array): Promise<{ status: ScanStatus; detail: string | null }> {
  if (config.clamav.mode !== "daemon") return { status: "PENDING", detail: null };
  const r = await scanBuffer(Buffer.from(bytes));
  if (r.status === "INFECTED") throw new PersFehler("Die Datei wurde vom Virenscanner abgelehnt.", 400, "malware");
  if (r.status === "UNAVAILABLE") return { status: "UNAVAILABLE", detail: r.detail.slice(0, 200) };
  return { status: "CLEAN", detail: null };
}

/**
 * Vor dem Veröffentlichen: alle Dateien und Schriften der Vorlage müssen geprüft und unbedenklich sein.
 * PENDING (Batch-Scan läuft noch) blockiert mit freundlichem Hinweis; INFECTED blockiert hart.
 * UNAVAILABLE (Scanner dauerhaft nicht erreichbar) blockiert nicht (fail-open wie bei allen Uploads).
 */
export async function pruefeDateiScan(v: Vorlage): Promise<void> {
  const dateiIds = [v.design.dateiId, v.ausgabe.ueberlagerung?.dateiId ?? null, ...v.felder.map((f) => (f.typ === "bild" ? f.dateiId : null))].filter((x): x is string => !!x);
  const familien = [...new Set(v.felder.flatMap((f) => ("schrift" in f && f.schrift.familie !== "Helvetica" ? [f.schrift.familie] : [])))];
  const d = dateiIds.length ? await query<{ file_name: string; scan_status: ScanStatus }>("SELECT file_name, scan_status FROM pers_files WHERE id = ANY($1::uuid[])", [dateiIds]) : { rows: [] };
  const f = familien.length ? await query<{ family: string; scan_status: ScanStatus }>("SELECT family, scan_status FROM pers_fonts WHERE family = ANY($1)", [familien]) : { rows: [] };
  const befallen = [...d.rows.filter((r) => r.scan_status === "INFECTED").map((r) => r.file_name), ...f.rows.filter((r) => r.scan_status === "INFECTED").map((r) => r.family)];
  if (befallen.length) throw new PersFehler(`Der Virenscan hat in „${befallen[0]}“ Schadsoftware gefunden. Bitte die Datei ersetzen.`, 400, "malware");
  const offen = d.rows.filter((r) => r.scan_status === "PENDING").length + f.rows.filter((r) => r.scan_status === "PENDING").length;
  if (offen) throw new PersFehler("Die Virenprüfung der hochgeladenen Dateien läuft noch (meist wenige Minuten). Danach lässt sich die Vorlage veröffentlichen.", 409, "scan_ausstehend");
}

// ---------------------------------------------------------------------------------------------
// Dateien (Design, Überlagerung, Bilder)

export type DateiArt = "design" | "ueberlagerung" | "bild";

export interface PersDatei {
  id: string;
  art: DateiArt;
  name: string;
  mime: string;
  groesse: number;
  seiten: number | null;
  breiteMm: number | null;
  hoeheMm: number | null;
  createdAt: string;
  scanStatus: ScanStatus;
}

const DATEI_COLS = `id, kind AS "art", file_name AS "name", mime_type AS mime, size_bytes::int AS groesse, pages AS seiten,
  width_mm::float AS "breiteMm", height_mm::float AS "hoeheMm", created_at AS "createdAt", scan_status AS "scanStatus"`;

function sicherDateiname(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "datei";
}

export async function speichereDatei(art: DateiArt, name: string, bytes: Uint8Array, userId: string | null): Promise<{ datei: PersDatei; pdf?: PdfInfo }> {
  const cfg = config.personalisierung;
  let mime = "application/pdf";
  let info: PdfInfo | null = null;
  let breite: number | null = null;
  let hoehe: number | null = null;
  let seiten: number | null = null;
  if (art === "bild") {
    const b = await pruefeBild(bytes, cfg.maxImageBytes);
    mime = b.mime;
  } else {
    info = await pruefePdf(bytes, cfg.maxDesignBytes);
    seiten = info.seiten;
    breite = info.breiteMm;
    hoehe = info.hoeheMm;
  }
  const scan = await virenpruefung(bytes);
  const key = `personalisierung/dateien/${randomUUID()}`;
  await putRequestFile(key, Buffer.from(bytes), mime);
  const res = await query<PersDatei>(
    `INSERT INTO pers_files (kind, storage_key, file_name, mime_type, size_bytes, sha256, pages, width_mm, height_mm, created_by, scan_status, scan_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${DATEI_COLS}`,
    [art, key, sicherDateiname(name), mime, bytes.length, sha256Bytes(Buffer.from(bytes)), seiten, breite, hoehe, userId, scan.status, scan.detail],
  );
  return { datei: res.rows[0], pdf: info ?? undefined };
}

export async function holeDatei(id: string): Promise<PersDatei | null> {
  if (!istUuid(id)) return null;
  const r = await query<PersDatei>(`SELECT ${DATEI_COLS} FROM pers_files WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function dateiBytes(id: string): Promise<Uint8Array | null> {
  if (!istUuid(id)) return null;
  const r = await query<{ storage_key: string; scan_status: ScanStatus }>("SELECT storage_key, scan_status FROM pers_files WHERE id = $1", [id]);
  // Als befallen erkannte Dateien werden nie geliefert oder verwendet.
  return r.rows[0] && r.rows[0].scan_status !== "INFECTED" ? lade(r.rows[0].storage_key) : null;
}

// ---------------------------------------------------------------------------------------------
// Schriften

export interface PersSchrift {
  id: string;
  familie: string;
  schnitt: SchriftSchnitt;
  name: string;
  groesse: number;
  scanStatus: ScanStatus;
}
const SCHRIFT_COLS = `id, family AS familie, style AS schnitt, file_name AS name, size_bytes::int AS groesse, scan_status AS "scanStatus"`;

export async function speichereSchrift(
  bytes: Uint8Array,
  opt: { dateiname: string; familie?: string; schnitt?: SchriftSchnitt; userId: string | null },
): Promise<PersSchrift> {
  const info = pruefeSchrift(bytes, config.personalisierung.maxFontBytes);
  const familie = (opt.familie ?? info.familie).trim().slice(0, 80);
  const schnitt = opt.schnitt ?? info.schnitt;
  if (!familie) throw new PersFehler("Die Schriftfamilie darf nicht leer sein.");
  if (familie === "Helvetica") throw new PersFehler("„Helvetica“ ist die eingebaute Standardschrift und kann nicht ersetzt werden.");
  const scan = await virenpruefung(bytes);
  const key = `personalisierung/schriften/${randomUUID()}`;
  await putRequestFile(key, Buffer.from(bytes), "font/ttf");
  const alt = await query<{ storage_key: string }>("SELECT storage_key FROM pers_fonts WHERE family = $1 AND style = $2", [familie, schnitt]);
  const res = await query<PersSchrift>(
    `INSERT INTO pers_fonts (family, style, file_name, storage_key, size_bytes, sha256, created_by, scan_status, scan_attempts, scan_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
     ON CONFLICT (family, style) DO UPDATE SET file_name = EXCLUDED.file_name, storage_key = EXCLUDED.storage_key,
       size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, created_by = EXCLUDED.created_by, created_at = now(),
       scan_status = EXCLUDED.scan_status, scan_attempts = 0, scan_detail = EXCLUDED.scan_detail
     RETURNING ${SCHRIFT_COLS}`,
    [familie, schnitt, sicherDateiname(opt.dateiname), key, bytes.length, sha256Bytes(Buffer.from(bytes)), opt.userId, scan.status, scan.detail],
  );
  if (alt.rows[0]) await loescheObjekt(alt.rows[0].storage_key);
  return res.rows[0];
}

export async function listeSchriften(): Promise<PersSchrift[]> {
  const r = await query<PersSchrift>(`SELECT ${SCHRIFT_COLS} FROM pers_fonts ORDER BY family, style`);
  return r.rows;
}

/** Wird die Familie von einer Vorlagen-Version verwendet? */
async function schriftVerwendet(familie: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM pers_template_versions v, jsonb_array_elements(v.spec->'felder') f
      WHERE f->'schrift'->>'familie' = $1 LIMIT 1`,
    [familie],
  );
  return r.rows.length > 0;
}

export async function loescheSchrift(id: string): Promise<boolean> {
  if (!istUuid(id)) return false;
  const r = await query<{ family: string; style: string; storage_key: string }>("SELECT family, style, storage_key FROM pers_fonts WHERE id = $1", [id]);
  const s = r.rows[0];
  if (!s) return false;
  const gleicheFamilie = await query("SELECT 1 FROM pers_fonts WHERE family = $1 AND id <> $2", [s.family, id]);
  if (gleicheFamilie.rows.length === 0 && (await schriftVerwendet(s.family))) {
    throw new PersFehler(`Die Schrift „${s.family}“ wird in Vorlagen verwendet und kann nicht gelöscht werden.`, 409, "in_verwendung");
  }
  await query("DELETE FROM pers_fonts WHERE id = $1", [id]);
  await loescheObjekt(s.storage_key);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Farben

export interface PersFarbe extends Farbe {
  id: string;
}
const FARBE_COLS = `id, name, jsonb_build_array(c::float, m::float, y::float, k::float) AS cmyk, spot_name AS sonderfarbe`;

export async function listeFarben(): Promise<PersFarbe[]> {
  const r = await query<PersFarbe>(`SELECT ${FARBE_COLS} FROM pers_colors ORDER BY name`);
  return r.rows;
}

export async function speichereFarbe(eingabe: unknown, id?: string): Promise<PersFarbe> {
  const p = FarbeSchema.safeParse(eingabe);
  if (!p.success) throw new PersFehler(p.error.issues.map((i) => i.message).join("; "));
  const f = p.data;
  try {
    const params = [f.name, ...f.cmyk, f.sonderfarbe ?? null];
    const r = id
      ? await query<PersFarbe>(`UPDATE pers_colors SET name = $2, c = $3, m = $4, y = $5, k = $6, spot_name = $7 WHERE id = $1 RETURNING ${FARBE_COLS}`, [id, ...params])
      : await query<PersFarbe>(`INSERT INTO pers_colors (name, c, m, y, k, spot_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FARBE_COLS}`, params);
    if (!r.rows[0]) throw new PersFehler("Farbe nicht gefunden.", 404, "nicht_gefunden");
    return r.rows[0];
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new PersFehler(`Es gibt schon eine Farbe „${f.name}“.`, 409, "doppelt");
    throw e;
  }
}

export async function loescheFarbe(id: string): Promise<boolean> {
  if (!istUuid(id)) return false;
  const r = await query<{ name: string }>("SELECT name FROM pers_colors WHERE id = $1", [id]);
  const farbe = r.rows[0];
  if (!farbe) return false;
  // Aktive Versionen tragen einen Farb-Schnappschuss; nur der aktuelle Stand (Entwürfe) blockiert.
  const v = await query(
    `SELECT 1 FROM pers_templates t JOIN pers_template_versions v ON v.template_id = t.id AND v.version = t.current_version,
       jsonb_array_elements(v.spec->'felder') f
      WHERE t.archived_at IS NULL AND (f->>'farbe' = $1 OR f->>'hintergrund' = $1) LIMIT 1`,
    [farbe.name],
  );
  if (v.rows.length > 0) throw new PersFehler(`Die Farbe „${farbe.name}“ wird in Vorlagen verwendet und kann nicht gelöscht werden.`, 409, "in_verwendung");
  await query("DELETE FROM pers_colors WHERE id = $1", [id]);
  return true;
}

async function farbSchnappschuss(vorlage: Vorlage, client?: PoolClient): Promise<Farbe[]> {
  const namen = farbenInVorlage(vorlage);
  if (namen.length === 0) return [];
  const q = client ? client.query.bind(client) : query;
  const r = await q(`SELECT ${FARBE_COLS} FROM pers_colors WHERE name = ANY($1)`, [namen]);
  const gefunden = new Map((r.rows as Farbe[]).map((f) => [f.name, { name: f.name, cmyk: f.cmyk, sonderfarbe: f.sonderfarbe ?? null } as Farbe]));
  return namen.map((n) => gefunden.get(n) ?? STANDARD_FARBEN.find((s) => s.name === n)).filter((f): f is Farbe => !!f);
}

// ---------------------------------------------------------------------------------------------
// Vorlagen

export interface VorlagenStamm {
  id: string;
  name: string;
  status: VorlagenStatus;
  sichtbarkeit: Sichtbarkeit;
  aktuelleVersion: number;
  archiviert: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VorlageDetail extends VorlagenStamm {
  /** Geladene Version (bei Entwürfen die Version, an der sie hängen; `aktuelleVersion` ist die neueste) */
  version: number;
  vorlage: Vorlage;
  /** Farben, wie sie in dieser Version gelten (Schnappschuss) */
  farben: Farbe[];
}

const STAMM_COLS = `t.id, t.name, t.status, t.visibility AS sichtbarkeit, t.current_version AS "aktuelleVersion",
  (t.archived_at IS NOT NULL) AS archiviert, t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

export function istUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function vorlageAusSpec(spec: unknown): Vorlage {
  const p = parseVorlage(spec);
  if (!p.ok) throw new Error("Gespeicherte Vorlage entspricht nicht mehr dem Schema");
  return p.vorlage;
}

function pruefeEingabe(eingabe: unknown): Vorlage {
  const p = parseVorlage(eingabe);
  if (!p.ok) throw new PersFehler(p.fehler.map((f) => `${f.pfad ? f.pfad + ": " : ""}${f.text}`).join("; "), 400, "schema");
  return p.vorlage;
}

/** Dateien, auf die die Vorlage verweist, müssen existieren und die richtige Art haben. */
async function pruefeDateiVerweise(v: Vorlage): Promise<void> {
  const erwartet: [string | null, DateiArt, string][] = [
    [v.design.dateiId, "design", "Design-PDF"],
    [v.ausgabe.ueberlagerung?.dateiId ?? null, "ueberlagerung", "Überlagerungs-PDF"],
  ];
  for (const f of v.felder) if (f.typ === "bild") erwartet.push([f.dateiId, "bild", "Bild"]);
  for (const [id, art, name] of erwartet) {
    if (!id) continue;
    const d = await holeDatei(id);
    // Das Überlagerungs-PDF darf auch als Design-Datei hochgeladen worden sein (beides PDF).
    const ok = d && (d.art === art || (art !== "bild" && d.art !== "bild"));
    if (!ok) throw new PersFehler(`${name}: Die Datei existiert nicht oder hat den falschen Typ.`, 400, "datei");
  }
  if (v.design.dateiId) {
    const d = await holeDatei(v.design.dateiId);
    if (d?.seiten && (v.design.vorne > d.seiten || (v.design.hinten ?? 0) > d.seiten)) {
      throw new PersFehler(`Das Design-PDF hat nur ${d.seiten} Seite(n).`, 400, "seite");
    }
  }
}

export async function erstelleVorlage(
  eingabe: unknown,
  opt: { userId: string | null; status?: VorlagenStatus; sichtbarkeit?: Sichtbarkeit; importQuelle?: string },
): Promise<VorlageDetail> {
  const v = pruefeEingabe(eingabe);
  await pruefeDateiVerweise(v);
  const status = opt.status ?? "entwurf";
  if (status === "aktiv") {
    pruefeAktivierung(v);
    await pruefeDateiScan(v);
  }
  const farben = await farbSchnappschuss(v);
  const id = await withTx(async (c) => {
    const t = await c.query<{ id: string }>(
      `INSERT INTO pers_templates (name, status, visibility, created_by, import_source) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [v.name, status, opt.sichtbarkeit ?? "mitarbeiter", opt.userId, opt.importQuelle ?? null],
    );
    await c.query(`INSERT INTO pers_template_versions (template_id, version, spec, colors, created_by) VALUES ($1, 1, $2, $3, $4)`, [t.rows[0].id, JSON.stringify(v), JSON.stringify(farben), opt.userId]);
    return t.rows[0].id;
  });
  return (await holeVorlage(id))!;
}

function pruefeAktivierung(v: Vorlage) {
  const p = aktivierungsProbleme(v);
  if (p.length) throw new PersFehler(`Die Vorlage kann noch nicht aktiviert werden: ${p.join(" ")}`, 400, "nicht_aktivierbar");
}

export async function holeVorlage(id: string, version?: number): Promise<VorlageDetail | null> {
  if (!istUuid(id)) return null;
  const r = await query<VorlagenStamm & { spec: unknown; colors: Farbe[] }>(
    `SELECT ${STAMM_COLS}, v.spec, v.colors FROM pers_templates t
       JOIN pers_template_versions v ON v.template_id = t.id AND v.version = COALESCE($2::int, t.current_version)
      WHERE t.id = $1`,
    [id, version ?? null],
  );
  const row = r.rows[0];
  if (!row) return null;
  const { spec, colors, ...stamm } = row;
  return { ...stamm, version: version ?? stamm.aktuelleVersion, vorlage: vorlageAusSpec(spec), farben: colors };
}

export interface VorlagenKarte extends VorlagenStamm {
  /** Design-PDF (Vorschaubild der Vorderseite) und Endformat des aktuellen Bearbeitungsstands */
  designDateiId: string | null;
  /** Seite (ab 1) der Vorderseite im Design-PDF */
  designVorne: number;
  endformat: { breite: number; hoehe: number } | null;
  kundenAnzahl: number;
  /** Es gibt Änderungen in der Arbeitskopie, die noch nicht veröffentlicht sind. */
  ungespeichert: boolean;
  /** Letzte Änderung der Arbeitskopie bzw. der Vorlage */
  geaendertAm: string;
}

/** Vorlagenübersicht für Karten: neuester Bearbeitungsstand (Arbeitskopie vor Version). */
export async function listeVorlagen(opt: { archivierte?: boolean } = {}): Promise<VorlagenKarte[]> {
  const r = await query<VorlagenKarte>(
    `SELECT t.id, COALESCE(t.working_spec->>'name', t.name) AS name, t.status, t.visibility AS sichtbarkeit, t.current_version AS "aktuelleVersion",
            (t.archived_at IS NOT NULL) AS archiviert, t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            COALESCE(t.working_spec, v.spec)->'design'->>'dateiId' AS "designDateiId",
            COALESCE((COALESCE(t.working_spec, v.spec)->'design'->>'vorne')::int, 1) AS "designVorne",
            CASE WHEN COALESCE(t.working_spec, v.spec)->'endformat' IS NOT NULL
                 THEN jsonb_build_object('breite', (COALESCE(t.working_spec, v.spec)->'endformat'->>'breite')::float, 'hoehe', (COALESCE(t.working_spec, v.spec)->'endformat'->>'hoehe')::float) END AS endformat,
            (SELECT count(*)::int FROM pers_template_customers c WHERE c.template_id = t.id) AS "kundenAnzahl",
            (t.working_spec IS NOT NULL) AS ungespeichert,
            GREATEST(t.updated_at, COALESCE(t.working_updated_at, t.updated_at)) AS "geaendertAm"
       FROM pers_templates t
       JOIN pers_template_versions v ON v.template_id = t.id AND v.version = t.current_version
      WHERE ($1::boolean OR t.archived_at IS NULL)
      ORDER BY GREATEST(t.updated_at, COALESCE(t.working_updated_at, t.updated_at)) DESC`,
    [opt.archivierte ?? false],
  );
  return r.rows;
}

// ---------------------------------------------------------------------------------------------
// Arbeitskopie: der Editor speichert laufend hier, ohne neue Version und ohne Prüfung der Vollständigkeit

export interface Arbeitskopie {
  spec: unknown;
  geaendertAm: string;
}

export async function holeArbeitskopie(id: string): Promise<Arbeitskopie | null> {
  if (!istUuid(id)) return null;
  const r = await query<{ spec: unknown; at: string }>("SELECT working_spec AS spec, working_updated_at AS at FROM pers_templates WHERE id = $1 AND working_spec IS NOT NULL", [id]);
  return r.rows[0] ? { spec: r.rows[0].spec, geaendertAm: r.rows[0].at } : null;
}

const MAX_ARBEITSKOPIE_BYTES = 512 * 1024;

/**
 * Zwischenstand speichern. Absichtlich nur grob geprüft (Objekt mit Namen, Größe), damit Autospeichern
 * auch bei halbfertigen Vorlagen klappt; streng wird erst beim Veröffentlichen geprüft.
 */
export async function speichereArbeitskopie(id: string, spec: unknown): Promise<boolean> {
  if (!istUuid(id)) return false;
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) throw new PersFehler("Die Vorlage muss ein Objekt sein.");
  const roh = JSON.stringify(spec);
  if (Buffer.byteLength(roh) > MAX_ARBEITSKOPIE_BYTES) throw new PersFehler("Die Vorlage ist zu groß.", 413, "zu_gross");
  const name = (spec as { name?: unknown }).name;
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 120) throw new PersFehler("Bitte einen Namen (höchstens 120 Zeichen) vergeben.");
  const r = await query("UPDATE pers_templates SET working_spec = $2::jsonb, working_updated_at = now() WHERE id = $1 AND archived_at IS NULL", [id, roh]);
  return (r.rowCount ?? 0) > 0;
}

/** Änderungen verwerfen: zurück auf den veröffentlichten bzw. gespeicherten Stand. */
export async function verwerfeArbeitskopie(id: string): Promise<boolean> {
  if (!istUuid(id)) return false;
  const r = await query("UPDATE pers_templates SET working_spec = NULL, working_updated_at = NULL WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Veröffentlichen: strenge Prüfung der Arbeitskopie, danach aktiv. Aktive Vorlagen erhalten dabei eine neue,
 * unveränderliche Version; laufende Entwürfe bleiben an der alten Version.
 */
export async function veroeffentlicheVorlage(id: string, opt: { sichtbarkeit?: Sichtbarkeit; userId: string | null }): Promise<VorlageDetail | null> {
  const arbeit = await holeArbeitskopie(id);
  const aktuell = await holeVorlage(id);
  if (!aktuell) return null;
  const vorlage = arbeit ? arbeit.spec : aktuell.vorlage;
  return aktualisiereVorlage(id, { vorlage, status: "aktiv", sichtbarkeit: opt.sichtbarkeit }, opt.userId);
}

/**
 * Änderung speichern. Aktive Vorlagen (und Vorlagen, deren aktuelle Version Entwürfe hat) bekommen
 * eine NEUE Version; laufende Entwürfe bleiben an der alten, unveränderten Version.
 */
export async function aktualisiereVorlage(
  id: string,
  aenderung: { vorlage?: unknown; status?: VorlagenStatus; sichtbarkeit?: Sichtbarkeit },
  userId: string | null,
): Promise<VorlageDetail | null> {
  if (!istUuid(id)) return null;
  if (aenderung.status && !STATUS.includes(aenderung.status)) throw new PersFehler("Ungültiger Status.");
  if (aenderung.sichtbarkeit && !SICHTBARKEIT.includes(aenderung.sichtbarkeit)) throw new PersFehler("Ungültige Sichtbarkeit.");
  const neu = aenderung.vorlage !== undefined ? pruefeEingabe(aenderung.vorlage) : null;
  if (neu) await pruefeDateiVerweise(neu);
  const ergebnis = await withTx(async (c) => {
    const t = await c.query<{ status: VorlagenStatus; current_version: number; archived_at: string | null }>(
      "SELECT status, current_version, archived_at FROM pers_templates WHERE id = $1 FOR UPDATE",
      [id],
    );
    const cur = t.rows[0];
    if (!cur) return false;
    const zielStatus = aenderung.status ?? cur.status;
    let version = cur.current_version;
    if (neu) {
      const farben = await farbSchnappschuss(neu, c);
      const entwuerfe = await c.query("SELECT 1 FROM pers_drafts WHERE template_id = $1 AND template_version = $2 LIMIT 1", [id, version]);
      if (cur.status === "aktiv" || entwuerfe.rows.length > 0) {
        version += 1;
        await c.query(`INSERT INTO pers_template_versions (template_id, version, spec, colors, created_by) VALUES ($1, $2, $3, $4, $5)`, [id, version, JSON.stringify(neu), JSON.stringify(farben), userId]);
      } else {
        await c.query("UPDATE pers_template_versions SET spec = $3, colors = $4 WHERE template_id = $1 AND version = $2", [id, version, JSON.stringify(neu), JSON.stringify(farben)]);
      }
    }
    if (zielStatus === "aktiv") {
      const spec = await c.query<{ spec: unknown }>("SELECT spec FROM pers_template_versions WHERE template_id = $1 AND version = $2", [id, version]);
      const aktiv = vorlageAusSpec(spec.rows[0].spec);
      pruefeAktivierung(aktiv);
      await pruefeDateiScan(aktiv);
    }
    await c.query(
      `UPDATE pers_templates SET name = COALESCE($2, name), status = $3, visibility = COALESCE($4, visibility),
         current_version = $5, updated_at = now(),
         working_spec = CASE WHEN $6::boolean THEN NULL ELSE working_spec END,
         working_updated_at = CASE WHEN $6::boolean THEN NULL ELSE working_updated_at END WHERE id = $1`,
      [id, neu?.name ?? null, zielStatus, aenderung.sichtbarkeit ?? null, version, neu !== null],
    );
    return true;
  });
  return ergebnis ? holeVorlage(id) : null;
}

/** Archivieren (statt löschen): Verknüpfungen mit Anfragen bleiben nachvollziehbar. */
export async function archiviereVorlage(id: string, archiviert = true): Promise<boolean> {
  if (!istUuid(id)) return false;
  const r = await query(`UPDATE pers_templates SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END, status = CASE WHEN $2 THEN 'entwurf' ELSE status END, updated_at = now() WHERE id = $1`, [id, archiviert]);
  return (r.rowCount ?? 0) > 0;
}

/** Duplizieren (Entwurf, gleiche Dateien, nur Mitarbeiter). */
export async function dupliziereVorlage(id: string, userId: string | null): Promise<VorlageDetail | null> {
  const q = await holeVorlage(id);
  if (!q) return null;
  return erstelleVorlage({ ...q.vorlage, name: `${q.vorlage.name} (Kopie)` }, { userId });
}

// ---------------------------------------------------------------------------------------------
// Sichtbarkeit: Kunden und Links

export async function setzeKunden(templateId: string, kundenIds: string[]): Promise<void> {
  if (!istUuid(templateId)) throw new PersFehler("Vorlage nicht gefunden.", 404, "nicht_gefunden");
  await withTx(async (c) => {
    await c.query("DELETE FROM pers_template_customers WHERE template_id = $1", [templateId]);
    for (const k of [...new Set(kundenIds)]) {
      const u = await c.query(`SELECT 1 FROM "user" WHERE id = $1 AND role = 'customer'`, [k]);
      if (u.rows.length === 0) throw new PersFehler("Unbekannter Kunde in der Auswahl.", 400, "kunde");
      await c.query("INSERT INTO pers_template_customers (template_id, customer_id) VALUES ($1, $2)", [templateId, k]);
    }
  });
}

export async function listeKunden(templateId: string): Promise<{ id: string; email: string; name: string | null }[]> {
  const r = await query<{ id: string; email: string; name: string | null }>(
    `SELECT u.id, u.email, u.name FROM pers_template_customers c JOIN "user" u ON u.id = c.customer_id WHERE c.template_id = $1 ORDER BY u.email`,
    [templateId],
  );
  return r.rows;
}

/** Aktive Vorlagen, die ein angemeldeter Kunde nutzen darf (öffentliche und ihm zugeordnete). */
export async function vorlagenFuerKunde(kundeId: string): Promise<VorlagenStamm[]> {
  const r = await query<VorlagenStamm>(
    `SELECT ${STAMM_COLS} FROM pers_templates t
      WHERE t.status = 'aktiv' AND t.archived_at IS NULL
        AND (t.visibility = 'oeffentlich'
             OR (t.visibility = 'kunden' AND EXISTS (SELECT 1 FROM pers_template_customers c WHERE c.template_id = t.id AND c.customer_id = $1)))
      ORDER BY t.name`,
    [kundeId],
  );
  return r.rows;
}

export interface ZugriffsLink {
  id: string;
  templateId: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}
const LINK_COLS = `id, template_id AS "templateId", label, created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`;

/** Link für "öffentlich per Link". Das Token wird nur hier im Klartext zurückgegeben. */
export async function erstelleLink(templateId: string, opt: { label?: string; ablaufTage?: number | null; userId: string | null }): Promise<{ link: ZugriffsLink; token: string }> {
  if (!istUuid(templateId)) throw new PersFehler("Vorlage nicht gefunden.", 404, "nicht_gefunden");
  const token = randomToken(32);
  const r = await query<ZugriffsLink>(
    `INSERT INTO pers_access_links (template_id, token_hash, label, created_by, expires_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END) RETURNING ${LINK_COLS}`,
    [templateId, sha256Hex(token), (opt.label ?? "").slice(0, 120), opt.userId, opt.ablaufTage ?? null],
  );
  return { link: r.rows[0], token };
}

export async function listeLinks(templateId: string): Promise<ZugriffsLink[]> {
  const r = await query<ZugriffsLink>(`SELECT ${LINK_COLS} FROM pers_access_links WHERE template_id = $1 ORDER BY created_at DESC`, [templateId]);
  return r.rows;
}

export async function widerrufeLink(id: string): Promise<boolean> {
  if (!istUuid(id)) return false;
  const r = await query("UPDATE pers_access_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [id]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Token auflösen. Nur wenn der Link nicht widerrufen/abgelaufen ist UND die Vorlage aktiv,
 * nicht archiviert und öffentlich ist. Sonst null (die Route antwortet einheitlich mit 404).
 */
export async function loeseLinkAuf(token: string): Promise<{ link: ZugriffsLink; vorlage: VorlageDetail } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await query<ZugriffsLink>(
    `SELECT l.id, l.template_id AS "templateId", l.label, l.created_at AS "createdAt", l.expires_at AS "expiresAt", l.revoked_at AS "revokedAt"
       FROM pers_access_links l
       JOIN pers_templates t ON t.id = l.template_id
      WHERE l.token_hash = $1 AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now())
        AND t.status = 'aktiv' AND t.visibility = 'oeffentlich' AND t.archived_at IS NULL`,
    [sha256Hex(token)],
  );
  const link = r.rows[0];
  if (!link) return null;
  const vorlage = await holeVorlage(link.templateId);
  return vorlage ? { link, vorlage } : null;
}

// ---------------------------------------------------------------------------------------------
// Ansicht für Kunden und Gäste: nur das, was sie brauchen

export interface KundenAnsicht {
  id: string;
  name: string;
  beschreibung: string;
  version: number;
  endformat: Vorlage["endformat"];
  beschnitt: number;
  hatRueckseite: boolean;
  variablen: Vorlage["variablen"];
  grenzen: { maxDatensaetze: number; maxNutzen: number };
}

export function kundenAnsicht(d: VorlageDetail): KundenAnsicht {
  return {
    id: d.id,
    name: d.vorlage.name,
    beschreibung: d.vorlage.beschreibung,
    version: d.version,
    endformat: d.vorlage.endformat,
    beschnitt: d.vorlage.beschnitt,
    hatRueckseite: d.vorlage.design.hinten !== null,
    variablen: d.vorlage.variablen,
    grenzen: { maxDatensaetze: config.personalisierung.maxDatensaetze, maxNutzen: config.personalisierung.maxNutzen },
  };
}

// ---------------------------------------------------------------------------------------------
// Ressourcen für die Render-Engine

export async function ladeRessourcen(d: Pick<VorlageDetail, "vorlage" | "farben">): Promise<Ressourcen> {
  const v = d.vorlage;
  const design = v.design.dateiId ? await dateiBytes(v.design.dateiId) : null;
  const ueberlagerung = v.ausgabe.ueberlagerung ? await dateiBytes(v.ausgabe.ueberlagerung.dateiId) : null;
  const bilder: Record<string, Uint8Array> = {};
  for (const f of v.felder) {
    if (f.typ === "bild" && f.dateiId && !bilder[f.dateiId]) {
      const b = await dateiBytes(f.dateiId);
      if (b) bilder[f.dateiId] = b;
    }
  }
  const familien = [...new Set(v.felder.flatMap((f) => ("schrift" in f ? [f.schrift.familie] : [])))].filter((f) => f !== "Helvetica");
  const schriften: Ressourcen["schriften"] = [];
  if (familien.length) {
    const r = await query<{ family: string; style: SchriftSchnitt; storage_key: string }>("SELECT family, style, storage_key FROM pers_fonts WHERE family = ANY($1) AND scan_status <> 'INFECTED'", [familien]);
    for (const row of r.rows) schriften.push({ familie: row.family, schnitt: row.style, bytes: await lade(row.storage_key) });
  }
  return { design, ueberlagerung, schriften, bilder, farben: d.farben };
}

// ---------------------------------------------------------------------------------------------
// Entwürfe (Gäste und Kunden): Datensätze nur kurz aufbewahren

export interface Entwurf {
  id: string;
  templateId: string;
  templateVersion: number;
  datensaetze: Datensatz[];
  einstellungen: Record<string, unknown>;
  expiresAt: string;
  updatedAt: string;
  /** Offene Anfrage, die auf die Bestätigung per Code wartet (Absenden als Gast) */
  requestId: string | null;
}

const ENTWURF_COLS = `id, template_id AS "templateId", template_version AS "templateVersion", records AS datensaetze,
  settings AS einstellungen, expires_at AS "expiresAt", updated_at AS "updatedAt", request_id AS "requestId"`;

function pruefeDatensaetze(eingabe: unknown): Datensatz[] {
  if (!Array.isArray(eingabe)) throw new PersFehler("Die Datensätze müssen eine Liste sein.");
  if (eingabe.length > config.personalisierung.maxDatensaetze) {
    throw new PersFehler(`Es sind höchstens ${config.personalisierung.maxDatensaetze} Datensätze erlaubt.`, 413, "zu_viele");
  }
  const out: Datensatz[] = [];
  for (const [i, d] of eingabe.entries()) {
    const p = DatensatzSchema.safeParse(d);
    if (!p.success) throw new PersFehler(`Datensatz ${i + 1} ist ungültig.`);
    out.push(p.data);
  }
  return out;
}

/** Legt einen Entwurf zur aktuellen Version an; das Token wird nur hier im Klartext geliefert. */
export async function legeEntwurfAn(templateId: string, opt: { linkId?: string | null } = {}): Promise<{ entwurf: Entwurf; token: string }> {
  const token = randomToken(32);
  const r = await query<Entwurf>(
    `INSERT INTO pers_drafts (template_id, template_version, link_id, access_hash, expires_at)
     SELECT t.id, t.current_version, $2, $3, now() + make_interval(secs => $4::float * 3600)
       FROM pers_templates t WHERE t.id = $1 AND t.status = 'aktiv' AND t.archived_at IS NULL
     RETURNING ${ENTWURF_COLS}`,
    [templateId, opt.linkId ?? null, sha256Hex(token), config.personalisierung.draftTtlHours],
  );
  if (!r.rows[0]) throw new PersFehler("Vorlage nicht gefunden.", 404, "nicht_gefunden");
  return { entwurf: r.rows[0], token };
}

/** Entwurf lesen; null bei falschem Token, abgelaufen oder unbekannt (einheitlich, kein Rateorakel). */
export async function holeEntwurf(id: string, token: string): Promise<Entwurf | null> {
  if (!istUuid(id) || !/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await query<Entwurf & { accessHash: string }>(`SELECT ${ENTWURF_COLS}, access_hash AS "accessHash" FROM pers_drafts WHERE id = $1 AND expires_at > now()`, [id]);
  const row = r.rows[0];
  if (!row || !safeEqual(row.accessHash, sha256Hex(token))) return null;
  const { accessHash: _h, ...entwurf } = row;
  void _h;
  return entwurf;
}

/** Datensätze speichern; verlängert die Lebensdauer ab jetzt (gleitend). */
export async function speichereEntwurf(id: string, token: string, daten: { datensaetze?: unknown; einstellungen?: Record<string, unknown> }): Promise<Entwurf | null> {
  const cur = await holeEntwurf(id, token);
  if (!cur) return null;
  const recs = daten.datensaetze !== undefined ? pruefeDatensaetze(daten.datensaetze) : null;
  if (daten.einstellungen && JSON.stringify(daten.einstellungen).length > 4000) throw new PersFehler("Die Einstellungen sind zu groß.");
  const r = await query<Entwurf>(
    `UPDATE pers_drafts SET records = COALESCE($3::jsonb, records), settings = COALESCE($4::jsonb, settings), updated_at = now(),
       expires_at = now() + make_interval(secs => $5::float * 3600)
      WHERE id = $1 AND access_hash = $2 RETURNING ${ENTWURF_COLS}`,
    [id, sha256Hex(token), recs ? JSON.stringify(recs) : null, daten.einstellungen ? JSON.stringify(daten.einstellungen) : null, config.personalisierung.draftTtlHours],
  );
  return r.rows[0] ?? null;
}

export async function loescheEntwurf(id: string, token: string): Promise<boolean> {
  const r = await query("DELETE FROM pers_drafts WHERE id = $1 AND access_hash = $2", [id, sha256Hex(token)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Abgelaufene Entwürfe löschen (Datensätze = Personendaten) und Versionen aufräumen, die weder
 * aktuell noch von Entwürfen oder Anfragen benötigt werden.
 */
export async function sweepAbgelaufeneEntwuerfe(): Promise<number> {
  const r = await query("DELETE FROM pers_drafts WHERE expires_at <= now()");
  const n = r.rowCount ?? 0;
  await query(
    `DELETE FROM pers_template_versions v USING pers_templates t
      WHERE t.id = v.template_id AND v.version < t.current_version
        AND NOT EXISTS (SELECT 1 FROM pers_drafts d WHERE d.template_id = v.template_id AND d.template_version = v.version)
        AND NOT EXISTS (SELECT 1 FROM pers_request_outputs o WHERE o.template_id = v.template_id AND o.template_version = v.version)`,
  );
  if (n > 0) {
    await query(`INSERT INTO audit_log (action, actor_type, detail) VALUES ('pers_drafts_swept', 'system', $1)`, [JSON.stringify({ sweptDrafts: n })]);
  }
  return n;
}

/** Entwurf an die offene Anfrage binden, die per Code bestätigt wird. */
export async function bindeEntwurfAnAnfrage(id: string, requestId: string | null): Promise<void> {
  await query("UPDATE pers_drafts SET request_id = $2 WHERE id = $1", [id, requestId]);
}
