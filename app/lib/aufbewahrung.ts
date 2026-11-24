/**
 * Aufbewahrungsfristen (Datenschutz): Anonymisierung im audit_log und Löschung der Druckdaten einer
 * Personalisierungs-Anfrage (Datentabelle/PDF) nach Versand oder Rückzug. Wird vom Hintergrund-Takt in
 * instrumentation.ts aufgerufen (laufeSweeps), mehrere Instanzen sind unkritisch (idempotent).
 */
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { appendAudit } from "./auditLog";
import { config } from "./config";
import { query } from "./db";
import { sweepExpiredDrafts } from "./intake";
import { bucketName, getStorage } from "./storage";

const STAPEL = 5000;
/** Nachweis verbindlicher Freigaben (Datenschutzerklärung Abschnitt 2/3): bleibt mit IP bestehen, bis die Anfrage selbst gelöscht wird. */
const NICHT_ANONYMISIEREN = ["approved"];

/**
 * IP-Adresse, User-Agent und E-Mail-Adresse (detail.email) in Audit-Einträgen nach `tage` Tagen entfernen.
 * Die Einträge selbst (Aktion, Zeit, Anfrage) bleiben; Freigaben ("approved") als Nachweis ausgenommen. Die Mengenbegrenzungen zählen nur die letzte Stunde
 * und sind davon nicht betroffen. tage <= 0: nichts tun. Rückgabe: Anzahl anonymisierter Zeilen.
 */
export async function anonymisiereAudit(tage = config.audit.anonymizeAfterDays): Promise<number> {
  if (!(tage > 0)) return 0;
  let gesamt = 0;
  for (;;) {
    const r = await query(
      `UPDATE audit_log SET ip = NULL, user_agent = NULL, detail = detail - 'email'
        WHERE id IN (
          SELECT id FROM audit_log
           WHERE created_at < now() - make_interval(days => $1::int)
             AND action <> ALL($2::text[])
             AND (ip IS NOT NULL OR user_agent IS NOT NULL OR detail ? 'email')
           LIMIT ${STAPEL})`,
      [Math.ceil(tage), NICHT_ANONYMISIEREN],
    );
    const n = r.rowCount ?? 0;
    gesamt += n;
    if (n < STAPEL) break;
  }
  if (gesamt > 0) await appendAudit({ action: "audit_anonymized", detail: { zeilen: gesamt, nachTagen: tage } });
  return gesamt;
}

async function loescheDateien(art: "data" | "pdf", tage: number): Promise<number> {
  if (!(tage > 0)) return 0;
  const spalte = art === "data" ? "data_file_id" : "pdf_file_id";
  const r = await query<{ id: string; key: string }>(
    `SELECT f.id, f.storage_key AS key
       FROM pers_request_outputs o
       JOIN request_files f ON f.id = o.${spalte}
       JOIN requests q ON q.id = o.request_id
      WHERE q.status IN ('SHIPPED', 'WITHDRAWN')
        AND (SELECT max(e.created_at) FROM request_events e WHERE e.request_id = q.id AND e.event IN ('shipped', 'withdrawn'))
              < now() - make_interval(days => $1::int)`,
    [Math.ceil(tage)],
  );
  let n = 0;
  for (const f of r.rows) {
    try {
      await getStorage().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: f.key }));
    } catch {
      // Objekt schon weg: Zeile wird trotzdem entfernt.
    }
    // pers_request_outputs.*_file_id steht auf ON DELETE SET NULL, die Anfrage selbst bleibt.
    await query("DELETE FROM request_files WHERE id = $1", [f.id]);
    n += 1;
  }
  return n;
}

/**
 * Datentabelle (XLSX mit Personendaten) und Druck-PDF von Personalisierungs-Anfragen löschen, wenn die
 * Anfrage seit der eingestellten Zahl Tage versendet (SHIPPED) oder zurückgezogen (WITHDRAWN) ist.
 * Standard: AUS (PERS_DATA_RETENTION_DAYS / PERS_PDF_RETENTION_DAYS = 0), bis die Frist festgelegt ist.
 */
export async function sweepPersonalisierungAufbewahrung(
  opt: { dataTage?: number; pdfTage?: number } = {},
): Promise<{ tabellen: number; pdfs: number }> {
  const tabellen = await loescheDateien("data", opt.dataTage ?? config.personalisierung.dataRetentionDays);
  const pdfs = await loescheDateien("pdf", opt.pdfTage ?? config.personalisierung.pdfRetentionDays);
  if (tabellen + pdfs > 0) await appendAudit({ action: "pers_retention_swept", detail: { tabellen, pdfs } });
  return { tabellen, pdfs };
}

/** Ein Durchgang aller Aufräumarbeiten; Fehler werden einzeln geloggt und stoppen die anderen nicht. */
export async function laufeSweeps(): Promise<void> {
  const schritte: Array<[string, () => Promise<unknown>]> = [
    // Abgebrochene Gast-Anfragen (DRAFT, inkl. Kontakt, Freitext, Dateien) und abgelaufene Personalisierungs-Entwürfe
    ["Entwürfe", sweepExpiredDrafts],
    ["Aufbewahrung Personalisierung", sweepPersonalisierungAufbewahrung],
    ["Audit-Anonymisierung", () => anonymisiereAudit()],
  ];
  for (const [name, fn] of schritte) {
    try {
      await fn();
    } catch (err) {
      console.error(`[sweep] ${name} fehlgeschlagen:`, err instanceof Error ? err.name : "Fehler");
    }
  }
}
