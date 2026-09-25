# Proposal

## Why

Feedback 13: Der Upload wirkt statisch, Auftragsnummern (Kurz-UUID) sind unlesbar, der automatische Hinweis kommt teils englisch, der Assistenten-Prompt ist nicht pflegbar, Kunden sehen Auftragsbestätigung und Druckdateien nur per Mail, Staff sieht den Kunden nicht, Vorschau ist zu klein, Mails sind unformatiert und englisch, und Rechtstexte (B2B) fehlen.

## What Changes

- Upload als „Fotoband": vier Panels (Dateien, Anfrage, Produkt, Referenz) klappen nacheinander langsam auf.
- Auftragsnummer `DDMMJJ-NNN` (Europe/Berlin, je Tag fortlaufend), vergeben beim Eingang; überall statt Kurz-UUID.
- Automatischer Hinweis auf Deutsch; Prompt-Anweisungen über die Staff-Seite pflegbar (alle Staff, mit Verlauf); Ausgabevertrag und Preis-Blocklist bleiben im Code.
- Auftragsansichten (Kunde + Staff) mit aufklappbaren Status-Karten; Auftragsbestätigung, Druckdateien und Rechnung dort abrufbar; Staff-Kopf zeigt Kunde und E-Mail.
- Vorschau als Vollbild-Pop-up.
- „Bestätigungs-PDF" → „Auftragsbestätigung"; Freigabe-Dialog schließt nach „Senden".
- Alle Mails deutsch mit sauberem HTML-Design im Look der Website und Firmen-Footer.
- Rechtstexte für B2B: AGB, Widerruf, Datenschutz (Mistral AI, Plausible), Impressum, Kontakt; Firmendaten zentral in `lib/company.ts`.
- Plausible Analytics (Cloud, cookielos), env-gesteuert.

## Capabilities

### New Capabilities
- `upload-fotoband`, `request-number`, `assistant-prompt-settings`, `status-folds`, `customer-file-access`, `fullscreen-preview`, `mail-design`, `legal-pages`, `plausible-analytics`
