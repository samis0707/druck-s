# Einführung Personalisierung und Kalkulation: Schulungsplan für Mitarbeitende

Ablauf einer Mitarbeiterschulung von **60 bis 90 Minuten**. Ziel: Danach kann **jede Mitarbeiterin und jeder Mitarbeiter** eine Vorlage anlegen, personalisierte Aufträge bearbeiten und einen Richtpreis ausrechnen. Bisher konnte das nur eine Person; das neue Werkzeug ist so gebaut, dass das nicht mehr nötig ist.

Alle Texte der Schulung stehen auch online unter `/hilfe/druckerei` (Lektionen, Quiz) und als PDF-Kurzanleitungen zum Ausdrucken (siehe unten). Die Touren in der App (`Tour starten`) begleiten die Übungen.

## Lernziele

Nach der Schulung können die Teilnehmenden …

1. erklären, was eine Vorlage ist (Design, Feld, Eingabe) und was „Entwurf“ und „Aktiv“ bedeuten,
2. eine neue Vorlage in vier Schritten anlegen: Design, Felder, Druckbogen, Freigabe,
3. einen Link an Kunden schicken oder Kunden zuordnen,
4. für Kunden ausfüllen und eine personalisierte Anfrage bearbeiten,
5. einen Richtpreis ausrechnen, den Rechenweg lesen und wissen, wann der Schalter „Richtpreis für Kunden anzeigen“ eingeschaltet werden darf.

## Vorbereitung (Trainerin oder Trainer, ca. 30 Minuten vorher)

- **Raum:** Beamer, je zwei Teilnehmende ein Rechner mit Anmeldung im Staff-Bereich (`/staff/login`).
- **Übungsdateien** (aus `docs/schulung/beispiele/`, nur erfundene Daten, auf einen Stick oder in einen Ordner legen):

  | Datei | Wofür |
  | --- | --- |
  | `visitenkarte-design.pdf` | Design für Übung 1 (2 Seiten: Vorder- und Rückseite, Endformat 85 × 55 mm, 3 mm Beschnitt) |
  | `namensschild-design.pdf` | zweites Design für schnelle Teilnehmende (1 Seite, 90 × 60 mm) |
  | `visitenkarten-beispiel.csv` | Tabelle für Übung 2 (5 Zeilen: Vorname, Nachname, Funktion, Telefon, E-Mail, Auflage) |

- **Testkunde:** Einen Kunden „Test Schulung“ mit freigeschalteter E-Mail-Adresse anlegen (siehe Lektion „Kunden freischalten“), auf die jemand im Raum Zugriff hat.
- **Stammdaten der Kalkulation:** Prüfen, ob unter `/staff/kalkulation` ein Artikel wählbar ist. Wenn nicht: Beispieldaten nur auf einer **Test-Umgebung** laden (`node scripts/kalkulation-beispieldaten.mjs`, verweigert andere Datenbanken als localhost). **Nie** auf der Produktion.
- **Schalter „Richtpreis für Kunden anzeigen“** vor der Schulung auf **aus** lassen und kontrollieren.
- Beim Üben in der echten Umgebung: Vorlagen mit „Übung“ im Namen anlegen und nach der Schulung archivieren (Knopf „Archivieren“).

## Ablauf (90 Minuten, Kurzfassung für 60 Minuten unten)

| Zeit | Block | Inhalt | Lektionen / Material |
| --- | --- | --- | --- |
| 0:00 | **Ankommen** (10 Min.) | Warum das Ganze? Was ändert sich? Wer darf was? Kurz zeigen: `Personalisierung` in der Übersicht, `Tour starten` | „Was ist eine Vorlage?“ |
| 0:10 | **Übung 1: Vorlage anlegen** (25 Min.) | Zu zweit: Design hochladen, Felder setzen, Druckbogen, Freigabe. Trainer zeigt jeden Schritt einmal, dann üben die Paare | „Neue Vorlage in 4 Schritten“, „Felder im Editor“, PDF „Vorlage anlegen“ |
| 0:35 | **Übung 2: Kunden und Ausfüllen** (20 Min.) | Link erzeugen, als Kunde ausfüllen (einzeln und Tabelle), Fehler absichtlich auslösen, Prüfung lesen, für Kunden absenden | „Link an Kunden schicken / Kunden zuordnen“, „Für Kunden ausfüllen“, „Häufige Fehler“ |
| 0:55 | **Pause** (5 Min.) | | |
| 1:00 | **Auftrag bearbeiten** (10 Min.) | Den Auftrag aus Übung 2 öffnen: Kennzeichen, Karte, Druck-PDF und Datentabelle prüfen | „Personalisierte Anfrage bearbeiten“ |
| 1:10 | **Kalkulation** (15 Min.) | Ad-hoc kalkulieren, Rechenweg lesen, Preis-Einstellungen ansehen, Schalter und Zuordnung erklären (nicht einschalten) | „Ad-hoc kalkulieren“, „Rechenweg lesen“, „Preis-Einstellungen & Richtpreis für Kunden“, PDF „Kalkulation & Richtpreis“ |
| 1:25 | **Abschluss** (5 Min.) | Checkliste „Kann ich allein“ abhaken, offene Fragen, Quiz in der Online-Schulung als Hausaufgabe | Quiz je Lektion |

### Kurzfassung (60 Minuten)

Streichen Sie die Lektion „Schriften & Farben“ und die Fehlerübung, beschränken Sie die Kalkulation auf „Ad-hoc kalkulieren“ und „Rechenweg lesen“ und zeigen Sie den Schalter nur kurz. Die Teilnehmenden lesen „Stammdaten pflegen“ und „Preis-Einstellungen“ später selbst.

## Übung 1: Vorlage „Visitenkarte Übung“ anlegen (25 Minuten)

Ausgangslage: Datei `visitenkarte-design.pdf`.

1. `Personalisierung` → `Neue Vorlage`. Name: „Visitenkarte Übung 1“ (mit eigenem Kürzel).
2. `PDF auswählen` → `visitenkarte-design.pdf`. **Erwartet:** „Design geprüft. Format erkannt.“, Endformat 85 × 55 mm, Beschnitt 3 mm, zwei Seiten (Vorder- und Rückseite).
3. `Vorlage anlegen und weiter`. Schritt **Felder**:
   - `+ Text` hinzufügen, auf die freie weiße Fläche unter dem grünen Balken schieben. Im Feld **Inhalt** `Eingabe einfügen` → `+ Neue Eingabe …` → „Vorname“, danach `+ Neue Eingabe …` → „Nachname“. Der Inhalt lautet jetzt `{{vorname}} {{nachname}}`.
   - Schrift **Open Sans** (falls vorhanden), Fett, Größe 12. Haken **Automatisch verkleinern, bis es passt**.
   - `Mit Beispieldaten anzeigen` einschalten: Wie sieht die Karte aus?
   - **Zusatz für Schnelle:** zweites Feld „Funktion“ und ein `+ vCard-QR` auf die Rückseite.
4. Schritt **Druckbogen**: `Einzelseiten mit Beschnitt (Standard)` lassen. Kurz `Ausgeschossen auf Druckbögen` ansehen, dann zurück.
5. Schritt **Freigabe**: **Wer darf die Vorlage nutzen?** → `Nur Mitarbeiter`. `Veröffentlichen`.

**Prüffragen für die Gruppe:** Was sehen Kunden jetzt? (Nichts, die Vorlage ist nur für Mitarbeiter.) Was passiert, wenn Sie das Browserfenster schließen? (Nichts geht verloren, der Entwurf wird automatisch gesichert.)

## Übung 2: Kunden, Ausfüllen, Fehler (20 Minuten)

1. In der Vorlage zu **Freigabe** gehen, `Öffentlich per Link` wählen, `Link erzeugen und kopieren`, Link in ein neues privates Fenster einfügen (so sieht ein Kunde ohne Konto die Seite).
2. Als Kunde: Reiter `Tabelle hochladen`, `visitenkarten-beispiel.csv` hineinziehen, Zuordnung ansehen, `Zuordnung bestätigen und übernehmen`.
3. **Fehler auslösen:** bei einem Eintrag den Nachnamen löschen und `Weiter: Prüfen` klicken. **Erwartet:** roter Kasten, `Zum Feld` führt zur Stelle. Bei einem anderen Eintrag eine sehr lange Funktion eintragen: **Hinweis** statt Fehler (Schrift wird verkleinert).
4. Beheben, `Weiter: Absenden`, Auflage für alle setzen, Name und E-Mail des Testkunden eintragen, Code aus dem Postfach eingeben.
5. Zweiter Durchgang als Mitarbeiter: In der Übersicht `Für Kunden ausfüllen` → Testkunden wählen → `Im Namen des Kunden absenden` (ohne Code).

## Auftrag bearbeiten (10 Minuten)

Den Auftrag aus Übung 2 in der Auftragsliste öffnen:

- Kennzeichen `Personalisierung`, Karte mit Vorlage, Version, Datensätzen und Nutzen.
- Unter **Dateien** das Druck-PDF öffnen: Stichproben (erster, letzter, längster Name). Datentabelle (XLSX) ansehen.
- Weiter wie gewohnt (Auftragsbestätigung, Freigabe), das ist aus der Schulung „Aufträge bearbeiten“ bekannt.

## Kalkulation (15 Minuten)

1. `Kalkulation`: Artikel „Flyer“ wählen, Fragen ansehen, Auflagen 100, 250, 500, `Richtpreis berechnen`. Frage an die Gruppe: Warum sinkt der Preis je Stück?
2. `Rechenweg anzeigen`: Zusammen von oben nach unten lesen (Position → Kosten → Gemeinkosten → Gewinn → Mindestpreis → Rundung → Brutto).
3. `Preis-Einstellungen`: In der Beispielrechnung den Gewinn ändern und die Wirkung beobachten. **Nicht speichern** (oder Standardwerte einsetzen).
4. Karte **Richtpreis für Kunden anzeigen**: erklären, warum der Schalter ab Werk aus ist und wann er eingeschaltet wird (erst nach geprüften Stammdaten, Probe-Anfrage, Freigabe durch die Verantwortlichen). **Nicht einschalten.**
5. Nur zeigen: `Stammdaten` → `Werkbank öffnen`. Das Pflegen übernimmt die zuständige Person.

## Checkliste „Kann ich allein“

Jede Teilnehmerin und jeder Teilnehmer hakt ab, was sie oder er **ohne Hilfe** geschafft hat. Fehlt ein Haken, wird die Übung in den nächsten Tagen mit einer Kollegin oder einem Kollegen wiederholt.

- [ ] Ich kann eine **Vorlage anlegen**: Design hochladen, Felder platzieren, Druckbogen wählen, veröffentlichen.
- [ ] Ich kann einen **Link an Kunden schicken** (oder Kunden zuordnen) und weiß, dass der Link nur einmal angezeigt wird.
- [ ] Ich kann **für Kunden ausfüllen** und den Testkunden auswählen.
- [ ] Ich kann eine **personalisierte Anfrage bearbeiten**: Kennzeichen, Druck-PDF und Datentabelle prüfen.
- [ ] Ich kann einen **Richtpreis prüfen**: kalkulieren, Rechenweg lesen, „Preis auf Anfrage“ erklären.
- [ ] Ich weiß, wo ich **Hilfe** finde: Menü `Hilfe`, `Tour starten`, Online-Schulung.

## Nacharbeit

- Online-Quiz in der Schulung `/hilfe/druckerei` (je Lektion eine Frage) innerhalb einer Woche.
- Übungsvorlagen archivieren, Übungsaufträge klären.
- Nach einer Woche kurz fragen: Wo hat es gehakt? Fehlende oder unklare Stellen in `lib/hilfe/inhalte.ts` verbessern (Pflege: `docs/schulung/README.md`).

---

# Übergabe-Notiz für den bisherigen retorix-Bediener

*Für die Person, die bisher als Einzige das alte Personalisierungs-Tool bedient hat.*

## Was ändert sich?

- **Alle Mitarbeitenden** können jetzt Vorlagen anlegen und personalisierte Aufträge bearbeiten, Sie sind nicht mehr der einzige Zugang. Ihre Rolle wird: Ansprechpartner für schwierige Designs und Prüfer der übernommenen Vorlagen.
- Statt ein eigenes Tool zu bedienen, arbeiten Sie im **Staff-Bereich** unter `Personalisierung`. Ein Assistent führt Sie in vier Schritten (Design, Felder, Druckbogen, Freigabe); die Felder setzen Sie mit der Maus auf das Design.
- **Kunden füllen selbst aus**, ohne Konto per Link oder mit Konto unter „Meine Vorlagen“. Das Druck-PDF entsteht automatisch und hängt am Auftrag. Sie müssen es nicht mehr von Hand erzeugen.
- Aufträge aus Vorlagen tragen das Kennzeichen `Personalisierung` und gehen durch denselben Ablauf wie alle anderen Aufträge (Prüfung, Freigabe, Produktion, Versand).

## Wo liegen Ihre Altvorlagen?

- Beim Import aus dem alten System werden **Vorlagen, Schriften und Farben** übernommen. **Nicht** übernommen werden Bestellungen, Warenkörbe und Kunden.
- Die importierten Vorlagen liegen in `Personalisierung` als **Entwurf** und sind **nur für Mitarbeiter** sichtbar. Kunden können sie erst nutzen, wenn Sie sie veröffentlicht haben.
- Der Import ist wiederholbar: Was schon importiert wurde, wird übersprungen.
- Schriften und Farben stehen unter `Schriften & Farben`.

## Was Sie prüfen sollten (je Vorlage, ca. 10 Minuten)

1. Vorlage öffnen (`Bearbeiten`), Schritt **Design**: stimmen Name, Endformat und Beschnitt?
2. Schritt **Felder**: `Mit Beispieldaten anzeigen` einschalten. Sitzen die Felder an der richtigen Stelle? Passen lange Namen (Haken **Automatisch verkleinern, bis es passt**)?
3. Rechts bei **Prüfung** stehen Hinweise (z. B. Schrift fehlt oder Feld im Beschnitt). Fehlende Schriften unter `Schriften & Farben` hochladen.
4. Schritt **Druckbogen**: Ausgabeart wählen.
5. Schritt **Freigabe**: **Wer darf die Vorlage nutzen?** wählen und `Veröffentlichen`. Erst dann ist die Vorlage für Kunden da.
6. Mit `Für Kunden ausfüllen` oder dem Link einen Probeauftrag machen und das Druck-PDF mit einem Altergebnis vergleichen.

## Ihr Einsatz in der Einführung

- Sie unterstützen in der Schulung (Übung 1 und 2) und beantworten Fragen zu Besonderheiten der Designs.
- Sie prüfen die übernommenen Vorlagen nach der obigen Liste und veröffentlichen sie schrittweise.
- Auffälligkeiten (z. B. Sonderzeichen, Spezialfälle aus dem alten System) melden Sie bitte an die Administration. Die Anleitungen werden danach angepasst.
