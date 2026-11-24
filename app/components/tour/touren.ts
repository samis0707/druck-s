/**
 * Texte der geführten Touren (Coachmarks). Jede Seite hat höchstens eine Tour.
 * Ein Schritt zeigt auf ein Element mit `data-tour="<ziel>"`. Fehlt das Element, erscheint der Schritt
 * ohne Hervorhebung in der Mitte – außer er ist `optional`, dann fällt er weg.
 * Beschriftungen exakt wie in der App in „…“. Wesentliche Änderung → Version in storage.ts erhöhen.
 */

export type TourId =
  | "upload"
  | "auftrag"
  | "staff"
  | "personalisierung"
  | "vorlage-design"
  | "vorlage-felder"
  | "vorlage-bogen"
  | "vorlage-freigabe"
  | "ausfuellen"
  | "kalkulation"
  | "kalkulation-preise"
  | "kalkulation-stammdaten";

export type TourSchritt = {
  /** Wert von `data-tour` am hervorgehobenen Element */
  ziel?: string;
  /** CSS-Selektor, falls das Element kein `data-tour` hat */
  selektor?: string;
  /** Schritt weglassen, wenn das Element fehlt */
  optional?: boolean;
  titel: string;
  text: string;
  link?: { href: string; label: string };
};

export type Tour = {
  id: TourId;
  /** Text der Einladung (Toast) */
  einladung: string;
  schritte: TourSchritt[];
};

/** Der Knopf „Tour starten“ selbst – Ziel des letzten Schritts */
export const TOUR_KNOPF = "tour-knopf";

const EINLADUNG = "Neu hier? Eine kurze Tour zeigt Ihnen die wichtigsten Schritte.";

export const TOUREN: Record<TourId, Tour> = {
  upload: {
    id: "upload",
    einladung: EINLADUNG,
    schritte: [
      {
        ziel: "fb-dateien",
        titel: "1. Dateien hochladen",
        text: "Ziehen Sie Ihre Dateien hierher oder klicken Sie, um sie auszuwählen. Mehrere Dateien sind möglich, je bis 100 MB. Dann „Weiter“.",
      },
      {
        ziel: "fb-anfrage",
        titel: "2. Ihre Anfrage",
        text: "Beschreiben Sie in eigenen Worten, was gedruckt werden soll: Menge, Format, Papier, Wunschtermin.",
      },
      {
        ziel: "fb-produkt",
        titel: "3. Mögliches Produkt",
        text: "Wählen Sie das passende Produkt. Passt keins, nehmen Sie „Sonstiges“.",
      },
      {
        ziel: "fb-referenz",
        titel: "4. Referenz und Senden",
        text: "Optional: „wie letztes Mal“ oder eine Auftragsnummer. Mit „Anfrage senden“ geht es zur Bestätigung per E-Mail-Code.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Die ausführliche Anleitung finden Sie in der Hilfe.",
        link: { href: "/hilfe/kunden/druckdaten-hochladen", label: "Lektion „Druckdaten hochladen“" },
      },
    ],
  },
  auftrag: {
    id: "auftrag",
    einladung: "Neu hier? Die Tour erklärt Ihnen Ihre Auftragsseite in drei Schritten.",
    schritte: [
      {
        ziel: "auftrag-status",
        titel: "Wo steht mein Auftrag?",
        text: "Der aktuelle Status, z. B. „In Prüfung“ oder „Wartet auf Ihre Freigabe“.",
      },
      {
        ziel: "auftrag-stufen",
        titel: "Fünf Stufen",
        text: "Von „Eingang“ bis „Versand“. Die aktuelle Stufe ist aufgeklappt, erledigte zeigen eine Kurzfassung. Unter „Prüfung“ steht die automatische Vorprüfung.",
      },
      {
        ziel: "tour-knopf",
        titel: "Freigabe und Hilfe",
        text: "Sobald die Auftragsbestätigung da ist, geben Sie unter „Ihre Freigabe“ mit einem Code frei. Mehr dazu in der Hilfe.",
        link: { href: "/hilfe/kunden/auftrag-freigeben", label: "Lektion „Auftrag freigeben“" },
      },
    ],
  },
  staff: {
    id: "staff",
    einladung: "Neu im Staff-Bereich? Eine kurze Tour zeigt die wichtigsten Werkzeuge.",
    schritte: [
      {
        ziel: "staff-filter",
        titel: "Suchen, sortieren, filtern",
        text: "Suche nach Nummer, Text oder E-Mail. „Dringendste zuerst“ sortiert nach Befunden; „Nur: braucht Blick“ zeigt nur Auffälliges.",
      },
      {
        ziel: "staff-ansicht",
        titel: "Zwei Ansichten",
        text: "„Liste + Details“ für die Warteschlange, „Assets“ für alle Dateien auf einen Blick.",
      },
      {
        ziel: "staff-liste",
        optional: true,
        titel: "Die Warteschlange",
        text: "Auftrag anklicken oder mit j/k wählen; rechts erscheinen die Details. Leertaste öffnet die Vorschau, Esc schließt.",
      },
      {
        ziel: "staff-verwaltung",
        titel: "Kunden und Einstellungen",
        text: "„Kunden & Links“: freischalten, Einmal-Links, Historie. „Einstellungen“: den automatischen Hinweis steuern.",
      },
      {
        ziel: "staff-personalisierung",
        titel: "Personalisierung",
        text: "Unter „Personalisierung“ legen Sie Vorlagen für Visitenkarten, Namensschilder und andere Drucksachen mit individuellen Daten an. Kunden füllen sie ohne Konto aus.",
        link: { href: "/hilfe/druckerei/was-ist-eine-vorlage", label: "Lektion „Was ist eine Vorlage?“" },
      },
      {
        ziel: "staff-kalkulation",
        titel: "Kalkulation",
        text: "Unter „Kalkulation“ rechnen Sie einen unverbindlichen Richtpreis aus, pflegen die Stammdaten und stellen die Preis-Einstellungen ein.",
        link: { href: "/hilfe/druckerei/ad-hoc-kalkulieren", label: "Lektion „Ad-hoc kalkulieren“" },
      },
      {
        ziel: "hilfe-menue",
        titel: "Hilfe",
        text: "Online-Schulung, Kurzanleitungen als PDF und häufige Fragen.",
      },
      {
        ziel: "tour-knopf",
        titel: "Tour neu starten",
        text: "Hier starten Sie diese Tour jederzeit erneut.",
      },
    ],
  },
  personalisierung: {
    id: "personalisierung",
    einladung: "Neu bei der Personalisierung? Die Tour zeigt Ihnen die Übersicht in fünf Schritten.",
    schritte: [
      {
        ziel: "pers-neu",
        titel: "Neue Vorlage",
        text: "Hier legen Sie eine neue Vorlage an. Ein Assistent führt Sie in vier Schritten: Design, Felder, Druckbogen, Freigabe.",
        link: { href: "/hilfe/druckerei/neue-vorlage-in-4-schritten", label: "Lektion „Neue Vorlage in 4 Schritten“" },
      },
      {
        ziel: "pers-bibliothek",
        titel: "Schriften und Farben",
        text: "Unter „Schriften & Farben“ pflegen Sie, welche Schriften und Farben in Vorlagen zur Auswahl stehen.",
      },
      {
        ziel: "pers-suche",
        titel: "Vorlage suchen",
        text: "Suchen Sie nach dem Namen. Mit „Archivierte anzeigen“ sehen Sie auch Vorlagen, die Sie weggelegt haben.",
      },
      {
        ziel: "pers-karte",
        optional: true,
        titel: "Jede Vorlage ist eine Karte",
        text: "Die Karte zeigt die Vorderseite, den Namen und den Zustand: „Entwurf“ sieht nur Ihr Team, „Aktiv“ ist veröffentlicht.",
      },
      {
        ziel: "pers-karte-aktionen",
        optional: true,
        titel: "Was Sie mit einer Vorlage tun können",
        text: "„Bearbeiten“ öffnet den Assistenten. „Link kopieren“ gibt den Link für Kunden, „Für Kunden ausfüllen“ füllt sie in deren Namen aus. „Archivieren“ legt die Vorlage weg.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Die ausführliche Anleitung finden Sie in der Hilfe.",
        link: { href: "/hilfe/druckerei/was-ist-eine-vorlage", label: "Lektion „Was ist eine Vorlage?“" },
      },
    ],
  },
  "vorlage-design": {
    id: "vorlage-design",
    einladung: "Neue Vorlage? Die Tour erklärt Schritt 1, „Design“.",
    schritte: [
      {
        ziel: "pers-schritte",
        titel: "Vier Schritte",
        text: "Design, Felder, Druckbogen, Freigabe: Der Assistent führt Sie der Reihe nach. Fertige Schritte können Sie jederzeit wieder öffnen.",
      },
      {
        ziel: "pers-name",
        titel: "Name der Vorlage",
        text: "So heißt die Vorlage für Sie und Ihre Kunden, zum Beispiel „Visitenkarte Außendienst“.",
      },
      {
        ziel: "pers-upload",
        titel: "Design-PDF hochladen",
        text: "Ziehen Sie das fertige Design als PDF hierher oder klicken Sie auf „PDF auswählen“. Ein PDF mit Vorder- und Rückseite ist möglich.",
      },
      {
        ziel: "pers-format",
        optional: true,
        titel: "Format prüfen",
        text: "Das Endformat und der Beschnitt werden aus dem PDF erkannt. Stimmt etwas nicht, ändern Sie die Werte hier.",
      },
      {
        ziel: "pers-seiten",
        optional: true,
        titel: "Vorder- und Rückseite",
        text: "Klicken Sie unter der Seite auf „Vorderseite“ oder „Rückseite“. Eine Rückseite ist freiwillig.",
      },
      {
        ziel: "pers-autospeichern",
        optional: true,
        titel: "Es wird automatisch gespeichert",
        text: "Sie müssen nichts speichern. Hier sehen Sie, wann der Entwurf zuletzt gesichert wurde.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Eine Lektion erklärt alle vier Schritte.",
        link: { href: "/hilfe/druckerei/neue-vorlage-in-4-schritten", label: "Lektion „Neue Vorlage in 4 Schritten“" },
      },
    ],
  },
  "vorlage-felder": {
    id: "vorlage-felder",
    einladung: "Zum ersten Mal im Editor? Die Tour zeigt Schritt 2, „Felder“.",
    schritte: [
      {
        ziel: "pers-feld-hinzufuegen",
        titel: "Feld hinzufügen",
        text: "Ein Klick legt ein Feld in die Mitte der Karte: Text, Mehrzeiliger Text, QR-Code, vCard-QR oder Barcode.",
      },
      {
        ziel: "pers-flaeche",
        titel: "Die Arbeitsfläche",
        text: "Ziehen Sie ein Feld an die richtige Stelle. Die Griffe am Rand ändern die Größe. Mit den Pfeiltasten verschieben Sie es genau.",
      },
      {
        ziel: "pers-rueckgaengig",
        titel: "Rückgängig",
        text: "Falsch geklickt? „Rückgängig“ (Strg+Z) nimmt den letzten Schritt zurück, auch ein gelöschtes Feld.",
      },
      {
        ziel: "pers-beispiel",
        titel: "Mit Beispieldaten anzeigen",
        text: "Zeigt die Karte so, wie sie mit echten Namen aussieht. Prüfen Sie damit, ob lange Texte passen.",
      },
      {
        ziel: "pers-ebenen",
        optional: true,
        titel: "Felder und Eingaben",
        text: "Die Liste zeigt alle Felder. Unter „Eingaben“ stehen die Angaben, die Kunden später ausfüllen.",
      },
      {
        ziel: "pers-eigenschaften",
        optional: true,
        titel: "Eigenschaften des Felds",
        text: "Hier stellen Sie Schrift, Größe, Farbe und Ausrichtung ein. Mit „Eingabe einfügen“ setzen Sie einen Platzhalter in den Text.",
      },
      {
        ziel: "pers-pruefung",
        optional: true,
        titel: "Prüfung",
        text: "Solange kein Feld gewählt ist, zeigt dieser Bereich Hinweise, zum Beispiel wenn ein Feld im Beschnitt liegt.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Die Lektion zum Editor erklärt jeden Handgriff.",
        link: { href: "/hilfe/druckerei/felder-im-editor", label: "Lektion „Felder im Editor“" },
      },
    ],
  },
  "vorlage-bogen": {
    id: "vorlage-bogen",
    einladung: "Schritt 3, „Druckbogen“: Eine kurze Tour erklärt die Möglichkeiten.",
    schritte: [
      {
        ziel: "pers-ausgabeart",
        titel: "Wie sollen die Druckdaten aussehen?",
        text: "„Einzelseiten mit Beschnitt (Standard)“ ist der sichere Normalfall. „Ausgeschossen auf Druckbögen“ ordnet die Karten selbst auf dem Bogen an.",
      },
      {
        ziel: "pers-nutzen",
        optional: true,
        titel: "Nutzen pro Bogen",
        text: "Hier steht, wie viele Karten auf einen Bogen passen.",
      },
      {
        ziel: "pers-skizze",
        optional: true,
        titel: "Skizze des Bogens",
        text: "Die Skizze zeigt, wie die Karten auf dem Bogen liegen.",
      },
      {
        ziel: "pers-ueberlagerung",
        optional: true,
        titel: "Stanzkontur",
        text: "Optional legen Sie ein PDF mit Stanzkontur oder Schnittmarken über jeden Bogen.",
      },
      {
        ziel: "pers-weiter",
        titel: "Weiter zur Freigabe",
        text: "Wenn Sie unsicher sind, lassen Sie „Einzelseiten mit Beschnitt (Standard)“ stehen und gehen Sie weiter.",
      },
    ],
  },
  "vorlage-freigabe": {
    id: "vorlage-freigabe",
    einladung: "Letzter Schritt, „Freigabe“: Eine kurze Tour zeigt, wie die Vorlage zu den Kunden kommt.",
    schritte: [
      {
        ziel: "pers-sichtbarkeit",
        titel: "Wer darf die Vorlage nutzen?",
        text: "„Nur Mitarbeiter“, „Bestimmte Kunden“ oder „Öffentlich per Link“. Wählen Sie, wer die Vorlage sehen darf.",
      },
      {
        ziel: "pers-kunden",
        optional: true,
        titel: "Kunden auswählen",
        text: "Bei „Bestimmte Kunden“ haken Sie hier die Kunden an. Sie sehen die Vorlage nach der Anmeldung unter „Meine Vorlagen“.",
      },
      {
        ziel: "pers-links",
        optional: true,
        titel: "Links für Kunden ohne Konto",
        text: "Bei „Öffentlich per Link“ erzeugen Sie hier einen Link. Er wird nur einmal angezeigt; kopieren Sie ihn gleich.",
      },
      {
        ziel: "pers-probleme",
        optional: true,
        titel: "Noch zu erledigen",
        text: "Solange hier etwas steht, lässt sich die Vorlage nicht veröffentlichen. Erledigen Sie die Punkte.",
      },
      {
        ziel: "pers-veroeffentlichen",
        titel: "Veröffentlichen",
        text: "Erst mit „Veröffentlichen“ ist die Vorlage für Kunden erreichbar. Davor sehen nur Sie sie.",
      },
    ],
  },
  ausfuellen: {
    id: "ausfuellen",
    einladung: "Neu hier? Die Tour zeigt Ihnen in wenigen Schritten, wie Sie Ihre Daten eintragen und absenden.",
    schritte: [
      {
        ziel: "pers-anleitung",
        titel: "Drei Schritte",
        text: "Daten eingeben, prüfen, absenden. Rechts sehen Sie sofort, wie es gedruckt aussieht.",
      },
      {
        ziel: "pers-beispielvorschau",
        optional: true,
        titel: "Beispiel ansehen",
        text: "Hier sehen Sie ein Beispiel der fertigen Drucksache.",
      },
      {
        ziel: "pers-kundenwahl",
        optional: true,
        titel: "Für welchen Kunden?",
        text: "Nur für Mitarbeiter: Wählen Sie den Kunden, in dessen Namen Sie ausfüllen. Ein Bestätigungscode ist dann nicht nötig.",
      },
      {
        ziel: "pers-reiter",
        titel: "Einzeln oder als Tabelle",
        text: "„Einzeln eingeben“ ist gut für wenige Einträge. Für viele Einträge laden Sie eine Tabelle hoch.",
      },
      {
        ziel: "pers-formular",
        optional: true,
        titel: "Felder ausfüllen",
        text: "Tragen Sie die Angaben ein. Pflichtangaben sind mit einem Stern markiert.",
      },
      {
        ziel: "pers-weitere",
        optional: true,
        titel: "Weitere Einträge",
        text: "Mit „+ Weitere hinzufügen“ legen Sie einen weiteren Eintrag an, zum Beispiel für die nächste Person.",
      },
      {
        ziel: "pers-k-schritte",
        titel: "Prüfen und Absenden",
        text: "Danach folgen „Prüfen“ und „Absenden“. Die Prüfung zeigt, ob alles druckbar ist. Zum Schluss bestätigen Sie mit einem Code aus der E-Mail.",
      },
      {
        ziel: "pers-datenschutz",
        optional: true,
        titel: "Datenschutz",
        text: "Ihre Eingaben werden zwischengespeichert und nach 24 Stunden ohne Änderung gelöscht. Sie können sie auch sofort löschen.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Die ausführliche Anleitung finden Sie in der Hilfe.",
        link: { href: "/hilfe/kunden/personalisierte-drucksachen-ausfuellen", label: "Lektion „Personalisierte Drucksachen ausfüllen“" },
      },
    ],
  },
  kalkulation: {
    id: "kalkulation",
    einladung: "Neu bei der Kalkulation? Die Tour zeigt Ihnen, wie Sie einen Richtpreis ausrechnen.",
    schritte: [
      {
        ziel: "kalkulation-nav",
        titel: "Drei Bereiche",
        text: "„Kalkulation“ rechnet einen Preis aus. „Stammdaten“ ist die Grundlage (Material, Maschinen, Artikel). „Preis-Einstellungen“ legt fest, was auf die Kosten aufgeschlagen wird.",
      },
      {
        ziel: "kalkulation-artikel",
        titel: "1. Artikel wählen",
        text: "Wählen Sie den Artikel, den Sie kalkulieren wollen, zum Beispiel einen Flyer.",
      },
      {
        ziel: "kalkulation-fragen",
        titel: "Fragen beantworten",
        text: "Nach der Wahl erscheinen die Fragen des Artikels: Format, Papier, Veredelung. Die erste Antwort ist schon eingestellt.",
      },
      {
        ziel: "kalkulation-auflagen",
        titel: "2. Wie viele?",
        text: "Tragen Sie bis zu sechs Auflagen ein. So sehen Sie, wie der Stückpreis mit der Menge sinkt.",
      },
      {
        ziel: "kalkulation-berechnen",
        titel: "Richtpreis berechnen",
        text: "Ein Klick auf „Richtpreis berechnen“ zeigt das Ergebnis.",
      },
      {
        ziel: "kalkulation-ergebnis",
        titel: "3. Ergebnis",
        text: "Die Tabelle zeigt Kosten, Richtpreis und Spanne je Auflage. Der Preis ist immer unverbindlich. Steht dort „Preis auf Anfrage“, fehlt eine Angabe.",
      },
      {
        ziel: "kalkulation-rechenweg",
        titel: "Rechenweg",
        text: "Mit „Rechenweg anzeigen“ sehen Sie, wie der Preis entsteht: Position für Position, dann Zuschläge, Mindestpreis und Rundung.",
        link: { href: "/hilfe/druckerei/rechenweg-lesen", label: "Lektion „Rechenweg lesen“" },
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu. Die ausführliche Anleitung finden Sie in der Hilfe.",
        link: { href: "/hilfe/druckerei/ad-hoc-kalkulieren", label: "Lektion „Ad-hoc kalkulieren“" },
      },
    ],
  },
  "kalkulation-preise": {
    id: "kalkulation-preise",
    einladung: "Neu bei den Preis-Einstellungen? Die Tour erklärt, was hier wirkt.",
    schritte: [
      {
        ziel: "kalkulation-einstellungen",
        titel: "Vom Kostenwert zum Richtpreis",
        text: "Die Kalkulation liefert nur Kosten. Hier legen Sie fest, was daraufkommt: Gemeinkosten, Gewinn, Mindestpreis, Rundung, Spanne und Mehrwertsteuer.",
      },
      {
        ziel: "kalkulation-beispiel",
        titel: "Beispielrechnung",
        text: "Die Beispielrechnung ändert sich beim Tippen mit. So sehen Sie sofort, was eine Einstellung bewirkt.",
      },
      {
        ziel: "kalkulation-kunden-richtpreis",
        titel: "Richtpreis für Kunden anzeigen",
        text: "Der Schalter ist ab Werk aus. Schalten Sie ihn erst ein, wenn die Stammdaten stimmen. Darunter ordnen Sie jedem Produkt einen Artikel zu.",
        link: { href: "/hilfe/druckerei/preis-einstellungen-und-richtpreis-fuer-kunden", label: "Lektion „Preis-Einstellungen & Richtpreis für Kunden“" },
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu.",
      },
    ],
  },
  "kalkulation-stammdaten": {
    id: "kalkulation-stammdaten",
    einladung: "Neu bei den Stammdaten? Die Tour zeigt die drei wichtigsten Stellen.",
    schritte: [
      {
        ziel: "kalkulation-werkbank",
        titel: "Werkbank",
        text: "Material, Preise, Maschinen, Arbeitsschritte und Artikel pflegen Sie in der Werkbank. Sie öffnet in einem neuen Tab.",
      },
      {
        ziel: "kalkulation-sicherung-laden",
        titel: "Sicherung herunterladen",
        text: "Speichert den aktuellen Stand als Datei. Machen Sie das vor größeren Änderungen.",
      },
      {
        ziel: "kalkulation-import",
        titel: "Sicherung einspielen",
        text: "Hier spielen Sie eine Sicherung ein. Vorher sehen Sie, was sich ändert, und bestätigen es.",
      },
      {
        ziel: "tour-knopf",
        titel: "Hilfe jederzeit",
        text: "Hier starten Sie die Tour neu.",
        link: { href: "/hilfe/druckerei/stammdaten-pflegen", label: "Lektion „Stammdaten pflegen“" },
      },
    ],
  },
};
