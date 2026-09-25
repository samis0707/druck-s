# Tasks

## 1. Upload-Reihenfolge und Kategorie-Grundlage

- [x] 1.1 Upload-Blöcke in `app/app/upload/page.tsx` und `app/app/u/[token]/page.tsx` auf Dateien → Beschreibung → Produkt → Referenz (optional) umstellen und visuell plus per Tastatur prüfen
- [x] 1.2 Deutsch-Mapping für Produkt-Hints in `lib/ui-text.ts` ergänzen (Slug→Label, Fallback Rohwert) und alle Rohwert-Renderings (Kunden-Detail, Staff-Detail, Finder, Listen) ersetzen; Unit-Test für Mapping inklusive unbekanntem Wert
- [x] 1.3 Migration `suggested_category` (nullable TEXT) auf `assistant_notes` anlegen und `db/migrate.js`-Lauf verifizieren

## 2. Agent-Kategorie und Ergebnis-Dialog

- [x] 2.1 Prompt und Validierung in `lib/assistantNote.ts` um genau einen Allowlist-geprüften Kategorie-Vorschlag erweitern (Retry, danach null) und Stub-Tests für gültig/ungültig/Wiederholung grün bekommen
- [x] 2.2 Vorschlag beidseitig (Kunden-Detail, Staff-Detail, Finder-Inspektor) neben dem gewählten Hint rendern und identische Inhalte prüfen
- [x] 2.3 Ergebnis-Dialog auf `app/app/requests/[id]/page.tsx` mit sessionStorage-Einmal-Flag, Status/Hinweis/Befunden, 3-s-Polling bis vollständig oder 2-min-Timeout mit ladendem und ablaufendem Zustand; Einmal-Öffnung und Nachfüllen ohne Reload prüfen

## 3. Navigation, Login und Konto

- [x] 3.1 Staff-Link aus Header (Desktop + Sheet) entfernen und in den Footer aufnehmen; keine Staff-Einträge mehr per Grep finden und alle Footer-Links klickbar prüfen
- [x] 3.2 `/login`-Seite mit E-Mail+OTP über bestehende Login-API anlegen (eingeloggte → `/konto`) und eigenständigen Login ohne Upload prüfen
- [x] 3.3 `GET /api/account` (eigene Identität aus Session) plus `/konto`-Seite mit Infos und eigener Auftragsliste anlegen; anonyme Umleitung nach `/login` prüfen

## 4. Finder-Breite und Dateivorschau

- [x] 4.1 Finder-Grid nur bei Auswahl zweispaltig rendern (sonst volle Tabellenbreite) und beide Zustände auf Wide- und Mobile-Breite prüfen
- [x] 4.2 `FilePreview`-Komponente (Bild inline, PDF eingebettet, Fallback Icon+Meta, kein Element bei INFECTED) bauen und in Inspektor und Staff-Detail wiederverwenden; Vorschau- und Zurückhaltungs-Fall prüfen

## 5. Staff-Übersicht: Dump und Detail

- [x] 5.1 Identitäten-Liste um neueste Dump-Metadaten (Datum, Anzahl, ja/nein) erweitern und Markdown-Vorschau-Endpoint für Staff anlegen; Status- und Inhaltsansicht auf `/staff/customers` prüfen
- [x] 5.2 Staff-Detail um Vorschau, gruppierte Insights, Prozess-Timeline (aktuelle + verbleibende Stufen) und KI-Hinweis-Card ergänzen; alle vier Blöcke mit und ohne Daten prüfen

## 6. Verifikation

- [x] 6.1 Typecheck, Lint, Unit-/Boundary-Tests und Production-Build grün bekommen; Door-A-Upload bis Hinweis sowie Kunden-Login bis Konto manuell durchgehen
