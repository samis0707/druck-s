# Tasks

## 1. App
- [x] 1.1 `CLAMAV_MODE` (`resolveClamavMode`, Standard daemon) in `lib/config.ts`
- [x] 1.2 `securityVerdict`/`pendingSecurity`: batch → PENDING ohne clamd; `security.scan` in beiden Modi
- [x] 1.3 UI: „Virenprüfung läuft“ (Badges Staff/Kunde, Befundzeile), Rollup ignoriert PENDING
- [x] 1.4 Audit-Aktionen `malware_detected`, `malware_scan_unavailable`

## 2. Job und Image
- [x] 2.1 `scripts/scan-pending.mjs` (Sperre, Auswahl, freshclam gedrosselt, ein clamscan, Zähler, Audit)
- [x] 2.2 `Dockerfile.scan`, `scripts/scan-entrypoint.sh`, `deploy/freshclam-batch.conf`; Compose-Profil `batch`
- [x] 2.3 Migration `008_scan_pending.sql` (Teilindex) inkl. DOWN, Drizzle-Schema; up/down/up verifiziert

## 3. Doku
- [x] 3.1 `app/docs/virenscan.md`, README-Link, `.env.example`

## 4. Verifikation
- [x] 4.1 Unit-Tests `lib/analyze/scan-batch.test.ts` (Parser, Auswahl, Statuswechsel mit gemockter DB/S3, App-Seite batch)
- [x] 4.2 Image lokal gebaut, EICAR + saubere PDF + fehlendes Objekt gegen lokales Postgres/S3: INFECTED + Audit, CLEAN, PENDING → UNAVAILABLE
- [x] 4.3 lint, tsc, vitest (Unit), build

## 5. Betrieb
- [ ] 5.1 Railway: Cron-Service `virenscan` anlegen (docs/virenscan.md), ersten Lauf prüfen
- [ ] 5.2 Railway: Migration 008, dann `CLAMAV_MODE=batch` im App-Service, clamd-Service entfernen
