# Virenscan (ClamAV): Daemon oder Batch

Jede hochgeladene Datei (Door A, Door B, Partner) wird auf Schadsoftware-Signaturen geprüft. Das Ergebnis
steht im Analysebericht (`analysis_reports.security`): `verdict` (CLEAN / SUSPICIOUS / INFECTED / PENDING),
`reasons` und `scan` (Status der Signaturprüfung). INFECTED-Dateien werden niemandem ausgeliefert
(`lib/files.ts`, Staff und Kunde sehen „Zurückgehalten“).

Der Modus wird in der **App** mit `CLAMAV_MODE` gewählt:

| Modus | Verhalten | Wofür |
|---|---|---|
| `daemon` (Standard, auch wenn leer) | Beim Intake synchron per clamd (`CLAMAV_HOST`/`CLAMAV_PORT`, INSTREAM). Scanner nicht erreichbar → SUSPICIOUS „malware scan unavailable — manual check“ (fail-open). | Lokal, Tests, Coolify, Scaleway (clamd läuft als Dienst, ca. 1,2–2 GB RAM dauerhaft) |
| `batch` | Kein clamd. Strukturprüfung (PDF-JavaScript, Makros, MIME) wie bisher, Signaturprüfung später: `scan.status = PENDING`, Anzeige „Virenprüfung läuft“. Ein Cron-Job prüft alle offenen Dateien und schreibt das Ergebnis zurück. | Railway (ClamAV nur alle 10 Minuten für wenige Sekunden) |

## Was PENDING im Ablauf bedeutet

- **Nichts wird blockiert** (wie bei „Scanner nicht erreichbar“): Staff kann Dateien ansehen und
  herunterladen, die erste Vorschau setzt den Auftrag auf „In Prüfung“, Auftragsbestätigung, Freigabe und
  Versand laufen normal. Bundles (Auftragsbestätigung, Druckdateien, Rechnung) lädt Staff selbst hoch, sie
  werden nicht gescannt und hängen nicht am Scan-Status.
- **INFECTED wirkt wie bisher**, sobald der Job die Signatur findet: Download/Vorschau für Staff und
  Kunde gesperrt, „Zurückgehalten“ im Finder und in der Auftragsansicht, Eintrag `malware_detected` im
  Audit-Log (mit Datei-ID und Signatur). Ob der Auftrag vorher schon angesehen wurde, zeigt das Audit-Log
  (`previewed`); Staff bittet den Kunden um einen frischen Export.
- **Anzeige**: Badge und Befundzeile „Virenprüfung läuft“ (Staff und Kunde), statt „Manuell prüfen“.
  Gibt es zusätzlich strukturelle Befunde (z. B. Makros), bleibt das Urteil „Manuell prüfen“ und
  „Virenprüfung läuft“ steht daneben. Im Finder-Rollup zählt PENDING nicht als Befund (die Druckbarkeit
  entscheidet).
- Der Job setzt danach dieselben Werte wie der Daemon-Scan: CLEAN bzw. SUSPICIOUS (bei Gründen) oder
  INFECTED mit `malware signature: …`. Scheitert eine Datei `SCAN_MAX_ATTEMPTS`-mal (Download, clamscan),
  wird sie UNAVAILABLE → SUSPICIOUS „malware scan unavailable (…) — manual check“, Audit
  `malware_scan_unavailable`.

## Der Scan-Job (`scripts/scan-pending.mjs`, Image `Dockerfile.scan`)

Ein Lauf:

1. Sperre (`pg_try_advisory_lock`) — ein paralleler Lauf beendet sich sofort.
2. Älteste PENDING-Berichte holen: höchstens `SCAN_BATCH_SIZE` Dateien und `SCAN_BATCH_MAX_MB` (Rest im
   nächsten Lauf). Teilindex `analysis_reports_scan_pending_idx` (Migration 008).
3. Nichts zu tun → sofort Ende (unter 1 s), außer `freshclam` ist fällig.
4. `freshclam` höchstens alle `FRESHCLAM_INTERVAL_HOURS` (Zeitstempel `.druck-s-freshclam-stamp` auf dem
   Volume; nur inkrementelle Updates). Ein leeres Volume wird beim ersten Lauf aus den Signaturen im Image
   gefüllt. Scheitert freshclam, geht es mit den vorhandenen Signaturen weiter; gibt es gar keine:
   Abbruch mit Exit 1, alles bleibt PENDING.
5. Dateien aus S3 in ein Temp-Verzeichnis laden (Dateiname = Datei-ID; Größe und SHA-256 werden geprüft),
   **ein** `clamscan`-Aufruf über alle Dateien (Signaturen werden einmal geladen,
   `--max-filesize` = Upload-Limit + 1 MB, `--max-scansize` = 4 × so viel).
6. Ergebnis je Datei schreiben (nur wenn der Bericht noch PENDING ist), Temp löschen, Exit 0 — auch
   wenn einzelne Dateien gescheitert sind (sie bleiben PENDING, `scan.attempts` + 1).

Logs enthalten nur IDs, Signaturnamen und Zähler, keine Dateinamen, Storage-Keys oder Inhalte.
Spitzenbedarf während `clamscan`: ca. 1,2–1,5 GB RAM für wenige Sekunden bis Minuten.

Das Image startet als root, übergibt nur das Volume `/var/lib/clamav` an den Nutzer `clamav`
(Railway hängt Volumes root-eigen ein) und führt dann freshclam, Node und clamscan als `clamav` aus
(`scripts/scan-entrypoint.sh`). `RAILWAY_RUN_UID` ist deshalb nicht nötig.

### Variablen des Scan-Jobs

| Variable | Pflicht | Standard | Bedeutung |
|---|---|---|---|
| `DATABASE_URL` | ja | – | Dieselbe Datenbank wie die App |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | ja | Bucket `dam` | Derselbe Speicher wie die App (nur Lesen nötig) |
| `S3_REGION`, `S3_FORCE_PATH_STYLE` | nein | `us-east-1`, `true` | wie in der App |
| `SCAN_BATCH_SIZE` | nein | 200 | Dateien je Lauf |
| `SCAN_BATCH_MAX_MB` | nein | 2048 | Höchstens so viele MB je Lauf in Temp |
| `SCAN_MAX_ATTEMPTS` | nein | 5 | Fehlversuche bis UNAVAILABLE |
| `SCAN_MAX_FILE_MB` | nein | 100 | Upload-Limit; größere Dateien werden nicht geladen (UNAVAILABLE) |
| `SCAN_TIMEOUT_MINUTES` | nein | 30 | clamscan wird danach abgebrochen (Dateien bleiben PENDING) |
| `FRESHCLAM_INTERVAL_HOURS` | nein | 4 | Mindestabstand der Signatur-Updates |

Fest im Image: `CLAMAV_DB_DIR=/var/lib/clamav`, `CLAMAV_SEED_DIR=/opt/clamav-seed`,
`FRESHCLAM_CONFIG=/etc/clamav/freshclam-batch.conf` (`deploy/freshclam-batch.conf`).

## Railway einrichten

1. **App-Service** (bestehend): Variable `CLAMAV_MODE=batch` setzen (Variablen `CLAMAV_HOST`/`CLAMAV_PORT`
   werden dann nicht mehr gebraucht). Erst setzen, wenn der Cron-Service unten läuft — sonst bleiben
   Dateien bis dahin auf „Virenprüfung läuft“ (blockiert aber nichts). Ein vorhandener clamd-Service
   kann danach gelöscht werden.
2. **Migration 008** einspielen wie die übrigen (`node db/migrate.js` gegen die Railway-Datenbank). Nur ein
   Index; ohne ihn läuft der Job ebenfalls.
3. **Neuer Service** „virenscan“: *New → GitHub Repo* `samis0707/druck-s`, Branch `railway`.
   - *Settings → Source → Root Directory*: `/app`
   - *Variables*: `RAILWAY_DOCKERFILE_PATH=Dockerfile.scan` (Builder: Dockerfile)
   - *Settings → Deploy → Cron Schedule*: `*/10 * * * *` (UTC; Restart Policy „Never“)
   - Keine Start Command, keine Domain, kein Healthcheck (der Container beendet sich selbst; läuft ein
     Lauf noch, überspringt Railway den nächsten Termin).
   - *Volume* anlegen und an `/var/lib/clamav` hängen (ca. 1 GB reicht; Signaturen ca. 250 MB).
   - *Variables*: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (bzw. wie beim App-Service), `S3_ENDPOINT`,
     `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` mit denselben Werten
     wie im App-Service (am einfachsten als Referenz `${{app.S3_ENDPOINT}}` usw.).
   - Optional *Watch Paths*, damit nicht jeder App-Push das Scan-Image neu baut:
     `/app/Dockerfile.scan`, `/app/scripts/scan-pending.mjs`, `/app/scripts/scan-entrypoint.sh`,
     `/app/deploy/freshclam-batch.conf`, `/app/package-lock.json`.
4. Prüfen: *Deployments → Run now* (oder `railway cron run`). Erwartete Logzeilen:
   `[scan] Signaturen aus dem Image übernommen …` (erster Lauf), `[scan] freshclam: Signaturen aktuell`,
   `[scan] nichts zu prüfen (… ms)` bzw. `[scan] fertig in … s: n sauber, …`.

Zurück zum Daemon: `CLAMAV_MODE` im App-Service entfernen und clamd wieder bereitstellen; noch offene
PENDING-Berichte prüft der Cron-Service weiterhin, solange er läuft.

## Lokal ausprobieren

```bash
docker compose up -d postgres minio minio-init mailpit
CLAMAV_MODE=batch npm run dev                     # Upload → „Virenprüfung läuft“
docker compose --profile batch run --rm scan      # prüft offene Dateien und beendet sich
```

EICAR-Testdatei (`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`) hochladen:
nach dem Lauf steht sie auf „Zurückgehalten“ und im Audit-Log `malware_detected`.
