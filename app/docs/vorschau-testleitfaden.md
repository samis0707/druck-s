# Testleitfaden Vorschau-Umgebung

Für Elysen Butz – Einbindung von kalpri in druck-s

## Worum es geht

Der Rechenkern von kalpri läuft jetzt in druck-s: Aus Artikel, Fragen und Auflage entstehen Kosten und daraus ein unverbindlicher Richtpreis, im Backoffice, für Kunden in der Anfrage und über eine Schnittstelle.

Die Vorschau ist von der Produktion getrennt. Sie hat eine eigene, zunächst leere Datenbank mit Beispieldaten und eigenen Speicher. Es gibt keine Kundendaten und keine echten Aufträge.

Du kennst kalpri und die Werkbank sehr gut. Neu ist die Einbindung. Teste vor allem, ob sich alles so verhält, wie Du es aus kalpri erwartest, und ob die Preisschicht von druck-s sinnvolle Zahlen daraus macht.

## So ist kalpri eingebunden

Für Dich als Entwickler, damit Du beim Weiterentwickeln von kalpri weißt, was in druck-s daran hängt.

### Rechenkern und Werkbank

- Die Pakete units, layout-core und resources liegen unverändert vendoriert unter lib/kalpri/. Der Stand steht in lib/kalpri/HERKUNFT.json (kalpri-Commit ae8e558, sauberer Stand, Hash des Werkbank-Patches).
- scripts/kalpri-sync.mjs kopiert die Pakete aus einem lokalen kalpri-Repo und schreibt HERKUNFT.json. Einzige Änderung am Code: Der Import 'zod' wird zu 'zod/v3' umgeschrieben, weil druck-s auf zod 4 steht und der Kern die v3-API nutzt.
- Mit --werkbank baut das Skript die Werkbank mit lib/kalpri/werkbank.patch und legt sie unter vendor/kalpri-werkbank/ ab. Der Patch setzt den Basis-Pfad /staff/kalkulation/werkbank/, nutzt die Staff-Session statt eines API-Keys (Build mit VITE_SERVER_ADRESSE) und blendet die Verbindungsmaske aus.
- Die Werkbank wird nur an angemeldete Mitarbeitende ausgeliefert (Route unter /staff/kalkulation/werkbank/).

### Ablage und Sicherung

- Die Werkbank-Bereiche (z. B. werkbank.stanze.v1) liegen in Postgres. Geschrieben wird mit optimistischer Sperre: Bei veralteter Version antwortet der Server mit 409. Jede Änderung landet im unveränderlichen Verlauf.
- Das Sicherungsformat ist kompatibel (werkbank-sicherung): Import und Export gehen in beide Richtungen, also auch aus Deiner lokalen Werkbank nach druck-s und zurück.
- Beim Abmelden im Mitarbeiterbereich werden die lokalen Werkbank-Daten (werkbank.* im Browser-Speicher) gelöscht.

### Preisschicht und Schnittstellen

- kalpri liefert nur Kosten. Die Preisschicht in druck-s legt Zuschläge, Gewinn, Mindestpreis, Rundung, Spanne und MwSt darauf (Einstellungen unter /staff/kalkulation/einstellungen).
- Maschinen-API: /api/v1/kalkulation/* mit Bearer-Key. Key anlegen mit node scripts/kalkulation-key.mjs create "<Name>". Beschreibung unter /api/docs.
- Öffentliche Richtpreis-Endpunkte: GET /api/v1/richtpreis/artikel und POST /api/v1/richtpreis (mit Begrenzung pro IP).

### Was Du beim Weiterentwickeln von kalpri beachten musst

- Ablauf: Änderung in kalpri committen (sauberer Stand, sonst vermerkt HERKUNFT.json das), dann in druck-s node scripts/kalpri-sync.mjs <kalpri-repo> --werkbank ausführen, Ergebnis und HERKUNFT.json committen.
- Der Werkbank-Patch kann brechen, sobald sich server-sync.ts oder andere vom Patch berührte Dateien der Werkbank ändern. Dann den Patch gegen den neuen Stand neu erzeugen. Das Skript merkt sich den Hash des Patches.
- Die Tests laufen in druck-s mit (npm test). Ändert sich eine Kostenberechnung, schlagen Tests der Preisschicht und der Beispieldaten an. Das ist gewollt, dann prüfen und Erwartungswerte bewusst anpassen.
- Neue Bereiche oder Felder in der Werkbank: Sicherungsformat und Import in druck-s mitziehen, sonst gehen sie beim Einspielen verloren.

## Testszenarien

Hake ab, was Du erledigt hast. Der Haken bleibt nur in diesem Browser gespeichert (kein Server).

### A: Ad-hoc-Kalkulation

Wo: /staff/kalkulation

Was tun:

- [ ] Einen der Beispielartikel wählen (Flyer, Visitenkarten, Plakat).
- [ ] Die Fragen beantworten und eine Auflage eintragen.
- [ ] Den Rechenweg aufklappen und Kosten, Zuschläge und Richtpreis nachvollziehen.
- [ ] Auflage ändern und prüfen, ob sich Preis und Staffel plausibel verändern.

Das sollte passieren:

- Sofort ein Richtpreis netto mit Spanne und Bruttopreis.
- Der Rechenweg zeigt die Kosten aus kalpri und die Schritte der Preisschicht nachvollziehbar.
- Das Plakat ist nur intern und dem Kunden nicht angeboten.

### B: Werkbank bearbeiten

Wo: /staff/kalkulation/werkbank/

Was tun:

- [ ] Die Werkbank öffnen. Es gibt keine Verbindungsmaske, Du bist über die Anmeldung verbunden.
- [ ] Etwas ändern, z. B. einen Papierpreis, und speichern.
- [ ] Zurück zu /staff/kalkulation: gleiche Kalkulation wie vorher neu rechnen und die Wirkung prüfen.
- [ ] Die Werkbank in zwei Tabs öffnen, in beiden denselben Bereich ändern, erst in Tab 1 speichern, dann in Tab 2.

Das sollte passieren:

- Die Änderung wirkt auf den Rechner, ohne dass Du etwas exportieren musst.
- In Tab 2 erscheint ein Konflikthinweis (Server antwortet 409), Deine Änderung überschreibt die erste nicht stillschweigend.

### C: Sicherung herunterladen und einspielen

Wo: /staff/kalkulation/stammdaten und die Werkbank

Was tun:

- [ ] Eine Sicherung herunterladen.
- [ ] Etwas ändern und die Sicherung wieder einspielen. Zuerst die Vorschau der Übernahme ansehen, dann übernehmen.
- [ ] Eine eigene Sicherung aus Deiner lokalen kalpri-Werkbank (Format werkbank-sicherung) einspielen.
- [ ] Danach in der Werkbank und im Rechner prüfen, ob Deine Daten angekommen sind.

Das sollte passieren:

- Der Stand vor der Änderung ist wieder da.
- Die Vorschau der Übernahme nennt, was neu, geändert oder abgelehnt wird. Ungültige Sicherungen werden mit verständlicher Meldung abgelehnt.
- Deine lokale Sicherung lässt sich einspielen und lässt sich wieder exportieren.

### D: Preis-Einstellungen und Kundenfreigabe

Wo: /staff/kalkulation/einstellungen

Was tun:

- [ ] Zuschläge, Gewinn, Mindestpreis, Rundung, Spanne oder MwSt ändern.
- [ ] Die Beispielrechnung auf der Seite prüfen und mit eigener Handrechnung vergleichen.
- [ ] Die Zuordnung Produkt zu Artikel ansehen und ändern.
- [ ] Den Schalter "Richtpreis für Kunden anzeigen" ein- und ausschalten.

Das sollte passieren:

- Die Beispielrechnung folgt den Einstellungen sofort. Rundung und Mindestpreis greifen wie beschrieben.
- Änderungen gelten für neue Berechnungen. Gespeicherte Richtpreise zu Anfragen behalten ihre damaligen Werte.
- Bei ausgeschaltetem Schalter sieht der Kunde keinen Richtpreis (Szenario E).

### E: Richtpreis in der Kundenanfrage

Wo: /anfrage (als Gast, im privaten Fenster)

Was tun:

- [ ] Ein privates Browserfenster öffnen und /anfrage aufrufen.
- [ ] Ein zugeordnetes Produkt wählen und den Richtpreis anzeigen lassen.
- [ ] Die Anfrage mit Deiner eigenen Mailadresse absenden und den Code aus der Mail bestätigen.
- [ ] Im normalen Fenster im Backoffice die Anfrage öffnen.

Das sollte passieren:

- Der Kunde sieht einen unverbindlichen Richtpreis mit Spanne, klar als unverbindlich gekennzeichnet.
- Die Mail kommt an (Betreff mit [Vorschau]), weil die Adresse im Ablauf eingegeben wurde.
- Im Backoffice steht bei der Anfrage "Richtpreis (unverbindlich)" mit dem Wert vom Absenden.

### F: Personalisierung

Wo: /staff/personalisierung

Was tun:

- [ ] Die Beispielvorlage (Visitenkarte) im Editor ansehen.
- [ ] Eine neue Vorlage aus einem eigenen PDF anlegen.
- [ ] Den Kundenlink im privaten Fenster öffnen und ausfüllen, einmal einzeln und einmal per Tabelle.
- [ ] Absenden und das erzeugte PDF öffnen.

Das sollte passieren:

- Der Editor zeigt Felder und Vorschau zur Vorlage.
- Das PDF enthält die eingetragenen Werte, die Barcodes sind Vektoren (scharf bei starkem Zoom) und der Beschnitt stimmt.
- Bei der Tabelle entsteht ein PDF mit allen Zeilen.

### G: Hilfe

Wo: /hilfe

Was tun:

- [ ] Den Mitarbeiter-Kurs durchgehen.
- [ ] Die geführten Touren starten, z. B. unter /staff und /staff/kalkulation.
- [ ] Notieren, wo Du hängen bleibst oder etwas nicht stimmt.

Das sollte passieren:

- Texte und Schritte sind verständlich und passen zu dem, was Du auf dem Bildschirm siehst.
- Rückmeldung zur Verständlichkeit ist ausdrücklich erwünscht.

## Bekannte Einschränkungen der Vorschau

- Nur Beispiel-Stammdaten, keine echten DMP-Preise.
- Kein Virenscanner: Uploads werden ungeprüft angenommen.
- Mails gehen nur an Vorschau-Mitarbeitende und an Adressen, die im Ablauf selbst eingegeben wurden. Der Betreff beginnt mit "[Vorschau]".
- Bei jedem Push auf den Branch claude/magical-albattani-4nczto baut die Vorschau automatisch neu auf. Die Daten bleiben erhalten.
- Die Vorschau ist für Suchmaschinen gesperrt (noindex).

## Rückmeldung geben

Notiere pro Fund kurz: Szenario-Buchstabe, Seite bzw. URL, was Du erwartet hast, was passiert ist und wenn möglich einen Screenshot. Schick das an Samis. Ein Ticket-System brauchst Du nicht.
