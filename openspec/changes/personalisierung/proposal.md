# Proposal

## Why

Die Druckerei personalisiert Druckdaten (Visitenkarten mit Name, Telefon, QR-Code, Etiketten mit Barcode) bisher mit dem Django-Tool „retorix“. Dort legt ein Admin Produkte mit Design-PDF und Feldern blind in Millimetern an (Ursprung unten links, keine Vorschau, drei verschachtelte Admin-Seiten); Kunden brauchen ein Konto, laden eine Excel-Datei hoch und bekommen ein Druck-PDF mit Bitmap-Barcodes. retorix braucht Ghostscript und GDAL im Container und hat bekannte Fehler (falsche Spaltenzahl beim Ausschießen, Barcode als Bitmap, keine Prüfung der Daten, Bestellungen mit Endkundendaten ohne Löschfrist).

druck-s soll das ersetzen: für alle Mitarbeiter bedienbar, für Kunden ohne Konto nutzbar, mit Vorschau und Prüfung vor der Anfrage. Dieser Change liefert das **Fundament**; die Oberfläche (visueller Editor, Kundenablauf) folgt im nächsten Schritt.

## What Changes

- Neues Vorlagen-Schema (zod) als einzige Quelle für Editor, Vorschau, Erzeugung und Import: Endformat, Beschnitt, Design-PDF (Vorder-/Rückseite), explizite Variablen, Felder (Text, Barcode, QR, vCard-QR, Bild), Ausgabe-Einstellungen. Koordinaten in mm, Ursprung oben links.
- Isomorphe Render-Engine (pdf-lib, fontkit, bwip-js, qrcode): läuft im Browser (Live-Vorschau) und im Server. Codes als Vektor, Schriften als Subset, CMYK und Sonderfarben (Separation), Einzelseiten mit TrimBox/BleedBox oder ausgeschossene Bögen (gespiegelte Rückseiten, Überlagerung, Auflage), Nutzenberechnung, Prüffunktion mit deutschen Meldungen.
- Tabellen-Import (CSV mit Trennzeichen-/Kodierungserkennung, XLSX) ohne das unsichere `xlsx`-Paket, automatische Spaltenzuordnung, Beispieltabellen, Schutz vor Formel-Injection.
- Datenbank (Migration 011): versionierte Vorlagen, Schriften, Farben, Kundenzuordnung, Zugriffs-Links (nur Hash), Gast-Entwürfe mit Ablauf, Verknüpfung erzeugter Druckdaten mit Anfragen.
- Server-API unter `/api/personalisierung`: Staff-CRUD, Zugang per Token-Link oder Kundenkonto, Tabelle einlesen, prüfen, Vorschau, Entwürfe; Funktion `erzeugeDruckdatenFuerAnfrage`.
- Retorix-Importer `scripts/retorix-import.mjs` (Trockenlauf, idempotent, ohne Bestellungen und Endkundendaten).

## Capabilities

### New Capabilities
- `personalisierung`: Vorlagen, Rendering, Tabellen, Zugang, Entwürfe, Anbindung an die Anfrage.

### Modified Capabilities
- `print-request`: Druck-PDF und Datentabelle können als `request_files` aus einer Vorlage entstehen.

## Impact

- DB: Migration `011_personalisierung.sql` (010 ist für ein paralleles Vorhaben reserviert; der Runner wendet fehlende Nummern in Reihenfolge an).
- Neue Abhängigkeiten (reines JS): `@pdf-lib/fontkit`, `bwip-js`, `qrcode`, `zod` (bisher nur transitiv). Kein Ghostscript, kein canvas, keine nativen Module; Railway/Railpack bleibt unverändert.
- Neue Env-Variablen `PERS_*` (Grenzen, Aufbewahrung der Entwürfe) in `config.ts` und `.env.example`.
- `sweepExpiredDrafts` und `instrumentation.ts` löschen abgelaufene Gast-Entwürfe.
