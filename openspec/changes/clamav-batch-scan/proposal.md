# Proposal

## Why

clamd belegt dauerhaft ca. 1,2 GB RAM, auch wenn stundenlang keine Datei eingeht. Auf Railway wird nach Verbrauch abgerechnet; der Scanner ist dort der teuerste Dienst. Uploads kommen in kleinen Mengen, eine Signaturprüfung mit einigen Minuten Verzögerung reicht, solange INFECTED-Dateien danach sicher zurückgehalten werden.

## What Changes

- Neuer Modus `CLAMAV_MODE=batch` in der App (Standard bleibt `daemon`, lokal/Coolify/Tests unverändert): beim Intake (Door A, Door B, Partner) kein clamd-Aufruf; der Bericht bekommt `security.scan.status = PENDING`, Anzeige „Virenprüfung läuft“. Strukturprüfung, Preflight und KI-Notiz laufen wie bisher.
- Bericht speichert den Scan-Zustand in beiden Modi unter `security.scan` (`status`, `mode`, `signature`, `attempts`, `error`, `scannedAt`).
- Neuer Cron-Job `scripts/scan-pending.mjs` mit eigenem Image `Dockerfile.scan` (clamav-debian + Node 24, nur `pg` und `@aws-sdk/client-s3`): freshclam (gedrosselt), ein `clamscan` über alle offenen Dateien, Ergebnis wie beim Daemon-Scan, Audit `malware_detected` / `malware_scan_unavailable`, danach Ende.
- Migration `008_scan_pending.sql`: Teilindex für die Warteschlange.
- UI: Urteil PENDING → „Virenprüfung läuft“ (Staff und Kunde), Befundzeile ebenso.

## Capabilities

### Modified Capabilities
- `print-analysis`: Signaturprüfung darf nachgelagert erfolgen; PENDING blockiert nichts, INFECTED wirkt ab Befund wie bisher.

## Impact

- DB: Migration 008 (nur Index, kein Datenumbau).
- Neuer Railway-Service (Cron `*/10 * * * *`, Volume `/var/lib/clamav`); App-Variable `CLAMAV_MODE`.
- Audit-Aktionen `malware_detected`, `malware_scan_unavailable`.
- Doku `app/docs/virenscan.md`, README, `.env.example`, Compose-Profil `batch`.
