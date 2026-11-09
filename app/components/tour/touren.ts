/**
 * Texte der geführten Touren (Coachmarks). Jede Seite hat höchstens eine Tour.
 * Ein Schritt zeigt auf ein Element mit `data-tour="<ziel>"`. Fehlt das Element, erscheint der Schritt
 * ohne Hervorhebung in der Mitte – außer er ist `optional`, dann fällt er weg.
 * Beschriftungen exakt wie in der App in „…“. Wesentliche Änderung → Version in storage.ts erhöhen.
 */

export type TourId = "upload" | "auftrag" | "staff";

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
        ziel: "hilfe-menue",
        titel: "Hilfe",
        text: "Online-Schulung, Kurzanleitung als PDF und häufige Fragen.",
      },
      {
        ziel: "tour-knopf",
        titel: "Tour neu starten",
        text: "Hier starten Sie diese Tour jederzeit erneut.",
      },
    ],
  },
};
