# Spec Delta

## Purpose

Variable Daten in Druck-PDFs (Visitenkarten, Etiketten): Mitarbeiter bauen Vorlagen, Kunden und Gäste füllen sie mit Daten, prüfen eine Vorschau und reichen die Druckdaten als Anfrage ein.

## ADDED Requirements

### Requirement: Vorlagen-Schema

The system SHALL describe a template with one validated schema: end format and bleed in mm, a design PDF with front and optional back page, an explicit list of variables, fields with rectangles (x, y, width, height in mm, origin top left of the end format) and output settings. Field texts SHALL reference only declared variables.

#### Scenario: Unbekannte Variable

- **WHEN** a text field uses `{{telefon}}` and no variable `telefon` is declared
- **THEN** saving the template is rejected with a message naming the field and the variable.

### Requirement: Textsatz

The system SHALL wrap text at the field width, support left, centered, right and justified alignment and top, middle, bottom vertical alignment, and optionally shrink the font down to a minimum size until the text fits. A template line whose variables are all empty SHALL be omitted.

#### Scenario: Leere Zeile entfällt

- **WHEN** the template line `Tel. {{telefon}}` is rendered with an empty phone number
- **THEN** the line is not drawn and the following lines move up.

### Requirement: Codes als Vektor

The system SHALL draw barcodes, QR codes and vCard QR codes (vCard 3.0) as vector shapes in the PDF and SHALL NOT embed bitmaps for them. Spot colors SHALL be written as Separation color spaces with a CMYK alternate.

#### Scenario: EAN mit falscher Prüfziffer

- **WHEN** an EAN-13 value has a wrong check digit
- **THEN** the check reports an error for that record and field and no print PDF is produced.

### Requirement: Ausgabe

The system SHALL produce either single pages (end format plus bleed, TrimBox and BleedBox set) or imposed sheets: the number of copies per sheet SHALL be computed exactly from sheet size, margins and gaps, the layout centered, backs placed mirrored on their own sheet, an optional overlay PDF drawn on each sheet, and each record repeated by its run size. Generation SHALL be refused beyond `PERS_MAX_RECORDS` records or `PERS_MAX_NUTZEN` copies.

#### Scenario: Rückseiten

- **WHEN** a template has a back page and 25 copies are placed 21 per sheet
- **THEN** the PDF has 4 pages: front, back, front, back, with the back columns mirrored.

### Requirement: Prüfung

The system SHALL check each record and return structured German messages (severity, code, record number, field, variable, text) for missing required values, values over the maximum length, text that does not fit even after shrinking, characters missing from the font, and invalid barcode content.

#### Scenario: Pflichtfeld leer

- **WHEN** record 3 has no value for a required variable
- **THEN** the message reads „Datensatz 3: „Name“ ist ein Pflichtfeld und noch leer.“

### Requirement: Tabellen-Import

The system SHALL read CSV (delimiter `;` `,` tab or `|`, UTF-8 with or without BOM, Windows-1252) and XLSX files, treat every value as text, map columns to variables by key or label tolerant of case, umlauts and spaces, and return the mapping for confirmation. Exported tables SHALL neutralize formula injection. The system SHALL NOT use the `xlsx` npm package.

#### Scenario: Führende Nullen

- **WHEN** a postal code `01067` is read from CSV or XLSX
- **THEN** the record value is `01067`.

### Requirement: Versionierte Vorlagen

The system SHALL keep template content in immutable versions once a template is active: saving a change creates a new version, and drafts and generated outputs stay bound to the version they were made with.

#### Scenario: Änderung während ein Gast arbeitet

- **WHEN** staff saves a change to an active template while a guest draft exists
- **THEN** the draft keeps rendering with the old version.

### Requirement: Zugang ohne Konto

The system SHALL allow guests to use an active, public template through a random token link. Only the token hash SHALL be stored; revoked, expired, non-public, archived or unknown links SHALL answer 404. Logged-in customers SHALL see public templates and templates assigned to them; staff SHALL see all. Guests SHALL receive only customer-relevant data (name, format, variables, limits), never file references or palettes.

#### Scenario: Widerrufener Link

- **WHEN** a revoked link is opened
- **THEN** the answer is 404 with the same message as for an unknown link.

### Requirement: Sparsame Aufbewahrung

The system SHALL store guest record data only in drafts that expire `PERS_DRAFT_TTL_HOURS` after the last change and are deleted by the sweep. Table uploads, previews and checks SHALL NOT store data. Record values SHALL NOT be written to logs or the audit log.

#### Scenario: Entwurf läuft ab

- **WHEN** a draft is not changed for the retention period
- **THEN** it can no longer be read and the sweep deletes the row.

### Requirement: Missbrauchsgrenzen

The system SHALL limit previews, checks, table uploads and new drafts per IP address and hour (counted in `audit_log`), cap upload sizes, and verify uploads by type (PDF structure, image signature, font parse).

#### Scenario: Zu viele Vorschauen

- **WHEN** an address exceeds `PERS_PREVIEWS_PER_IP_PER_HOUR`
- **THEN** further previews answer 429 with `retry-after`.

### Requirement: Druckdaten an der Anfrage

The system SHALL provide `erzeugeDruckdatenFuerAnfrage`, which renders the print PDF and a data table (XLSX), stores both as `request_files` of the request and links them with the template version in `pers_request_outputs`. If checks report errors, nothing SHALL be stored.

#### Scenario: Fehlerhafte Daten

- **WHEN** a record has an error message
- **THEN** the function fails with code `pruefung` and the messages, and the request has no new files.
