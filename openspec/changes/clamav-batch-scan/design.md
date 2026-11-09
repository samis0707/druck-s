# Design

## Context

Bisher: `analyzeFile` → `securityVerdict` → `scanBuffer` (clamd INSTREAM, synchron). Fail-open: clamd nicht erreichbar → SUSPICIOUS mit Grund, nichts blockiert. INFECTED: `assertServable` verweigert Download/Vorschau, UI „Zurückgehalten“. Es gibt keinen Job-Mechanismus außer dem Webhook-Worker im App-Prozess.

## Decisions

### 1. Zustand im Bericht statt neuer Spalten
`analysis_reports.security` ist schon die eine gespeicherte Wahrheit (design §4 von `print-request-intake`). Der Scan-Zustand kommt als `security.scan` dazu, inkl. Fehlversuch-Zähler. Vorteil: keine Doppelwahrheit zwischen Spalte und JSON, UI und API brauchen keine neuen Felder, ältere Berichte (ohne `scan`) bleiben gültig. Migration 008 legt nur einen Teilindex `WHERE security->'scan'->>'status' = 'PENDING'` an; ohne ihn läuft alles weiter.
Alternative: Spalten `scan_status`/`scan_attempts` mit CHECK — verworfen (zweite Wahrheit, Pflicht-Migration vor dem Deploy).

### 2. Urteil während PENDING
Ohne strukturelle Gründe `verdict = PENDING` („Virenprüfung läuft“), mit Gründen bleibt `SUSPICIOUS` („Manuell prüfen“, manuelle Prüfung ist ohnehin nötig) und „Virenprüfung läuft“ steht zusätzlich da. Der Job rechnet nach den Regeln des Daemon-Pfads nach: INFECTED + `malware signature: …`, sonst SUSPICIOUS bei Gründen, sonst CLEAN. Ein Unit-Test prüft Gleichheit beider Pfade für dieselben Dateien.

### 3. PENDING blockiert nichts, INFECTED ab Befund
Wie UNAVAILABLE heute (fail-open): Download, Vorschau (inkl. RECEIVED → IN_REVIEW), Auftragsbestätigung, Freigabe, Versand laufen. Bundles sind Staff-Uploads und hängen nicht am Scan. Findet der Job eine Signatur, greift `assertServable` sofort; Audit `malware_detected` macht nachvollziehbar, falls die Datei vorher angesehen wurde. Im Finder-Rollup zählt PENDING nicht (Druckbarkeit entscheidet), damit „Bitte prüfen“ nicht für jeden frischen Auftrag erscheint.

### 4. Ein clamscan je Lauf
Signaturen laden kostet Sekunden und ~1 GB RAM; deshalb ein Aufruf über ein Temp-Verzeichnis (Dateiname = Datei-ID, nie der Kundendateiname), Ausgabe ohne `--infected` parsen, damit jede Datei ein explizites OK/FOUND/ERROR hat. Fehlt eine Datei in der Ausgabe, gilt sie als nicht geprüft (Versuch + 1). Grenzen: `--max-filesize` = Upload-Limit + 1 MB, `--max-scansize` = 4 ×; größere Dateien werden gar nicht erst geladen (UNAVAILABLE statt still „OK“).

### 5. freshclam gedrosselt, Volume, Seed
Zeitstempel-Datei auf dem Volume, Standard alle 4 h, auch bei leeren Läufen (sonst wäre der erste Lauf nach einer ruhigen Phase alt), aber leere Läufe ohne fälliges Update enden in < 1 s. Ein leeres Railway-Volume wird aus den Signaturen im Image gefüllt (kein Voll-Download, kein Abbruch, falls der Mirror drosselt). Ohne jede Signatur: Exit 1, alles bleibt PENDING.

### 6. Nebenläufigkeit und Rechte
`pg_try_advisory_lock` je Lauf; Schreiben nur `WHERE … status = 'PENDING'` (eine Neuanalyse wird nicht überschrieben). Der Container startet als root nur für `chown` des Volumes (Railway mountet root-eigen) und wechselt per `setpriv` auf `clamav`.

### 7. Abhängigkeiten im Image
`npm ci --omit=dev` nach Lockfile, dann `package.json` auf `pg` + `@aws-sdk/client-s3` reduzieren und `npm prune` → exakt die gelockten Versionen, ~23 MB `node_modules`, kein Next-Build. Node-Binary aus `node:24-bookworm-slim`.

## Risks / Trade-offs

- [Bis zu ~10 min ungeprüfte Dateien sichtbar] → wie bei clamd-Ausfall heute; Audit bei späterem Befund; Kunde/Staff sehen „Virenprüfung läuft“.
- [Batch-Lauf mit vielen großen Dateien] → `SCAN_BATCH_MAX_MB`, Rest im nächsten Lauf; Railway überspringt Termine, solange ein Lauf noch läuft.
- [Signaturen veralten, wenn freshclam dauerhaft scheitert] → Log je Lauf; Scan läuft mit den vorhandenen weiter.
