# Proposal

## Why

Die neue digitalemedien.de schickt alle Aufträge nach druck-s und hat kein eigenes Formular mehr. druck-s nimmt bisher aber nur freigeschaltete Kunden an: Wer neu ist, lädt Dateien hoch und wird beim E-Mail-Schritt abgewiesen. Für Interessenten gibt es nur den Einmal-Link, den die Druckerei von Hand erzeugt. Assistenten (ChatGPT, Claude, Le Chat, Vibe) können Druckdaten inzwischen passend anlegen, aber nichts einreichen: alle Routen hängen an Browser-Sitzung, Code oder Einmal-Link.

## What Changes

- Vierte Tür in dieselbe Pipeline: die offene Anfrage. Entwurf anlegen, Dateien anhängen (optional), Code an die Kontakt-Adresse, mit dem Code bestätigen. Erst die Bestätigung macht aus dem Entwurf einen Eingang (`inquiry_confirmed`, DRAFT → RECEIVED).
- Unbekannte Adresse: Auftrag mit `prospect_email`, `origin = 'inquiry'`, Behandlung wie VOUCHED; dazu ein Datensatz mit Status „prospect“, den die Druckerei unter „Kunden & Links“ freischaltet. Kein Portalzugang, keine Sitzung.
- Bekannte, freigeschaltete Adresse: Bindung an das Kundenkonto wie Door A (VERIFIED), ohne Sitzung.
- Öffentliche Schnittstelle `/api/v1` (Produkte, Anfrage in vier Schritten, Stand), beschrieben als OpenAPI 3.1 (`/api/v1/openapi.json`) mit Swagger-Oberfläche unter `/api/docs`. Die Partner-Schnittstelle ist dort mit beschrieben.
- Seiten `/anfrage` (Formular) und `/anfrage/[id]` (ansehen und bestätigen). `/upload` leitet unbekannte Adressen mit denselben Dateien dorthin weiter.
- Mails: Code mit Link zur Bestätigungsseite, Eingangsbestätigung an den Interessenten, Hinweis an `FIRM_INBOX`.
- Staff: Kennzeichen „Interessent“ in Liste und Detail.
- `llms.txt`, Hilfe und robots.txt beschreiben den Weg für Assistenten.

## Capabilities

### New Capabilities
- `open-inquiry`: Entwurf, Dateien, Bestätigungscode, Bindung (Kunde oder Interessent), Grenzen, Schnittstelle und Seiten.

### Modified Capabilities
- `print-request`: neues Event `inquiry_confirmed`, Herkunft `inquiry`.
- `customer-access`: Interessenten-Datensätze können durch eine bestätigte Anfrage entstehen; Zugang gibt weiterhin nur die Freischaltung.

## Impact

- DB: Migration `009_open_inquiry.sql` (Spalte `requests.inquiry_contact`, Tabelle `inquiry_codes`, Herkunft `inquiry`, Index auf `audit_log`).
- Neue Abhängigkeit `swagger-ui-dist` (lokal ausgeliefert, `scripts/copy-static-assets.mjs`).
- Neue Env-Variablen `INQUIRY_*` (Grenzen, alle mit Standardwert).
