/**
 * Texte der geführten Touren (Coachmarks). Jede Seite hat höchstens eine Tour.
 * Ein Schritt zeigt auf ein Element mit `data-tour="<ziel>"`. Fehlt das Element, erscheint der Schritt
 * ohne Hervorhebung in der Mitte – außer er ist `optional`, dann fällt er weg.
 * Beschriftungen exakt wie in der App in „…“. Wesentliche Änderung → Version in storage.ts erhöhen.
 */

export type OeffentlicheTourId = "upload" | "auftrag" | "ausfuellen";

/**
 * Touren, die zum Mitarbeiter-Kurs gehören (Staff-Bereich, Personalisierung-Vorlagen, Kalkulation). Ihre Texte stehen NICHT
 * in diesem Modul — es landet im Browser-Bundle aller Seiten —, sondern in touren-mitarbeiter.ts und werden nur mit
 * Staff-Sitzung über /api/staff/hilfe/tour/<id> geladen (PageTour).
 */
export const MITARBEITER_TOUR_IDS = [
  "staff",
  "personalisierung",
  "vorlage-design",
  "vorlage-felder",
  "vorlage-bogen",
  "vorlage-freigabe",
  "kalkulation",
  "kalkulation-preise",
  "kalkulation-stammdaten",
] as const;
export type MitarbeiterTourId = (typeof MITARBEITER_TOUR_IDS)[number];

export function istMitarbeiterTour(id: TourId): id is MitarbeiterTourId {
  return (MITARBEITER_TOUR_IDS as readonly string[]).includes(id);
}

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

export const TOUREN_OEFFENTLICH: Record<OeffentlicheTourId, Tour> = {
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
};
