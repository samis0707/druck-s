# Tasks

## 1. Engine
- [x] 1.1 Pakete vendoren, Alias, `kalpri-sync.mjs`, `HERKUNFT.json`, zod; Engine-Tests grün
## 2. Persistenz
- [x] 2.1 Migration `010_kalkulation.sql` inkl. DOWN, Drizzle-Schema
- [x] 2.2 Store mit Sperre, Verlauf, Import/Export, Dateien
- [x] 2.3 `request_quotes` und Snapshot-Funktionen
## 3. Schnittstellen
- [x] 3.1 Mitarbeiter-Routen, Maschinen-Routen mit Schlüssel, öffentlicher Richtpreis
- [x] 3.2 OpenAPI, Audit-Aktionen, Env mit Defaults
## 4. Preisschicht
- [x] 4.1 `richtpreis.ts`, Einstellungen, Unit-Tests
## 5. Oberfläche
- [x] 5.1 Rechner, Preis-Einstellungen, Stammdaten (Import mit Vorschau)
- [x] 5.2 Werkbank eingebettet (Patch, Build, Auslieferung)
- [x] 5.3 Richtpreis in der Anfrageansicht, Navigation, `data-tour`-Anker
## 6. Betrieb
- [x] 6.1 Skripte: Import, Schlüssel, Beispieldaten
- [x] 6.2 Tests (Auth, Sperre, Limit, Validierung, OpenAPI)
- [ ] 6.3 Hilfe/Schulung (lib/hilfe) ergänzen
- [ ] 6.4 Anbindung `/anfrage` und Website an den Richtpreis
- [ ] 6.5 Referenzfälle gegen Pagina
