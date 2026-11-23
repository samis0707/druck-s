# Tasks

## 1. Schema und Render-Engine
- [x] 1.1 `lib/personalisierung/schema.ts` (Vorlage, Variablen, Felder, Ausgabe, Farben, Schriften)
- [x] 1.2 Render: Text (Umbruch, Ausrichtung, Auto-Verkleinern, Leerzeilen), Codes als Vektor, vCard 3.0, Sonderfarben
- [x] 1.3 Ausgabe: Einzelseiten mit Trim-/BleedBox, ausgeschossen mit gespiegelten Rückseiten, Überlagerung, Auflage, Nutzenberechnung
- [x] 1.4 Prüfung mit deutschen Meldungen, Vorschau, konfigurierbare Grenzen; Messung 1000 Datensätze

## 2. Tabellen
- [x] 2.1 CSV (Trennzeichen, BOM, Windows-1252) und XLSX lesen, alles als Text
- [x] 2.2 Spaltenzuordnung, Beispiel-XLSX/CSV, Formel-Injection

## 3. Datenbank und Server
- [x] 3.1 Migration 011 mit DOWN, Drizzle-Schema, Audit-Aktionen, Config, `.env.example`
- [x] 3.2 Repository (Versionen, Schriften, Farben, Links, Entwürfe, Sweep), Dienstschicht, `erzeugeDruckdatenFuerAnfrage`
- [x] 3.3 Routen `/api/personalisierung/staff/*` und `/api/personalisierung/z/[ref]/*`
- [x] 3.4 Retorix-Importer mit Mapping-Tests

## 4. Oberfläche
- [x] 4.1 Staff-Bereich `/staff/personalisierung`: Übersicht (Karten, Suche, Duplizieren, Link kopieren, Archivieren), Assistent in vier Schritten (Design, visueller Feld-Editor mit Einrasten/Undo/Beispielvorschau aus der Engine im Browser, Druckbogen mit Skizze, Freigabe), Autospeichern in die Arbeitskopie, Veröffentlichen als neue Version, Schriften & Farben
- [x] 4.2 Kundenablauf `/personalisieren/[ref]` (Einzeln/Tabelle, Prüfen, Absenden mit E-Mail-Code, Direktweg für Kunden und Mitarbeiter), „Für Kunden ausfüllen“, „Meine Vorlagen“ im Konto, Kennzeichen am Auftrag
- [ ] 4.3 Hilfe-Lektionen und Tour (lib/hilfe; Anker `data-tour="pers-…"` sind gesetzt), Datenschutzerklärung (Aufbewahrung der Entwürfe: 24 Stunden nach der letzten Änderung)
- [x] 4.4 Virenscan für `pers_files`/`pers_fonts` im Batch-Modus (Migration 013, `scripts/scan-pending.mjs`, Sperre beim Veröffentlichen, docs/virenscan.md), OpenAPI-Eintrag der öffentlichen Routen
- [ ] 4.5 Offen: Löschfrist für Anfragedateien (Datentabelle mit Personendaten), Beispielvorschau für lange Texte („Langtext-Datensatz“), Test mit echten Kundendateien
