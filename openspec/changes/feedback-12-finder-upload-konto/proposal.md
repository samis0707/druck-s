# Proposal

## Why

Feedback 12 zeigt: Der Upload fragt in falscher Reihenfolge, Kunden landen nach dem Senden ohne Einordnung auf ihrem Auftrag, Kategorien sind teils englisch und ohne Agenten-Vorschlag, Staff steht prominent in der Navigation, Kunden können sich nicht ohne Upload anmelden und sehen ihre Daten nirgends, der Finder verschenkt Breite, Dateien haben keine Vorschau, History-Dumps sind unsichtbar und die Staff-Detailseite erklärt weder Prozessstand noch KI-Ergebnis.

## What Changes

- Upload-Formular (Door A und Door B): Reihenfolge Dateien → Beschreibung → Produkt; Referenzfeld als optional gekennzeichnet. Flow und Validierung unverändert.
- Kunden-Auftragsseite: Nach frischem Senden öffnet sich automatisch ein Ergebnis-Dialog (Status, Agenten-Hinweis, Befunde je Datei); wartet per Polling auf Analyse/Note mit „wird analysiert"-Zustand; nur einmalig nach Send, danach nie wieder.
- Agent schlägt genau eine Kategorie aus der bestehenden Produktliste vor (neues Note-Feld, validiert); Produkt/Kategorie wird überall deutsch angezeigt (Slug→Label-Mapping statt Rohwert).
- Header-Navigation ohne Staff (Upload, Aufträge, Konto); Staff-Login wandert in den Footer.
- Eigene Kunden-Loginseite (`/login`, E-Mail+OTP über bestehende API) plus Kontoseite (`/konto`: persönliche Infos via neuem `GET /api/account` plus eigene Aufträge).
- Finder: Volle Tabellenbreite solange nichts ausgewählt ist; Inspektor-Spalte erscheint erst bei Auswahl.
- Dateivorschau (Bild inline, PDF eingebettet) im Finder-Inspektor und auf der Staff-Detailseite; zurückgehaltene Dateien zeigen Gründe statt Vorschau.
- Staff-Kundenliste zeigt pro Kunde Dump-Status (vorhanden ja/nein, Datum, Auftragsanzahl) plus einsehbaren Dump-Inhalt (Markdown-Vorschau).
- Staff-Detailseite bekommt Vorschau, Insights (Befunde), Prozess-Timeline (aktuelle Stufe + verbleibende Schritte aus dem Event-Ledger) und das KI-Hinweis-Ergebnis (bisher nur per API vorhanden, nie gerendert).

## Capabilities

### New Capabilities
- `upload-order`: Datei-zuerst-Reihenfolge im Upload, Referenz optional.
- `request-result-dialog`: Ergebnis-Dialog nach Send mit Polling auf Analyse/Note.
- `agent-category`: Kategorie-Vorschlag des Agenten plus deutsche Kategorie-Anzeige überall.
- `public-nav`: Staff aus Header-Nav raus, in Footer rein.
- `customer-account`: Standalone-Login und Kontoseite mit persönlichen Infos.
- `finder-width`: volle Finder-Breite ohne Auswahl.
- `file-preview`: Dateivorschau in Inspektor und Staff-Detail.
- `dump-visibility`: Dump-Status und -Inhalt auf der Kundenliste.
- `staff-detail-overview`: Vorschau, Insights, Prozess-Timeline und KI-Hinweis auf der Staff-Detailseite.

### Modified Capabilities
- Keine (keine dauerhaften Specs betroffen; Lifecycle und Analyse-Verhalten unverändert).

## Impact

- Betroffener Code: `app/app/upload/page.tsx`, `app/app/u/[token]/page.tsx`, `app/app/requests/[id]/page.tsx`, `app/app/staff/**`, `app/components/layout/Header.tsx`, `app/components/layout/Footer.tsx`, `app/components/finder/*`, `lib/assistantNote.ts`, `lib/assistant.ts`, `lib/ui-text.ts`, neu: `app/app/login/page.tsx`, `app/app/konto/page.tsx`, `app/app/api/account/route.ts`, ggf. Staff-History-Endpoint.
- Neue DB-Migration: `suggested_category` auf `assistant_notes` (nullable).
- Keine Änderung an Lifecycle-Events, Preisen, Katalogen oder Zahlungsflüssen.
