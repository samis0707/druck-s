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

## 4. Nächster Schritt (UI, nicht Teil dieses Changes)
- [ ] 4.1 Staff-Editor (Seite `/staff/personalisierung`), siehe design.md
- [ ] 4.2 Kundenablauf (Seite `/personalisieren/[ref]`), Bestätigung per E-Mail-Code, Anfrage in druck-s
- [ ] 4.3 Hilfe-Lektionen und Tour (lib/hilfe), Datenschutzerklärung (Aufbewahrung der Entwürfe)
- [ ] 4.4 Virenscan für `pers_files` im Batch-Modus, OpenAPI-Eintrag der öffentlichen Routen
