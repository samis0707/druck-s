# Tasks

## 0. Fundament
- [x] 0.1 `lib/company.ts` (Firmendaten), Migration 006 (Auftragsnummer, Tageszähler, `app_settings`), `lib/requestNumber.ts`, Vergabe beim Eingang
- [x] 0.2 `GET /api/requests/[id]` mit Nummer, Kunde, Bundles (Download-URLs), Shipment; Download-Routen für Bundle-Dateien und Rechnung; `?inline=1`

## 1. Parallel
- [x] 1.1 Upload-Fotoband (`app/upload/page.tsx`, CSS)
- [x] 1.2 Mails deutsch + HTML-Layout (`lib/mailTemplates.ts`, OTP-/Approval-Aufrufer, Tests)
- [x] 1.3 Rechtsseiten + Layout + Footer + Plausible
- [x] 1.4 Assistent deutsch + editierbarer Prompt (`lib/assistantNote.ts`, API, Staff-UI, Tests)

## 2. Auftragsansichten
- [x] 2.1 Vollbild-Vorschau (Quicklook/FilePreview)
- [x] 2.2 `StatusFolds` auf Kunden- und Staff-Seite, Kunde/E-Mail im Staff-Kopf, Auftragsnummer überall, Wording „Auftragsbestätigung", Dialog schließt

## 3. Verifikation
- [x] 3.1 tsc, eslint, vitest, Integrationstests; Flows im laufenden System prüfen
