/**
 * Mitarbeiter-Kurs „druckerei“ (Staff-Bereich, Personalisierung-Vorlagen, Kalkulation, Stammdaten, Richtpreis-Einstellungen,
 * API-Schlüssel …). NUR für angemeldete Mitarbeitende (Rolle staff) — siehe lib/hilfe/zugriff.ts.
 *
 * Diese Datei darf nie in Client-Komponenten ("use client") importiert werden: Der Inhalt würde in öffentlich
 * abrufbare JavaScript-Dateien gelangen (tests/hilfe-zugriff.test.ts prüft das). Nur lib/hilfe/kurse.ts importiert sie.
 */
import { FAKTEN, type Download, type Kurs } from "./inhalte";

/** Kurzanleitungen des Mitarbeiter-Kurses: nicht in public/, sondern in hilfe-intern/pdf (Auslieferung nur mit Staff-Sitzung). */
const PDF_PERS_VORLAGE: Download = {
  titel: "Kurzanleitung Personalisierung: Vorlage anlegen",
  beschreibung: "2 Seiten A4: Vorlage in 4 Schritten anlegen, Felder im Editor, Link an Kunden, häufige Fehler.",
  href: "/hilfe-intern/dmp-druckraum-kurzanleitung-personalisierung-vorlage.pdf",
  datei: "dmp-druckraum-Kurzanleitung-Personalisierung-Vorlage.pdf",
  seiten: 2,
};
const PDF_KALKULATION: Download = {
  titel: "Kurzanleitung Kalkulation & Richtpreis",
  beschreibung: "2 Seiten A4: Ad-hoc kalkulieren, Rechenweg lesen, Preis-Einstellungen, Richtpreis für Kunden, Richtpreis an der Anfrage.",
  href: "/hilfe-intern/dmp-druckraum-kurzanleitung-kalkulation.pdf",
  datei: "dmp-druckraum-Kurzanleitung-Kalkulation.pdf",
  seiten: 2,
};

export const KURS_MITARBEITER: Kurs =
{
    slug: "druckerei",
    titel: "Aufträge bearbeiten im Staff-Bereich",
    zielgruppe: "Für die Druckerei (Staff)",
    beschreibung:
      "Für alle Mitarbeitenden: Aufträge sichten, Befunde prüfen, zur Freigabe senden, Versand erfassen, Kunden freischalten, dazu Vorlagen für personalisierte Drucksachen anlegen und Richtpreise kalkulieren.",
    kurz: "Schulung für das Team der Druckerei: Aufträge, Freigabe und Versand, Personalisierung (Vorlagen anlegen, ausfüllen) sowie Kalkulation und Richtpreis.",
    tour: { href: "/staff", label: "Tour im Staff-Bereich starten" },
    download: {
      titel: "Kurzanleitung für die Druckerei",
      beschreibung: "2 Seiten A4: Triage, Befunde, Freigabe, Versand, Kunden & Links — mit Tastenkürzeln.",
      href: "/hilfe-intern/dmp-druckraum-kurzanleitung-druckerei.pdf",
      datei: "dmp-druckraum-Kurzanleitung-Druckerei.pdf",
      seiten: 2,
    },
    lektionen: [
      {
        slug: "staff-anmelden",
        titel: "Im Staff-Bereich anmelden",
        kurz: "Anmeldung für Mitarbeitende der Druckerei mit E-Mail und Code unter „Staff-Login“.",
        einleitung: "Der Staff-Bereich ist nur für Mitarbeitende der Druckerei. Auch hier gibt es kein Passwort, sondern einen Code per E-Mail.",
        schritte: [
          "Öffnen Sie „Staff-Login“ (Link in der Fußzeile jeder Seite).",
          "Geben Sie Ihre Firmen-E-Mail-Adresse ein und klicken Sie auf „Code senden“.",
          "Geben Sie den Code ein und klicken Sie auf „Anmelden“ — Sie landen in der Auftragsliste.",
        ],
        gutZuWissen: "Wer keinen Zugang hat, bekommt keinen Code. Zugänge vergibt die Administration der Druckerei.",
        bilder: [{ name: "druckerei-login", alt: "Seite „Staff-Login“ mit E-Mail-Feld und dem Knopf „Code senden“" }],
        ausprobieren: { href: "/staff/login", label: "Zum Staff-Login" },
        block: "Aufträge und Kunden",
        minuten: 1,
      },
      {
        slug: "auftraege-sichten",
        titel: "Aufträge sichten (Triage)",
        kurz: "Auftragsliste durchsuchen, nach Dringlichkeit sortieren, nach Status und Herkunft filtern und per Tastatur durchgehen.",
        einleitung:
          "Die Seite „Aufträge“ ist die Warteschlange. Links die Liste, rechts die Details des gewählten Auftrags — ohne die Seite zu wechseln.",
        schritte: [
          "Suchen Sie im Feld „Suchen nach Auftragsnummer, Produkt, Text, E-Mail, Status …“.",
          "Sortieren Sie mit „Dringendste zuerst“, „Neueste zuerst“, „Älteste zuerst“ oder „Meiste Dateien zuerst“.",
          "Filtern Sie nach Status und Herkunft („Verifiziert“, „Per Link / Interessent“) oder schalten Sie „Nur: braucht Blick“ ein.",
          "Wählen Sie einen Auftrag mit Klick oder mit den Tasten j/k; die Leertaste öffnet die Dateivorschau, Esc schließt die Details.",
          "Klicken Sie auf „Auftrag ansehen“, um alle Schritte bis zum Versand zu bearbeiten.",
        ],
        gutZuWissen:
          "Mit „Assets“ statt „Liste + Details“ sehen Sie alle Dateien aller Aufträge auf einmal — praktisch, um Auffälliges schnell zu finden. Die Ansicht wird gemerkt.",
        bilder: [
          { name: "druckerei-auftraege", alt: "Staff-Seite „Aufträge“ mit Filterleiste, Auftragsliste und Detailbereich rechts" },
          { name: "druckerei-assets", alt: "Ansicht „Assets“ mit allen Dateien und ihren Prüfkennzeichen" },
        ],
        ausprobieren: { href: "/staff?tour=start", label: "Staff-Bereich mit Tour öffnen" },
        block: "Aufträge und Kunden",
        minuten: 3,
      },
      {
        slug: "befunde-pruefen",
        titel: "Befunde und Sicherheit prüfen",
        kurz: "Automatischen Hinweis, vorgeschlagene Kategorie, Druckbarkeit und Sicherheitsurteil je Datei richtig lesen.",
        einleitung:
          "Zu jedem Auftrag gibt es einen automatischen Hinweis (KI-Zusammenfassung), eine vorgeschlagene Produktkategorie und je Datei die Ergebnisse der Analyse.",
        schritte: [
          "Öffnen Sie den Auftrag und klappen Sie „Prüfung“ auf.",
          "Lesen Sie „Automatischer Hinweis“ und „Vorgeschlagene Kategorie“ als Einstieg.",
          "Prüfen Sie je Datei unter „Analyse“ die Befunde: „OK“, „Bitte prüfen“ oder „Problem“.",
          "Achten Sie auf das Sicherheitsurteil: „Sauber“, „Manuell prüfen“, „Zurückgehalten“ oder „Virenprüfung läuft“.",
          "Klären Sie Unklarheiten direkt mit dem Kunden, bevor Sie die Auftragsbestätigung anhängen.",
        ],
        details: [
          {
            titel: "Wann wird aus „Eingegangen“ „In Prüfung“?",
            punkte: [
              "Automatisch, sobald jemand aus dem Team eine Datei des Auftrags in der Vorschau öffnet oder herunterlädt.",
              "Erst ab „In Prüfung“ können Sie Auftragsbestätigung und Druckdateien anhängen.",
            ],
          },
        ],
        gutZuWissen:
          "Dateien mit „Zurückgehalten“ nicht herunterladen oder öffnen. „Manuell prüfen“ heißt: strukturelle Auffälligkeit (z. B. Makros, PDF-Skript, falscher Dateityp) — erst ansehen, dann entscheiden.",
        bilder: [{ name: "druckerei-auftrag-pruefung", alt: "Staff-Auftragsseite mit aufgeklappter Stufe „Prüfung“, Befunden je Datei und Sicherheitsurteil" }],
        quiz: {
          frage: "Eine Datei zeigt „Zurückgehalten“. Was tun Sie?",
          antworten: [
            { text: "Herunterladen und lokal mit dem eigenen Virenscanner prüfen." },
            { text: "Nicht öffnen; den Kunden um eine saubere Datei bitten.", richtig: true },
            { text: "Ignorieren — der Druck läuft trotzdem." },
          ],
          erklaerung: "„Zurückgehalten“ bedeutet, der Virenscan hat angeschlagen. Die Datei bleibt gesperrt; der Kunde liefert eine neue.",
        },
        block: "Aufträge und Kunden",
        minuten: 3,
      },
      {
        slug: "zur-freigabe-senden",
        titel: "Auftragsbestätigung anhängen und zur Freigabe senden",
        kurz: "Auftragsbestätigung (PDF) und Druckdateien anhängen und mit „Anhängen & zur Freigabe senden“ an den Kunden schicken.",
        einleitung:
          "Ist alles geklärt, schicken Sie dem Kunden Auftragsbestätigung und finale Druckdateien. Er gibt dann mit einem Code frei.",
        schritte: [
          "Klappen Sie im Auftrag die Stufe „Freigabe“ auf.",
          "Wählen Sie unter „Auftragsbestätigung (PDF)“ die Bestätigung aus.",
          "Wählen Sie unter „Druckdateien (mehrere möglich)“ die finalen Druckdaten aus.",
          "Ersetzen Sie eine frühere Fassung? Tragen Sie den „Grund (bei Ersatz — geht an den Kunden)“ ein.",
          "Klicken Sie auf „Anhängen & zur Freigabe senden“ und bestätigen Sie mit „Senden“.",
        ],
        gutZuWissen:
          "Der Kunde bekommt sofort eine E-Mail; der Status wechselt auf „Wartet auf Freigabe“. Jede neue Fassung erhält eine neue Versionsnummer — freigegeben wird immer die neueste.",
        bilder: [{ name: "druckerei-auftrag-freigabe", alt: "Stufe „Freigabe“ mit den Feldern „Auftragsbestätigung (PDF)“, „Druckdateien“ und dem Knopf „Anhängen & zur Freigabe senden“" }],
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      {
        slug: "versand-erfassen",
        titel: "Rechnung anhängen und Versand erfassen",
        kurz: "Nach der Produktion Rechnung anhängen und Sendungsnummer oder Liefertermin mit „Versand erfassen“ eintragen.",
        einleitung: "Nach der Produktion schließen Sie den Auftrag ab. Der Kunde sieht Rechnung und Versanddaten im Auftrag und bekommt eine E-Mail.",
        schritte: [
          "Klappen Sie im Auftrag die Stufe „Produktion“ auf — darin steht der Bereich „Versenden“.",
          "Wählen Sie unter „Rechnung“ die Rechnung (PDF) aus.",
          "Tragen Sie die „Sendungsnummer (Versanddienstleister)“ ein — oder bei Eigenzustellung das „Lieferdatum Eigenzustellung (JJJJ-MM-TT)“.",
          "Klicken Sie auf „Versand erfassen“ und bestätigen Sie mit „Erfassen“.",
        ],
        gutZuWissen:
          "Die Rechnung können Sie schon vorab speichern („Rechnung gespeichert — der Versand folgt …“). Erst mit Sendungsnummer oder Liefertermin wird der Auftrag „Versendet“.",
        bilder: [{ name: "druckerei-auftrag-versand", alt: "Bereich „Versenden“ in der Stufe „Produktion“ mit den Feldern „Rechnung“, „Sendungsnummer“ und „Lieferdatum Eigenzustellung“" }],
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      {
        slug: "kunden-und-links",
        titel: "Kunden freischalten und Einmal-Links erstellen",
        kurz: "Unter „Kunden & Links“ Interessenten freischalten, Konten deaktivieren und Einmal-Upload-Links für neue Kunden erzeugen.",
        einleitung:
          "Nur freigeschaltete Kunden können selbst hochladen und freigeben. Wer neu ist, stellt eine Anfrage ohne Kundenkonto oder bekommt von Ihnen einen Einmal-Upload-Link.",
        schritte: [
          "Klicken Sie in „Aufträge“ oben auf „Kunden & Links“.",
          "Für einen Einmal-Link: E-Mail-Adresse unter „Einmal-Upload-Link“ eintragen und „Link erstellen“ klicken; den Link an den Kunden schicken.",
          "Für einen festen Zugang: in der Kundenliste bei Status „Interessent“ auf „Freischalten“ klicken. Anfragen dieser Adresse gehören danach zum Kundenkonto.",
          "Um einen Zugang zu sperren: „Deaktivieren“ klicken und „Konto wirklich deaktivieren?“ bestätigen.",
        ],
        gutZuWissen: `Ein Einmal-Link gilt ${FAKTEN.einmalLinkTage} Tage und verfällt beim Senden. Aufträge über einen Link tragen in der Liste das Kennzeichen „Per Link“. Wer ohne Kundenkonto anfragt, erscheint nach der Bestätigung per E-Mail-Code von selbst als „Interessent“ in der Kundenliste; der Auftrag trägt dasselbe Kennzeichen, und Sie bekommen einen Hinweis per E-Mail. Sehen und freigeben kann der Interessent seine Aufträge erst nach dem Freischalten.`,
        bilder: [{ name: "druckerei-kunden", alt: "Seite „Kunden & Links“ mit Einmal-Upload-Link, Historien-Import und Kundenliste" }],
        ausprobieren: { href: "/staff/customers", label: "Zu „Kunden & Links“" },
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      {
        slug: "historie-importieren",
        titel: "Auftragshistorie importieren",
        kurz: "Frühere Aufträge eines Kunden als MIS-XML importieren, damit der automatische Hinweis sie berücksichtigt.",
        einleitung:
          "Der automatische Hinweis wird besser, wenn er weiß, was ein Kunde früher bestellt hat („wie letztes Mal“).",
        schritte: [
          "Öffnen Sie „Kunden & Links“.",
          "Tragen Sie unter „Historien-Dump (MIS-XML)“ die E-Mail-Adresse des Kunden ein.",
          "Wählen Sie die XML-Datei aus Ihrem MIS und klicken Sie auf „Importieren“.",
          "Prüfen Sie in der Kundenliste unter „Dump“ mit „Inhalt ansehen“, was übernommen wurde.",
        ],
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      {
        slug: "hinweis-einstellen",
        titel: "Den automatischen Hinweis steuern",
        kurz: "Unter „Einstellungen“ den Text pflegen, der das Verhalten des automatischen Hinweises (KI) steuert.",
        einleitung:
          "Der automatische Hinweis entsteht mit einem KI-Modell auf EU-Servern. Unter „Einstellungen“ legen Sie fest, worauf er achten soll.",
        schritte: [
          "Klicken Sie in „Aufträge“ oben auf „Einstellungen“.",
          "Passen Sie den Text an, z. B. Hausregeln für Papiere oder Mindestmengen.",
          "Klicken Sie auf „Speichern“ — oder „Verwerfen“, um Änderungen zu verwerfen.",
          "Mit „Standard wiederherstellen“ kehren Sie zur Ausgangsfassung zurück.",
        ],
        gutZuWissen: "Frühere Fassungen werden mit Zeitpunkt aufgelistet. Änderungen wirken auf neue Aufträge, nicht rückwirkend.",
        bilder: [{ name: "druckerei-einstellungen", alt: "Seite „Einstellungen“ mit dem Text für den automatischen Hinweis und den Knöpfen „Speichern“ und „Standard wiederherstellen“" }],
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      {
        slug: "partner-auftraege",
        titel: "Partner-Aufträge erkennen",
        kurz: "Aufträge aus Partnersystemen (z. B. Seeräuber digital) an Kennzeichen, Partner-Referenz und Quelle erkennen.",
        einleitung:
          "Partnersysteme liefern Aufträge automatisch über eine Schnittstelle ein. Sie laufen durch dieselben Stufen wie alle anderen Aufträge.",
        schritte: [
          "Erkennen Sie Partner-Aufträge am Kennzeichen „Über …“ mit dem Partnernamen.",
          "Suchen Sie nach Partnername oder Partner-Referenz im Suchfeld.",
          "Lesen Sie im Auftrag die Karte „Partner-Auftrag“: Organisation, Kontakt, Format, Auflage, Wunschtermin, Übergabe und Quelle.",
          "Bearbeiten Sie den Auftrag wie gewohnt — der Partner erhält jeden Statuswechsel automatisch.",
        ],
        gutZuWissen: "Partner können Aufträge nur zurückziehen, solange sie „Eingegangen“ oder „In Prüfung“ sind. Danach ist der Status „Zurückgezogen“ nicht mehr möglich.",
        block: "Aufträge und Kunden",
        minuten: 2,
      },
      // ---------- Personalisierung ----------
      {
        slug: "was-ist-eine-vorlage",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Was ist eine Vorlage?",
        kurz: "Eine Vorlage ist ein Design mit leeren Stellen, die Kunden ausfüllen. Die wichtigsten Begriffe und der Weg vom Design zum Druck-PDF.",
        einleitung:
          "Denken Sie an eine Visitenkarte: Das Design bleibt gleich, nur Name und Telefonnummer ändern sich. Genau das ist eine Vorlage: ein Design-PDF mit Feldern, in die später die Daten der Kunden kommen. Danach kann jede Mitarbeiterin und jeder Mitarbeiter Vorlagen anlegen — Technikwissen ist nicht nötig.",
        schritte: [
          "Öffnen Sie im Staff-Bereich „Personalisierung“. Alle Vorlagen liegen dort als Karten.",
          "Lesen Sie den Zustand auf der Karte: „Entwurf“ sieht nur Ihr Team, „Aktiv“ ist veröffentlicht.",
          "Merken Sie sich drei Begriffe: Das Design ist das PDF, das Sie hochladen. Ein Feld ist eine Stelle auf dem Design, zum Beispiel der Name. Eine Eingabe ist die Angabe, die ein Kunde später einträgt, zum Beispiel „Vorname“.",
          "So läuft es ab: Sie legen die Vorlage an (vier Schritte). Kunden füllen sie aus. Daraus entsteht ein Auftrag mit fertigem Druck-PDF.",
          "Probieren Sie nichts an „Aktiv“en Vorlagen aus, die Kunden gerade nutzen: Legen Sie mit „Duplizieren“ eine Kopie an und üben Sie dort.",
        ],
        gutZuWissen:
          "Es geht nichts kaputt: Ihre Änderungen werden automatisch als Entwurf gesichert. Kunden sehen sie erst, wenn Sie auf „Veröffentlichen“ klicken. Vorlagen aus dem alten System liegen nach dem Import als „Entwurf“ zum Prüfen bereit.",
        bilder: [{ name: "pers-uebersicht", alt: "Seite „Personalisierung“ mit drei Vorlagen-Karten, Suchfeld und den Knöpfen „Schriften & Farben“ und „Neue Vorlage“" }],
        quiz: {
          frage: "Was sehen Kunden, wenn eine Vorlage den Zustand „Entwurf“ hat?",
          antworten: [
            { text: "Nichts. Nur Ihr Team kann sie nutzen.", richtig: true },
            { text: "Eine Vorschau ohne Eingabefelder." },
            { text: "Die fertige Vorlage, aber mit dem Hinweis „Entwurf“." },
          ],
          erklaerung: "Erst „Veröffentlichen“ macht die Vorlage für Kunden erreichbar. Bis dahin können Sie in Ruhe ausprobieren.",
        },
        ausprobieren: { href: "/staff/personalisierung?tour=start", label: "Personalisierung mit Tour öffnen" },
        minuten: 3,
      },
      {
        slug: "neue-vorlage-in-4-schritten",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Neue Vorlage in 4 Schritten",
        kurz: "Von der Idee zur fertigen Vorlage: Design hochladen, Felder platzieren, Druckbogen wählen, freigeben.",
        einleitung:
          "Ein Assistent führt Sie durch vier Schritte: Design, Felder, Druckbogen, Freigabe. Sie können nichts falsch machen — der Entwurf wird laufend gesichert und Kunden sehen ihn erst nach der Freigabe.",
        schritte: [
          "Klicken Sie in „Personalisierung“ auf „Neue Vorlage“.",
          "Schritt „Design“: Geben Sie einen „Name der Vorlage“ ein. Ziehen Sie das Design-PDF in das Feld oder klicken Sie auf „PDF auswählen“. Prüfen Sie das erkannte Endformat und den Beschnitt.",
          "Klicken Sie auf „Vorlage anlegen und weiter“. Schritt „Felder“: Fügen Sie Felder hinzu und schieben Sie sie an die richtige Stelle (nächste Lektion).",
          "Schritt „Druckbogen“: Wenn Sie unsicher sind, lassen Sie „Einzelseiten mit Beschnitt (Standard)“ stehen. „Ausgeschossen auf Druckbögen“ ordnet die Karten selbst auf dem Bogen an.",
          "Schritt „Freigabe“: Wählen Sie bei „Wer darf die Vorlage nutzen?“ die Gruppe, prüfen Sie „Noch zu erledigen“ und klicken Sie auf „Veröffentlichen“.",
        ],
        gutZuWissen:
          `Das Design-PDF darf bis ${FAKTEN.persDesignMb} MB groß sein und mehrere Seiten haben (Vorder- und Rückseite). Oben im Assistenten steht, wann zuletzt gesichert wurde. Mit den vier Schritten oben springen Sie jederzeit zwischen den Schritten.`,
        bilder: [{ name: "pers-schritt-design", alt: "Schritt „Design“ des Assistenten: Name der Vorlage, hochgeladenes Design-PDF, erkanntes Format und Vorschau von Vorder- und Rückseite" }],
        quiz: {
          frage: "Sie haben das Design-PDF hochgeladen und das Format passt. Was kommt als Nächstes?",
          antworten: [
            { text: "Sie klicken auf „Vorlage anlegen und weiter“ und platzieren im Schritt „Felder“ die Felder.", richtig: true },
            { text: "Sie klicken auf „Veröffentlichen“." },
            { text: "Sie schicken das PDF per E-Mail an die Kunden." },
          ],
          erklaerung: "Zuerst kommen die Felder (die Stellen für Namen, Telefonnummern …), dann Druckbogen und Freigabe.",
        },
        ausprobieren: { href: "/staff/personalisierung/neu?tour=start", label: "Neue Vorlage mit Tour starten" },
        minuten: 4,
      },
      {
        slug: "felder-im-editor",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Felder im Editor",
        kurz: "Felder hinzufügen, verschieben, einrasten, per Pfeiltasten feinjustieren, Platzhalter einfügen und mit Beispieldaten prüfen.",
        einleitung:
          "Im Schritt „Felder“ legen Sie fest, wo auf dem Design welche Angabe steht. Links wählen Sie die Felder, in der Mitte arbeiten Sie auf dem Design, rechts stellen Sie das gewählte Feld ein.",
        schritte: [
          "Klicken Sie links unter „Feld hinzufügen“ auf die Art, zum Beispiel „Text“. Das Feld erscheint in der Mitte der Karte.",
          "Ziehen Sie das Feld an die richtige Stelle. Es rastet an Rändern und anderen Feldern ein; mit gedrückter Alt-Taste rastet nichts ein. An den Griffen ändern Sie die Größe.",
          "Für die Feinarbeit: Feld anklicken und die Pfeiltasten drücken. Jeder Druck verschiebt um 0,1 mm, mit gedrückter Umschalt-Taste um 1 mm.",
          "Falsch gemacht? Klicken Sie auf „Rückgängig“ oder drücken Sie Strg+Z (Mac: Cmd+Z). So holen Sie auch ein gelöschtes Feld zurück.",
          "Klicken Sie ein Feld an: Rechts stehen die „Eigenschaften“ mit Schrift, Schriftgröße, Farbe und Ausrichtung.",
          "Setzen Sie im Feld „Inhalt“ die Angaben der Kunden ein: Klicken Sie unter „Eingabe einfügen“ auf einen Platzhalter, zum Beispiel „Nachname“. Feste Texte dürfen daneben stehen.",
          "Schalten Sie „Mit Beispieldaten anzeigen“ ein. Dann sehen Sie die Karte so, wie sie mit einem echten Namen aussieht.",
        ],
        details: [
          {
            titel: "Gut zu kennen",
            punkte: [
              "Lange Namen: Setzen Sie den Haken bei „Automatisch verkleinern, bis es passt“ und wählen Sie eine „Mindestgröße“. Wird es noch kleiner, meldet die Prüfung den Text als zu lang.",
              "Ein Platzhalter sieht im Text so aus: {{vorname}}. Beim Ausfüllen wird er durch die Eingabe des Kunden ersetzt. Zeilen, deren Eingaben leer sind, entfallen.",
              "Unter „Eingaben“ (Liste links) stehen alle Angaben, die Kunden später ausfüllen. Dort stellen Sie ein, welche Pflicht sind und wie viele Zeichen höchstens erlaubt sind.",
              "Hat die Vorlage eine Rückseite, wechseln Sie oben mit „Vorderseite“ und „Rückseite“.",
              "Mit „Duplizieren“ kopieren Sie ein Feld, mit „Feld löschen“ entfernen Sie es.",
              "Rechts ohne gewähltes Feld steht die „Prüfung“: Sie zeigt Hinweise, etwa wenn ein Feld im Beschnitt liegt.",
            ],
          },
        ],
        gutZuWissen: "Rot gestrichelt ist das Endformat, rötlich der Beschnitt, blau gepunktet der Sicherheitsabstand von 3 mm. Wichtige Texte gehören in den Bereich innerhalb der blauen Linie.",
        bilder: [
          { name: "pers-editor", alt: "Editor im Schritt „Felder“: links die Feldarten, in der Mitte die Visitenkarte mit gewähltem Feld, rechts die Eigenschaften" },
          { name: "pers-editor-eigenschaften", alt: "Eigenschaften eines Textfelds mit Inhalt, „Eingabe einfügen“, Schrift, Farbe und „Automatisch verkleinern, bis es passt“" },
          { name: "pers-editor-beispiel", alt: "Arbeitsfläche mit eingeschaltetem „Mit Beispieldaten anzeigen“: die Karte zeigt Erika Mustermann" },
        ],
        quiz: {
          frage: "Ein Name passt manchmal nicht in das Feld. Was hilft?",
          antworten: [
            { text: "„Automatisch verkleinern, bis es passt“ einschalten und eine Mindestgröße wählen.", richtig: true },
            { text: "Das Feld löschen und neu anlegen." },
            { text: "Den Kunden bitten, einen kürzeren Namen zu wählen." },
          ],
          erklaerung: "Lange Namen werden dann kleiner gesetzt, statt abgeschnitten zu werden. Mit „Mit Beispieldaten anzeigen“ prüfen Sie das Ergebnis.",
        },
        ausprobieren: { href: "/staff/personalisierung", label: "Zur Übersicht und eine Vorlage öffnen" },
        minuten: 6,
      },
      {
        slug: "schriften-und-farben",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Schriften & Farben",
        kurz: "Eigene Schriften (TTF, OTF) und Farben mit CMYK- oder Sonderfarbwerten anlegen, damit Vorlagen im Hausstil drucken.",
        einleitung:
          "Ohne eigene Schrift steht „Helvetica“ zur Verfügung. Für den Hausstil laden Sie die Schriften Ihrer Marke hoch und legen die Farben an. Beides steht danach in allen Vorlagen zur Auswahl.",
        schritte: [
          "Klicken Sie in „Personalisierung“ auf „Schriften & Farben“.",
          "Schriften: Ziehen Sie TTF- oder OTF-Dateien hinein oder klicken Sie auf „Dateien auswählen“. Prüfen Sie den erkannten Namen der Familie und klicken Sie auf „Hochladen“.",
          "Farben: Tragen Sie einen „Name der Farbe“ ein, zum Beispiel „Firmenblau“, und die vier CMYK-Werte in Prozent.",
          "Für HKS oder Pantone setzen Sie den Haken bei „Sonderfarbe (z. B. HKS oder Pantone)“ und tragen den Namen der Sonderfarbe ein.",
          "Klicken Sie auf „Farbe anlegen“. In jedem Feld der Vorlage finden Sie die Farbe jetzt unter „Farbe“.",
        ],
        gutZuWissen: `Laden Sie nur Schriften hoch, deren Lizenz das Einbetten in Druck-PDFs erlaubt (bis ${FAKTEN.persSchriftMb} MB je Datei). Die Dateien bleiben intern und werden Kunden nie angezeigt. Schriften und Farben, die in einer Vorlage verwendet werden, lassen sich nicht löschen.`,
        bilder: [{ name: "pers-bibliothek", alt: "Seite „Schriften & Farben“ mit hochgeladenen Schriften der Familie Open Sans und den angelegten Farben" }],
        quiz: {
          frage: "Eine Schrift wird in einer Vorlage verwendet. Können Sie sie löschen?",
          antworten: [
            { text: "Nein. Zuerst muss sie aus allen Vorlagen verschwinden.", richtig: true },
            { text: "Ja, die Vorlage nimmt dann „Helvetica“." },
            { text: "Ja, aber nur am Wochenende." },
          ],
          erklaerung: "So bleibt jede Vorlage druckbar. Schriften, die in einer Vorlage verwendet werden, lassen sich nicht löschen.",
        },
        ausprobieren: { href: "/staff/personalisierung/bibliothek", label: "Zu „Schriften & Farben“" },
        minuten: 3,
      },
      {
        slug: "link-und-kunden-zuordnen",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Link an Kunden schicken / Kunden zuordnen",
        kurz: "Im Schritt „Freigabe“ festlegen, wer die Vorlage nutzen darf, und Kunden den Link oder den Zugang geben.",
        einleitung:
          "Eine Vorlage ist erst für Kunden da, wenn Sie sie veröffentlichen. Vorher legen Sie fest, wer sie nutzen darf: nur Ihr Team, bestimmte Kunden mit Konto oder jeder mit einem Link.",
        schritte: [
          "Öffnen Sie die Vorlage und gehen Sie zum Schritt „Freigabe“.",
          "Wählen Sie bei „Wer darf die Vorlage nutzen?“ eine Möglichkeit: „Nur Mitarbeiter“, „Bestimmte Kunden“ oder „Öffentlich per Link“.",
          "Bei „Bestimmte Kunden“: Suchen Sie die Kunden und haken Sie sie an. Sie finden die Vorlage nach der Anmeldung unter „Meine Vorlagen“.",
          "Bei „Öffentlich per Link“: Wählen Sie bei „Gültig“ die Dauer und klicken Sie auf „Link erzeugen und kopieren“. Schicken Sie den Link per E-Mail an den Kunden.",
          "Klicken Sie auf „Veröffentlichen“. Erst danach funktioniert der Link.",
          "Später: In der Übersicht kopiert „Link kopieren“ den Link der Vorlage. Mit „Widerrufen“ sperren Sie einen Link.",
        ],
        gutZuWissen: "Ein neuer Link wird aus Sicherheitsgründen nur einmal angezeigt: Kopieren Sie ihn sofort. Wer den Link hat, kann ohne Konto ausfüllen. Ein widerrufener oder abgelaufener Link zeigt dem Kunden „Dieser Link ist nicht (mehr) gültig“.",
        bilder: [
          { name: "pers-schritt-freigabe", alt: "Schritt „Freigabe“ mit den drei Möglichkeiten bei „Wer darf die Vorlage nutzen?“ und der Kundenauswahl" },
          { name: "pers-freigabe-link", alt: "Bereich „Links für Kunden ohne Konto“ mit dem neu erzeugten Link und den Knöpfen „Erneut kopieren“ und „Als Kunde ausprobieren“" },
        ],
        quiz: {
          frage: "Sie haben einen Link erzeugt und die Seite verlassen. Wo sehen Sie die Adresse wieder?",
          antworten: [
            { text: "Nirgends. Bei Bedarf erzeugen Sie einen neuen Link.", richtig: true },
            { text: "In der Kundenliste unter „Kunden & Links“." },
            { text: "In der E-Mail, die automatisch an den Kunden geht." },
          ],
          erklaerung: "Gespeichert wird nur eine Prüfsumme des Links, nicht die Adresse selbst. Alte Links können Sie mit „Widerrufen“ sperren.",
        },
        minuten: 3,
      },
      {
        slug: "fuer-kunden-ausfuellen",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Für Kunden ausfüllen",
        kurz: "Eine aktive Vorlage im Namen eines Kunden ausfüllen: ohne Code, der Auftrag gehört direkt dessen Konto.",
        einleitung:
          "Manche Kunden schicken Ihnen die Daten lieber per E-Mail. Dann füllen Sie die Vorlage für sie aus. Der Ablauf ist derselbe wie beim Kunden, nur ohne Bestätigungscode.",
        schritte: [
          "Klicken Sie in „Personalisierung“ bei einer aktiven Vorlage auf „Für Kunden ausfüllen“.",
          "Wählen Sie bei „Für welchen Kunden füllen Sie aus?“ den Kunden aus. Der Auftrag entsteht in seinem Namen und gehört seinem Konto.",
          "Tragen Sie die Daten ein, einzeln oder als Tabelle, und klicken Sie auf „Weiter: Prüfen“.",
          "Beheben Sie Fehler mit „Zum Feld“, dann „Weiter: Absenden“ und „Im Namen des Kunden absenden“.",
          "Klicken Sie auf „Auftrag öffnen“ und bearbeiten Sie den Auftrag wie jeden anderen.",
        ],
        gutZuWissen: "Es entsteht ein echter Auftrag. Zum Üben wählen Sie einen Testkunden und ziehen den Auftrag danach zurück oder besprechen ihn im Team.",
        bilder: [{ name: "pers-fuer-kunden", alt: "Kasten „Für welchen Kunden füllen Sie aus?“ mit der Kundenauswahl" }],
        quiz: {
          frage: "Muss der Kunde einen Code bestätigen, wenn Sie für ihn ausfüllen?",
          antworten: [
            { text: "Nein. Der Auftrag entsteht direkt in seinem Namen.", richtig: true },
            { text: "Ja, an seine E-Mail-Adresse." },
            { text: "Ja, aber nur bei mehr als 100 Einträgen." },
          ],
          erklaerung: "Sie handeln als Mitarbeiter im Namen des Kunden, deshalb entfällt der Code.",
        },
        minuten: 3,
      },
      {
        slug: "personalisierte-anfrage-bearbeiten",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Personalisierte Anfrage bearbeiten",
        kurz: "Aufträge aus Vorlagen erkennen, das erzeugte Druck-PDF und die Datentabelle prüfen und wie gewohnt weiterbearbeiten.",
        einleitung:
          "Füllt ein Kunde eine Vorlage aus und bestätigt, entsteht automatisch ein Auftrag. Das Druck-PDF ist schon erzeugt. Sie prüfen es und führen den Auftrag wie jeden anderen weiter.",
        schritte: [
          "Erkennen Sie die Aufträge am Kennzeichen „Personalisierung“ oben auf der Auftragsseite.",
          "Lesen Sie die Karte „Personalisierung“: Vorlage und Version, Datensätze, Nutzen, Seiten und ob „ausgeschossen“ oder „Einzelseiten“ erzeugt wurden.",
          "Öffnen Sie unter „Dateien“ das Druck-PDF und die Datentabelle (XLSX). Prüfen Sie Stichproben: den ersten Eintrag, den letzten und den mit dem längsten Namen.",
          "Haben Sie Rückfragen, klären Sie sie mit dem Kunden, bevor Sie die Auftragsbestätigung anhängen.",
          "Machen Sie weiter wie in den Lektionen zu Befunden und zur Freigabe.",
        ],
        gutZuWissen: "Steht in der Karte „Die Druckdaten sind noch nicht erzeugt“, wartet die Bestätigung des Kunden noch oder die Erzeugung ist fehlgeschlagen. Der Link zur Vorlage führt zur Version, mit der der Kunde ausgefüllt hat.",
        bilder: [{ name: "pers-auftrag", alt: "Auftragsseite mit dem Kennzeichen „Personalisierung“ und der Karte mit Vorlage, Version und Umfang" }],
        quiz: {
          frage: "Woran erkennen Sie einen Auftrag aus einer Vorlage?",
          antworten: [
            { text: "Am Kennzeichen „Personalisierung“ und der gleichnamigen Karte.", richtig: true },
            { text: "Am Kennzeichen „Per Link“." },
            { text: "An der Endung .xlsx im Auftragsnamen." },
          ],
          erklaerung: "„Per Link“ zeigt nur die Herkunft. Die Karte „Personalisierung“ nennt Vorlage, Version und Umfang.",
        },
        minuten: 3,
      },
      {
        slug: "personalisierung-haeufige-fehler",
        block: "Personalisierung",
        download: PDF_PERS_VORLAGE,
        titel: "Häufige Fehler und was Sie tun",
        kurz: "Text passt nicht, Feld im Beschnitt, Schrift fehlt, Virenscan ausstehend: die häufigsten Meldungen und die schnelle Lösung.",
        einleitung: "Die Prüfung meldet sich in einfachem Deutsch. Rote Meldungen sind Fehler, gelbe sind Hinweise. Hier steht, was Sie bei den häufigsten tun.",
        schritte: [
          "Der Text passt nicht („Bitte kürzen Sie ihn“): Ziehen Sie das Feld größer, verkleinern Sie die Schriftgröße oder schalten Sie „Automatisch verkleinern, bis es passt“ ein.",
          "Der Text wird verkleinert gedruckt: Das ist ein Hinweis, kein Fehler. Prüfen Sie nur, ob die Schrift noch gut lesbar ist.",
          "Ein Feld liegt im Beschnitt: Schieben Sie es in den Druckbereich, am besten hinter die blau gepunktete Linie. Was im rötlichen Bereich liegt, wird abgeschnitten.",
          "Die Schrift fehlt oder enthält ein Zeichen nicht: Laden Sie die Schrift unter „Schriften & Farben“ hoch oder wählen Sie eine andere Schrift.",
          "Virenscan ausstehend („Die Datei wird noch auf Viren geprüft“): Arbeiten Sie weiter. Veröffentlichen können Sie, sobald die Prüfung durch ist, meist nach wenigen Minuten. Bei Schriften steht „Virenprüfung läuft“.",
          "„Noch zu erledigen“ im Schritt „Freigabe“: Das Veröffentlichen ist gesperrt, bis die genannten Punkte erledigt sind, zum Beispiel ein fehlendes Design oder ein fehlendes Feld.",
          "Ein Kunde meldet „Dieser Link ist nicht (mehr) gültig“: Der Link wurde widerrufen oder ist abgelaufen. Erzeugen Sie im Schritt „Freigabe“ einen neuen.",
        ],
        gutZuWissen: "Fehler (rot) blockieren das Absenden für Kunden, Hinweise (gelb) nicht. Prüfen Sie Ihre Vorlage deshalb vor dem Veröffentlichen mit „Mit Beispieldaten anzeigen“ und mit besonders langen Namen.",
        quiz: {
          frage: "Ein Name wird verkleinert gedruckt. Ist das ein Fehler?",
          antworten: [
            { text: "Nein, es ist ein Hinweis. Sie prüfen, ob die Schrift noch lesbar ist.", richtig: true },
            { text: "Ja, der Auftrag kann so nicht gedruckt werden." },
            { text: "Ja, der Kunde muss einen kürzeren Namen angeben." },
          ],
          erklaerung: "Verkleinern ist gewollt, wenn Sie „Automatisch verkleinern, bis es passt“ eingeschaltet haben. Erst wenn die Mindestgröße unterschritten wird, meldet die Prüfung einen Fehler.",
        },
        minuten: 4,
      },
      // ---------- Kalkulation ----------
      {
        slug: "ad-hoc-kalkulieren",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "Ad-hoc kalkulieren",
        kurz: "Artikel wählen, Fragen beantworten, Auflagen eintragen und sofort einen unverbindlichen Richtpreis sehen.",
        einleitung:
          "Ein Kunde ruft an und fragt, was 500 Flyer kosten Mit der Kalkulation haben Sie in einer Minute einen Richtpreis. Er ist unverbindlich und rechnet mit den Stammdaten der Druckerei.",
        schritte: [
          "Klicken Sie in „Aufträge“ oben auf „Kalkulation“.",
          "Wählen Sie unter „1 · Was soll kalkuliert werden?“ einen „Artikel“. Danach erscheinen seine Fragen.",
          "Beantworten Sie die Fragen, zum Beispiel Format, Papier und Farbigkeit. Die erste Antwort ist schon eingestellt. Bei einem freien Format tragen Sie Breite × Höhe in Millimetern ein.",
          "Tragen Sie unter „2 · Wie viele?“ bis zu sechs Auflagen ein. „+ Auflage“ fügt eine hinzu.",
          "Klicken Sie auf „Richtpreis berechnen“. Das Ergebnis steht unter „3 · Ergebnis“: Kosten, Richtpreis netto, Spanne, brutto, je Stück und je 1.000.",
        ],
        gutZuWissen: "Der Preis ist unverbindlich. Steht in der Tabelle „Preis auf Anfrage“, lässt sich für diese Auflage kein Preis ausrechnen. Der rote Kasten nennt den Grund, meist fehlt eine Angabe in den Stammdaten.",
        bilder: [
          { name: "kalk-rechner", alt: "Seite „Kalkulation“ mit gewähltem Artikel Flyer, den Fragen und drei Auflagen" },
          { name: "kalk-ergebnis", alt: "Ergebnistabelle mit Kosten, Richtpreis netto, Spanne und Preis je Stück für drei Auflagen" },
        ],
        quiz: {
          frage: "In der Tabelle steht „Preis auf Anfrage“. Was bedeutet das?",
          antworten: [
            { text: "Für diese Auflage lässt sich kein Preis ausrechnen, meist fehlt eine Angabe in den Stammdaten.", richtig: true },
            { text: "Der Kunde muss den Preis selbst anfragen." },
            { text: "Der Preis ist besonders günstig." },
          ],
          erklaerung: "Der rote Kasten über der Tabelle nennt die Gründe. Prüfen Sie dann die Stammdaten.",
        },
        ausprobieren: { href: "/staff/kalkulation?tour=start", label: "Kalkulation mit Tour öffnen" },
        minuten: 4,
      },
      {
        slug: "rechenweg-lesen",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "Rechenweg lesen",
        kurz: "Nachvollziehen, wie der Preis entsteht: Positionen, Kosten, Zuschläge, Mindestpreis, Rundung und Mehrwertsteuer.",
        einleitung: "Wenn ein Preis überrascht, hilft der Rechenweg. Er zeigt jede Position und jeden Aufschlag, damit Sie dem Kunden den Preis erklären können.",
        schritte: [
          "Klicken Sie unter dem Ergebnis auf „Rechenweg anzeigen“.",
          "Lesen Sie je Auflage die Tabelle: „Position“, „Menge“, „Zeit“, „Kosten“ und „Wie gerechnet“. Das sind Material, Maschinenzeit und Arbeitsschritte.",
          "Darunter steht die Rechnung: „Kosten der Kalkulation“, dann Gemeinkosten und Gewinn als Aufschlag, die „Zwischensumme“, „nach Mindestpreis“ und „nach Rundung = Richtpreis netto“.",
          "Am Ende stehen die Mehrwertsteuer und der Bruttopreis.",
          "Achten Sie auf Auffälliges: „Ohne Kosten“ nennt Positionen, für die kein Preis hinterlegt ist. „mit Zuschuss“ zeigt Mehrmengen für Einrichten und Ausschuss.",
        ],
        gutZuWissen: "Die Kosten bestehen nur aus Material, Maschinen und Zukauf, ohne Zuschläge. Erst die Preis-Einstellungen machen daraus den Richtpreis.",
        bilder: [{ name: "kalk-rechenweg", alt: "Aufgeklappter „Rechenweg anzeigen“ mit Positionen, Kosten und der Rechnung bis zum Richtpreis" }],
        quiz: {
          frage: "Wo sehen Sie, welcher Aufschlag auf die Kosten gerechnet wurde?",
          antworten: [
            { text: "Im Rechenweg bei „Gemeinkosten/Vertrieb“ und „Gewinn“.", richtig: true },
            { text: "In der Spalte „Zeit“." },
            { text: "Gar nicht, die Aufschläge sind geheim." },
          ],
          erklaerung: "Die Prozentwerte stehen in den Preis-Einstellungen und werden im Rechenweg ausgewiesen.",
        },
        minuten: 3,
      },
      {
        slug: "stammdaten-pflegen",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "Stammdaten pflegen (Werkbank)",
        kurz: "Die Grundlage der Kalkulation: wo Material, Preise, Maschinen und Artikel liegen, wie Sie sichern und einspielen.",
        einleitung:
          "Der Richtpreis ist nur so gut wie die Stammdaten. Das Pflegen ist ein Fachthema: Hier lernen Sie die Grundlagen, die Einzelheiten besprechen Sie mit der zuständigen Person.",
        schritte: [
          "Klicken Sie in der Kalkulation auf „Stammdaten“.",
          "Unter „Aktueller Stand“ sehen Sie, was gespeichert ist (Material, Produktion, Artikel) und wer es zuletzt geändert hat.",
          "„Werkbank öffnen“ öffnet die Werkbank in einem neuen Tab. Dort pflegen Sie Material, Preise, Maschinen, Arbeitsschritte und Artikel.",
          "Machen Sie vor größeren Änderungen eine Sicherung: „Sicherung herunterladen“.",
          "Eine Sicherung spielen Sie unter „Sicherung einspielen“ zurück: Datei wählen, die Vorschau lesen und „Sicherung übernehmen“ bestätigen.",
        ],
        gutZuWissen: "Falsche Stammdaten führen zu falschen Preisen: Pflegen Sie sie nur nach Absprache. Der bisherige Stand bleibt im Verlauf erhalten. Wenn Sie sich unten im Staff-Bereich mit „Abmelden“ abmelden, werden die lokalen Werkbank-Daten in Ihrem Browser gelöscht.",
        bilder: [{ name: "kalk-stammdaten", alt: "Seite „Stammdaten“ mit „Werkbank öffnen“, „Aktueller Stand“ und „Sicherung einspielen“" }],
        quiz: {
          frage: "Was tun Sie vor einer größeren Änderung an den Stammdaten?",
          antworten: [
            { text: "Eine Sicherung herunterladen.", richtig: true },
            { text: "Den Schalter „Richtpreis für Kunden anzeigen“ einschalten." },
            { text: "Nichts, die Werkbank sichert nicht." },
          ],
          erklaerung: "Mit der Sicherung können Sie jederzeit zum alten Stand zurück.",
        },
        ausprobieren: { href: "/staff/kalkulation/stammdaten?tour=start", label: "Stammdaten mit Tour öffnen" },
        minuten: 3,
      },
      {
        slug: "preis-einstellungen-und-richtpreis-fuer-kunden",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "Preis-Einstellungen & Richtpreis für Kunden",
        kurz: "Zuschläge, Mindestpreis und Rundung festlegen, Produkte den Artikeln zuordnen und den Richtpreis für Kunden einschalten.",
        einleitung:
          "Die Kalkulation liefert nur Kosten. Unter „Preis-Einstellungen“ legen Sie fest, was daraufkommt. Außerdem entscheiden Sie dort, ob Besucher einen ungefähren Preis sehen.",
        schritte: [
          "Klicken Sie in der Kalkulation auf „Preis-Einstellungen“.",
          "Stellen Sie die Aufschläge ein: „Gemeinkosten / Vertrieb“, „Gewinn“, „Mindestpreis je Auftrag (netto)“ und „Mehrwertsteuer“. Mit „Spanne nach unten“ und „Spanne nach oben“ legen Sie die Spanne um den Richtpreis fest, mit „Runden auf“ und „Rundungsart“ die Rundung.",
          "Die „Beispielrechnung“ ändert sich beim Tippen mit. Klicken Sie auf „Speichern“, wenn alles passt.",
          "Weiter unten: „Richtpreis für Kunden anzeigen“. Der Schalter ist ab Werk aus.",
          "Ordnen Sie unter „Zu welchem Produkt gehört welcher Artikel?“ jedem Artikel die Produkte zu, bei denen er rechnen soll. Zur Wahl stehen nur Artikel, die für den Shop freigegeben sind.",
          "Schalten Sie den Richtpreis erst ein, wenn die Stammdaten geprüft sind, und klicken Sie auf „Speichern“.",
        ],
        details: [
          {
            titel: "Warum erst nach echten Stammdaten einschalten?",
            punkte: [
              "Besucher sehen den Preis sofort und ohne dass ihn jemand kontrolliert hat.",
              "Ein genannter Preis weckt Erwartungen. Ein zu niedriger Preis lässt sich schwer korrigieren.",
              "Spielen Sie vorher eine Probe-Anfrage unter „Anfrage ohne Kundenkonto“ selbst durch.",
              "Ausschalten geht jederzeit: Haken entfernen, „Speichern“. Dann sehen Besucher wieder keinen Preis.",
            ],
          },
        ],
        gutZuWissen: "Änderungen gelten sofort für neue Berechnungen. Richtpreise, die schon zu Anfragen gespeichert sind, behalten ihre damaligen Werte. Ohne Zuordnung erscheint für ein Produkt kein Preis.",
        bilder: [
          { name: "kalk-einstellungen", alt: "Seite „Preis-Einstellungen“ mit den Zuschlägen, der Beispielrechnung und der Karte „Richtpreis für Kunden anzeigen“" },
          { name: "kalk-kunden-richtpreis", alt: "Karte „Richtpreis für Kunden anzeigen“ mit Schalter und Zuordnung von Produkten zu Artikeln" },
        ],
        quiz: {
          frage: "Der Schalter „Richtpreis für Kunden anzeigen“ ist aus. Was sehen Besucher in der Anfrage?",
          antworten: [
            { text: "Keinen Preis. Die Anfrage funktioniert wie bisher.", richtig: true },
            { text: "Einen Preis mit dem Hinweis „nicht geprüft“." },
            { text: "Eine Fehlermeldung." },
          ],
          erklaerung: "Aus heißt: nichts ändert sich für die Besucher. Deshalb ist der Schalter ab Werk aus.",
        },
        ausprobieren: { href: "/staff/kalkulation/einstellungen?tour=start", label: "Preis-Einstellungen mit Tour öffnen" },
        minuten: 5,
      },
      {
        slug: "richtpreis-an-anfrage",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "Richtpreis an einer Anfrage",
        kurz: "Was Besucher in der Anfrage sehen, wie der Server beim Bestätigen neu rechnet und wo Sie den Preis in der Anfrage finden.",
        einleitung:
          "Ist der Richtpreis für Kunden eingeschaltet, können Besucher in der Anfrage einen ungefähren Preis ansehen. Der Preis geht dann mit der Anfrage zu Ihnen, als Orientierung und nie als Angebot.",
        schritte: [
          "Besucher sehen in der Anfrage den Knopf „Ungefähren Preis anzeigen“, wenn dem Produkt ein Artikel zugeordnet ist.",
          "Beim Bestätigen der Anfrage rechnet der Server den Preis neu, mit den aktuellen Stammdaten und Preis-Einstellungen. Zahlen aus dem Browser des Kunden werden nie übernommen.",
          "Öffnen Sie die Anfrage im Staff-Bereich. Die Karte „Richtpreis (unverbindlich)“ zeigt Artikel, Zeitpunkt und die Tabelle.",
          "Das Kennzeichen „vom Kunden angezeigt“ sagt, dass der Kunde diesen Preis gesehen hat. „Rechenweg anzeigen“ erklärt ihn.",
          "Nennen Sie dem Kunden den verbindlichen Preis im Angebot. Der Richtpreis ist nur ein Anhaltspunkt.",
        ],
        gutZuWissen: "Weil der Server beim Bestätigen neu rechnet, kann der gespeicherte Preis vom angezeigten abweichen, wenn Sie dazwischen die Stammdaten oder Einstellungen geändert haben. Der gespeicherte Preis ist der aktuelle.",
        bilder: [{ name: "kalk-auftrag-richtpreis", alt: "Karte „Richtpreis (unverbindlich)“ auf der Auftragsseite mit Tabelle und dem Kennzeichen „vom Kunden angezeigt“" }],
        quiz: {
          frage: "Woher kommt der Preis, der an der Anfrage gespeichert wird?",
          antworten: [
            { text: "Der Server rechnet beim Bestätigen neu.", richtig: true },
            { text: "Er wird aus dem Browser des Kunden übernommen." },
            { text: "Ein Mitarbeiter trägt ihn von Hand ein." },
          ],
          erklaerung: "So kann kein Kunde einen falschen Preis mitschicken.",
        },
        minuten: 3,
      },
      {
        slug: "api-schluessel",
        block: "Kalkulation und Richtpreis",
        download: PDF_KALKULATION,
        titel: "API-Schlüssel für die Kalkulation",
        kurz: "Kurz: Wie die Administration einen Schlüssel anlegt, damit ein anderes System Richtpreise abrufen kann.",
        einleitung: "Das ist ein Thema für die Administration. Sie brauchen es nur, wenn ein anderes System, zum Beispiel ein Shop, Richtpreise per Schnittstelle abrufen soll.",
        schritte: [
          "Klären Sie den Bedarf: Für die tägliche Arbeit im Staff-Bereich brauchen Sie keinen Schlüssel.",
          "Bitten Sie die Administration, einen Schlüssel per Skript anzulegen (Beispiel unten).",
          "Der Schlüssel beginnt mit kal_ und wird nur ein einziges Mal angezeigt. Bewahren Sie ihn im Passwort-Manager auf, nicht in E-Mails.",
          "Das andere System schickt ihn bei jedem Aufruf im Kopf „Authorization: Bearer kal_…“ mit. Die Adressen stehen unter /api/docs.",
          "Nicht mehr gebraucht? Die Administration sperrt den Schlüssel mit dem Befehl „revoke“.",
        ],
        gutZuWissen: "Ein Schlüssel darf rechnen und lesen, aber nie Stammdaten ändern. Gespeichert wird nur eine Prüfsumme.",
        code: [
          {
            titel: "Schlüssel anlegen, auflisten, sperren (Administration)",
            sprache: "bash",
            inhalt: `node scripts/kalkulation-key.mjs create "Shop Website"
node scripts/kalkulation-key.mjs list
node scripts/kalkulation-key.mjs revoke kal_ab12cd34`,
          },
        ],
        minuten: 2,
      },
    ],
};
