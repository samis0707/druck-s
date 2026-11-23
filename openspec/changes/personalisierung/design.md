# Design

## Ausgangslage

retorix (`/home/user/retorix`, Django) liefert den Funktionsumfang: Produkt mit Design-PDF, Felder mit Koordinaten, Excel-Upload, ausgeschossenes PDF. Schwächen: Eingabe blind in mm (Ursprung unten links), implizite Variablen, Barcodes als Bitmap (Ghostscript), Spaltenfehler beim Ausschießen, Rendering synchron im Request, Endkundendaten ohne Löschfrist. druck-s hat Next.js 16, Postgres mit rohem SQL, S3-Speicher, Rollen `staff`/`customer`, die offene Anfrage (`/api/v1/inquiries`) mit E-Mail-Code.

## Entscheidungen

- **Eine Quelle:** `lib/personalisierung/schema.ts` (zod). Editor, Vorschau, Server und Importer nutzen dieselben Typen. Koordinaten in mm, Ursprung oben links; Feld = Rechteck.
- **Variablen explizit:** Liste mit Schlüssel, Bezeichnung (Spaltenkopf/Formular), Pflicht, Beispiel, Maximallänge, Hilfetext. Felder verweisen mit `{{schluessel}}`. Zeilen mit nur leeren Variablen entfallen (retorix-Verhalten). Pflicht, Beispiel und Länge hängen an der Variable, nicht am Feld, weil eine Variable in mehreren Feldern vorkommen kann.
- **Isomorphe Engine:** pdf-lib + `@pdf-lib/fontkit` + `bwip-js/generic` (`raw`: Strich-/Modulmuster, keine Bitmaps) + `qrcode` (Matrix). Der Aufrufer liefert die Bytes (`Ressourcen`), die Engine macht keinen I/O. Gleicher Code im Browser (Live-Vorschau) und im Server (final).
- **Leistung:** Inhalt je Datensatz und Seite wird einmal als Content-String relativ zur Nutzen-Ecke erzeugt und je Nutzen mit `cm` verschoben (Auflage kostet fast nichts); Zeichenbreiten werden gecacht; Design-Seite einmal eingebettet.
- **Sonderfarben:** Separation-Farbraum mit Tint-Funktion (CMYK-Alternate) über pdf-lib-Low-Level-Objekte; Aufwand gering, daher umgesetzt. Vorschau-Renderer (pdf.js) zeigen die CMYK-Alternate.
- **Ausschießen:** Nutzen = Endformat + Beschnitt; `floor((nutzbar + abstand) / (nutzen + abstand))` (korrigiert den retorix-Fehler). Zentriert; Rückseiten auf eigenem Bogen mit gespiegelten Spalten (Schön- und Widerdruck über die lange Kante); Überlagerung (Stanzkontur) auf jedem Bogen oder nur Vorderseiten.
- **Tabellen ohne `xlsx`:** das npm-Paket `xlsx` 0.18.x hat bekannte CVEs (Prototype Pollution, ReDoS) und wird dort nicht mehr gepflegt; `exceljs` bringt einen großen Abhängigkeitsbaum. Lesen/Schreiben des kleinen Formats übernehmen `fflate` und `fast-xml-parser` (schon Abhängigkeiten): volle Kontrolle über Größen (Zip-Bomben), alle Werte als Text, nie Formeln auswerten.
- **Versionen:** Entwurf-Vorlagen werden an Ort geändert (außer es hängen Entwürfe an der Version); aktive Vorlagen bekommen bei jeder Änderung eine neue Version. Entwürfe und Druckdaten merken sich die Version; die Farben sind je Version eingefroren (Schnappschuss). Schriften sind Dateien in der Bibliothek (Familie + Schnitt); sie lassen sich nicht löschen, solange eine Vorlage sie nutzt.
- **Zugang:** `ref` ist ein Token (Gast, öffentlicher Link) oder die Vorlagen-ID (Kunde mit Konto/Zuordnung, Mitarbeiter). Alles Ungültige antwortet gleich mit 404. Token nur als SHA-256-Hash (wie `upload_links`), Link wiederverwendbar, optional mit Ablauf, widerrufbar.
- **Datensparsamkeit:** Gast-Datensätze nur in `pers_drafts.records`, Ablauf 24 h nach der letzten Änderung (konfigurierbar), Sweep im Takt von `instrumentation.ts` und in `sweepExpiredDrafts`. Tabellen-Upload, Prüfung und Vorschau speichern nichts. Audit-Einträge enthalten nur Zähler und Kennungen, Fehler werden ohne Werte geloggt. Die Datentabelle an der Anfrage ist ein `request_file` und folgt der Aufbewahrung der Anfrage (offen: Löschfrist für Anfragedateien).
- **Grenzen:** je Erzeugung 2000 Datensätze / 20000 Nutzen, Upload-Größen, je IP und Stunde für Vorschau, Prüfung, Tabelle und Entwurf (Zählung im `audit_log` wie bei `INQUIRY_*`).
- **Messung:** 1000 Datensätze (vCard-QR, QR, EAN, Text, Vorder-/Rückseite) in rund 4 s (Einzelseiten, 2000 Seiten) bzw. rund 4 s (ausgeschossen, 96 Seiten) auf dem Entwicklungs-Container. Für 2000 Datensätze im Request liegt das unter dem Railway-Timeout; bei Bedarf später als Job.
- **Offen:** CSRF für schreibende Staff-Routen verlässt sich auf SameSite-Cookies und `application/json`; Virenscan nur im Daemon-Modus synchron.

## Geplante Oberfläche (Vorgabe für den nächsten Schritt)

### Staff-Editor `/staff/personalisierung`
- Liste der Vorlagen (Status, Sichtbarkeit, Version), „Neu“, „Duplizieren“, „Archivieren“. Schritte als Leiste: Design → Variablen → Felder → Ausgabe → Freigabe.
- Design: PDF hochladen (`POST /staff/dateien`), Seitengrößen aus der Antwort, Vorschlag „mit Beschnitt“, Beschnitt/Endformat aus der Seitengröße.
- Variablen: Tabelle mit Schlüssel (automatisch aus der Bezeichnung), Bezeichnung, Pflicht, Beispiel, Maximallänge.
- Felder: PDF-Seite (pdf.js) als Arbeitsfläche in mm-Maßstab mit Lineal; Felder per Drag & Drop anlegen, verschieben und in der Größe ziehen (Griffe), Einrasten an Rand/Mitte/anderen Feldern, Pfeiltasten (1 mm, mit Umschalt 5 mm), Ebenenliste, Seitenwechsel Vorne/Hinten. Eigenschaften rechts je Feldtyp (Schrift, Größe, Farbe aus der Palette, Ausrichtung, „automatisch verkleinern“, Barcode-Typ, QR-Inhalt, vCard-Zuordnung). Variablen per Klick einfügen statt tippen.
- Live-Vorschau: dieselbe Engine im Browser (`erzeugeVorschau`) mit den Beispielwerten; Umschalter für Beispiel-/Langtext-Datensatz; Meldungen der Prüfung direkt am Feld.
- Ausgabe: Bogenformat (Liste `BOGENFORMATE`), Rand, Abstände, Überlagerung; Anzeige der Nutzenzahl (`berechneNutzen`) und des Rasters als Skizze.
- Freigabe: Status aktiv/Entwurf, Sichtbarkeit (nur Mitarbeiter / bestimmte Kunden / öffentlich per Link), Links erzeugen und widerrufen, Testlauf mit einem Link.
- Bibliotheken: Schriften (Upload, Familie/Schnitt) und Farbpalette (Name, CMYK, Sonderfarbe) als eigene Seiten.

### Kundenablauf `/personalisieren/[ref]` (ohne Konto per Link, mit Konto per ID)
1. Vorlage sehen (Name, Format, Beschreibung, Vorschau mit Beispielwerten).
2. **Einzeln eingeben** (Formular aus den Variablen, mit Bezeichnung, Hilfetext, Zeichenzähler, Live-Vorschau pro Eingabe) **oder Tabelle hochladen** (Beispieltabelle laden, CSV/XLSX hochladen, Spaltenzuordnung bestätigen).
3. Prüfen: Meldungen je Datensatz und Feld, Korrektur direkt in der Liste; Auflage je Datensatz.
4. Vorschau: Blättern durch die Datensätze (Vorder-/Rückseite), PDF.js.
5. Absenden: Kontaktdaten, Code per E-Mail wie bei der offenen Anfrage; dann Anfrage in druck-s mit `erzeugeDruckdatenFuerAnfrage`; Entwurf löschen.
- Zwischenstände im Entwurf (`/entwuerfe`), Hinweis „wird nach 24 Stunden ohne Änderung gelöscht“.
