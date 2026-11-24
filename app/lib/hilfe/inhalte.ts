/**
 * Hilfe & Schulung für dmp druckraum — einzige Quelle für:
 * - die Online-Schulung unter /hilfe (Kurse, Lektionen, Quiz, FAQ),
 * - die Markdown-Fassungen für KI-Assistenten (/llms.txt, /llms-full.txt, /hilfe/….md),
 * - die strukturierten Daten (JSON-LD: FAQPage, Course, HowTo).
 *
 * Regeln:
 * - Beschriftungen von Knöpfen, Feldern und Status stehen exakt wie in der App in „…“.
 *   Nach UI-Änderungen mit `grep` gegen den Code abgleichen (docs/schulung/README.md).
 * - Zahlen (Grenzen, Fristen) kommen aus FAKTEN, damit Hilfe und KI-Texte nie auseinanderlaufen.
 * - Bildnamen verweisen auf public/hilfe/img/<name>.webp; Maße stehen in lib/hilfe/bilder.ts.
 */

export type KursSlug = "kunden" | "druckerei" | "partner";

export interface LektionsBild {
  /** Dateiname ohne Endung in public/hilfe/img */
  name: string;
  /** Was ist zu sehen? (Screenreader, Suchmaschinen, Kontrolle beim Pflegen) */
  alt: string;
}

export interface QuizFrage {
  frage: string;
  antworten: { text: string; richtig?: boolean }[];
  /** Erklärung, die nach jeder Antwort erscheint */
  erklaerung: string;
}

export interface CodeBeispiel {
  titel: string;
  sprache: "bash" | "json" | "js" | "http";
  inhalt: string;
}

export interface Lektion {
  slug: string;
  titel: string;
  /** Ein Satz für Übersicht, Meta-Description und llms.txt (≤ 160 Zeichen) */
  kurz: string;
  /** Worum geht es? 1–2 Sätze */
  einleitung: string;
  /** 3–7 Schritte im Imperativ, Beschriftungen exakt in „…“ */
  schritte: string[];
  /** Der eine Hinweis, der Fehler verhindert */
  gutZuWissen?: string;
  /** Zusätzliche Absätze (z. B. Prüfkriterien), optional */
  details?: { titel: string; punkte: string[] }[];
  bilder?: LektionsBild[];
  code?: CodeBeispiel[];
  quiz?: QuizFrage;
  /** Echter Pfad in der App zum Ausprobieren */
  ausprobieren?: { href: string; label: string };
  /** Geschätzte Lesezeit in Minuten */
  minuten: number;
  /** Themenblock innerhalb des Kurses (Überschrift in der Lektionsliste, z. B. „Personalisierung“) */
  block?: string;
  /** Kurzanleitung (PDF) zu genau dieser Lektion; sonst gilt der Download des Kurses */
  download?: Download;
}

export interface Download {
  titel: string;
  beschreibung: string;
  href: string;
  /** Dateiname beim Herunterladen */
  datei: string;
  seiten: number;
}

export interface Kurs {
  slug: KursSlug;
  titel: string;
  /** Für wen? (Kicker) */
  zielgruppe: string;
  beschreibung: string;
  /** Meta-Description der Kursseite */
  kurz: string;
  lektionen: Lektion[];
  download?: Download;
  /** Weitere Kurzanleitungen (PDF) zu einzelnen Themenblöcken des Kurses */
  weitereDownloads?: Download[];
  /** Pfad mit geführter Tour (`?tour=start` wird angehängt) */
  tour?: { href: string; label: string };
}

export interface AblaufSchritt {
  wer: "Kunde" | "Druckerei" | "System";
  titel: string;
  text: string;
}

export interface Frage {
  frage: string;
  antwort: string;
  /** Kategorie für die Gliederung auf /hilfe und in llms-full.txt */
  thema: "Zugang" | "Hochladen" | "Prüfung" | "Freigabe & Versand" | "Personalisierung" | "Ungefährer Preis" | "Sicherheit & Datenschutz" | "Für KI-Assistenten";
}

/** Feste Zahlen der App — Quelle: lib/limits.ts, lib/analyze/pdf.ts, .env.example, Staff-Toasts. */
export const FAKTEN = {
  maxDateiMb: 100,
  anschnittMm: 3,
  aufloesungDpi: 300,
  codeStellen: 6,
  codeGueltigMin: 10,
  entwurfGueltigMin: 45,
  einmalLinkTage: 7,
  sitzungStunden: 24,
  /** Personalisierung — Quelle: lib/config.ts (PERS_*) */
  persMaxDatensaetze: 2000,
  persMaxNutzen: 20000,
  persDesignMb: 25,
  persTabelleMb: 10,
  persSchriftMb: 10,
  persEntwurfStunden: 24,
  persLinkTage: "7, 30 oder 90",
  dateitypen: "PDF, Bilder (z. B. PNG, JPG, TIFF), Word, Excel und PowerPoint (DOCX, XLSX, PPTX)",
} as const;

export const PRODUKT = {
  name: "dmp druckraum",
  anbieter: "digitale medien print gmbh",
  satz:
    "dmp druckraum ist das Online-Portal der digitale medien print gmbh (Heilbronn) zum Hochladen, automatischen Vorprüfen und Freigeben von Druckdaten.",
} as const;

/** Der Weg eines Auftrags — dieselben fünf Stufen wie in der App („Eingang“ bis „Versand“). */
export const ABLAUF: AblaufSchritt[] = [
  {
    wer: "Kunde",
    titel: "Hochladen",
    text: "Dateien hochladen, Auftrag beschreiben, mit einem Code aus der E-Mail bestätigen.",
  },
  {
    wer: "System",
    titel: "Eingang",
    text: "Auftragsnummer, automatische Vorprüfung (Format, Anschnitt, Schriften, Auflösung, Farbmodus) und Virenprüfung.",
  },
  {
    wer: "Druckerei",
    titel: "Prüfung",
    text: "Die Vorstufe sichtet Daten und Wünsche und hängt Auftragsbestätigung und Druckdateien an.",
  },
  {
    wer: "Kunde",
    titel: "Ihre Freigabe",
    text: "Auftragsbestätigung und Druckdateien ansehen, mit einem Code verbindlich freigeben — oder einen Änderungswunsch schicken.",
  },
  {
    wer: "Druckerei",
    titel: "Produktion",
    text: "Nach der Freigabe wird gedruckt. Der Status steht auf „In Produktion“.",
  },
  {
    wer: "Druckerei",
    titel: "Versand",
    text: "Rechnung und Sendungsnummer oder Liefertermin erscheinen im Auftrag; Sie bekommen eine E-Mail.",
  },
];

/** Status, wie Kunden sie sehen (lib/ui-text.ts → CUSTOMER_STATUS) — für Glossar und KI-Texte. */
export const STATUS_ERKLAERT: { status: string; bedeutung: string }[] = [
  { status: "Eingegangen — wir prüfen es in Kürze", bedeutung: "Dateien sind da, Auftragsnummer vergeben, Vorprüfung läuft oder ist fertig." },
  { status: "In Prüfung", bedeutung: "Die Vorstufe der Druckerei sieht sich Daten und Wünsche an." },
  { status: "Wartet auf Ihre Freigabe", bedeutung: "Auftragsbestätigung und Druckdateien liegen bereit; Sie geben mit einem Code frei." },
  { status: "In Produktion", bedeutung: "Freigegeben, es wird gedruckt." },
  { status: "Versendet", bedeutung: "Versand oder Eigenzustellung ist erfasst; Sendungsnummer oder Liefertermin und Rechnung stehen im Auftrag." },
  { status: "Zurückgezogen", bedeutung: "Der Auftrag wurde zurückgezogen; es folgen keine weiteren Schritte." },
];

export const GLOSSAR: { begriff: string; erklaerung: string }[] = [
  { begriff: "Anschnitt (Beschnittzugabe)", erklaerung: `Hintergründe und Bilder, die bis an den Rand gehen, laufen ${FAKTEN.anschnittMm} mm über das Endformat hinaus. Nach dem Druck wird dieser Rand abgeschnitten — so entstehen keine weißen Blitzer.` },
  { begriff: "Auflösung (dpi)", erklaerung: `Bildpunkte pro Zoll in Originalgröße. Für scharfen Druck sind ${FAKTEN.aufloesungDpi} dpi üblich; darunter ist ein Bild nutzbar, kann aber unscharf wirken.` },
  { begriff: "CMYK", erklaerung: "Farbmodus des Offset- und Digitaldrucks (Cyan, Magenta, Gelb, Schwarz). RGB-Daten aus Kamera oder Office werden umgerechnet; Farben können sich dabei verschieben." },
  { begriff: "Eingebettete Schriften", erklaerung: "Die Schriften stecken in der PDF-Datei. Fehlen sie, ersetzt der Drucker sie durch andere — Zeilenumbrüche und Optik ändern sich." },
  { begriff: "Vorprüfung (Preflight)", erklaerung: "Automatische Prüfung jeder Datei direkt nach dem Hochladen: Format, Seitenzahl, Anschnitt, Farbmodus, Schriften, Bildauflösung und Sicherheit." },
  { begriff: "Freigabe", erklaerung: "Ihre verbindliche Bestätigung von Auftragsbestätigung und Druckdateien per Code aus der E-Mail. Erst danach wird gedruckt." },
  { begriff: "Einmal-Upload-Link", erklaerung: `Persönlicher Link der Druckerei zum Hochladen ohne Konto. Er gilt ${FAKTEN.einmalLinkTage} Tage und verfällt beim Senden.` },
  { begriff: "Auftragsnummer", erklaerung: "Wird beim Eingang vergeben (Format TTMMJJ-NNN, z. B. 081126-004) und steht in jeder E-Mail und in „Meine Aufträge“." },
];

const ALLGEMEIN_ZUGANG = `Hochladen können Kundinnen und Kunden, deren E-Mail-Adresse bei der Druckerei hinterlegt und freigeschaltet ist. Neu hier? Stellen Sie unter „Anfrage ohne Kundenkonto“ (/anfrage) eine Anfrage; die Druckerei meldet sich und schaltet Sie frei.`;

/** Kurzanleitungen zu einzelnen Themenblöcken (public/hilfe, Quellen in docs/schulung). */
const PDF_PERS_VORLAGE: Download = {
  titel: "Kurzanleitung Personalisierung: Vorlage anlegen",
  beschreibung: "2 Seiten A4: Vorlage in 4 Schritten anlegen, Felder im Editor, Link an Kunden, häufige Fehler.",
  href: "/hilfe/dmp-druckraum-kurzanleitung-personalisierung-vorlage.pdf",
  datei: "dmp-druckraum-Kurzanleitung-Personalisierung-Vorlage.pdf",
  seiten: 2,
};
const PDF_PERS_AUSFUELLEN: Download = {
  titel: "Kurzanleitung Personalisierung ausfüllen",
  beschreibung: "1 Seite A4 für Kunden: Link öffnen, Daten eingeben oder Tabelle hochladen, prüfen, mit Code absenden.",
  href: "/hilfe/dmp-druckraum-kurzanleitung-personalisierung-ausfuellen.pdf",
  datei: "dmp-druckraum-Kurzanleitung-Personalisierung-ausfuellen.pdf",
  seiten: 1,
};
const PDF_KALKULATION: Download = {
  titel: "Kurzanleitung Kalkulation & Richtpreis",
  beschreibung: "2 Seiten A4: Ad-hoc kalkulieren, Rechenweg lesen, Preis-Einstellungen, Richtpreis für Kunden, Richtpreis an der Anfrage.",
  href: "/hilfe/dmp-druckraum-kurzanleitung-kalkulation.pdf",
  datei: "dmp-druckraum-Kurzanleitung-Kalkulation.pdf",
  seiten: 2,
};

export const KURSE: Kurs[] = [
  {
    slug: "kunden",
    titel: "Druckdaten hochladen und freigeben",
    zielgruppe: "Für Kundinnen und Kunden",
    beschreibung:
      "Vom Hochladen über die automatische Vorprüfung bis zur Freigabe und zum Versand, dazu personalisierte Drucksachen ausfüllen und den ungefähren Preis ansehen.",
    kurz: "Schulung für Kunden: Druckdaten hochladen, Vorprüfung verstehen, Auftrag per Code freigeben und Versand verfolgen.",
    tour: { href: "/upload", label: "Tour auf der Upload-Seite starten" },
    download: {
      titel: "Kurzanleitung für Kunden",
      beschreibung: "2 Seiten A4: Hochladen, Code, Vorprüfung, Freigabe, Versand — mit Checkliste.",
      href: "/hilfe/dmp-druckraum-kurzanleitung-kunden.pdf",
      datei: "dmp-druckraum-Kurzanleitung-Kunden.pdf",
      seiten: 2,
    },
    lektionen: [
      {
        slug: "so-funktioniert-es",
        titel: "So funktioniert der dmp druckraum",
        kurz: "Die fünf Stufen eines Auftrags — Eingang, Prüfung, Ihre Freigabe, Produktion, Versand — und was Sie in jeder tun.",
        einleitung:
          "Der dmp druckraum ersetzt Druckdaten per E-Mail-Anhang: Sie laden hoch, die Dateien werden sofort geprüft und Sie sehen jederzeit, wo Ihr Auftrag steht.",
        schritte: [
          "Öffnen Sie die Startseite und wählen Sie „Upload starten“.",
          "Laden Sie Ihre Dateien hoch, beschreiben Sie den Auftrag und senden Sie ihn mit „Anfrage senden“ ab.",
          "Bestätigen Sie mit dem Code aus Ihrer E-Mail — der Auftrag steht danach auf „Eingang“.",
          "Warten Sie auf die Auftragsbestätigung der Druckerei und geben Sie unter „Ihre Freigabe“ frei.",
          "Verfolgen Sie „Produktion“ und „Versand“ unter „Meine Aufträge“.",
        ],
        gutZuWissen:
          "Die Vorprüfung ist ein Hinweis, keine Hürde: Sie können jederzeit senden. Gedruckt wird erst nach Ihrer Freigabe.",
        bilder: [{ name: "kunde-start", alt: "Startseite des dmp druckraum mit den Knöpfen „Upload starten“ und „Meine Aufträge“" }],
        ausprobieren: { href: "/", label: "Zur Startseite" },
        block: "Hochladen und freigeben",
        minuten: 2,
      },
      {
        slug: "zugang-und-anmeldung",
        titel: "Zugang und Anmeldung",
        kurz: "Wer hochladen darf, wie Sie sich ohne Passwort mit einem E-Mail-Code anmelden und was Sie tun, wenn kein Code ankommt.",
        einleitung: `${ALLGEMEIN_ZUGANG} Ein Passwort gibt es nicht: Sie melden sich immer mit einem ${FAKTEN.codeStellen}-stelligen Code aus Ihrer E-Mail an.`,
        schritte: [
          "Wählen Sie oben „Konto“ — ohne Anmeldung landen Sie auf „Anmelden“.",
          "Geben Sie Ihre E-Mail-Adresse ein und klicken Sie auf „Code senden“.",
          "Tippen Sie den Code aus der E-Mail in „Code aus der E-Mail“ ein und klicken Sie auf „Anmelden“.",
          "Unter „Konto“ sehen Sie „Ihre Daten“ und „Ihre Aufträge“.",
        ],
        gutZuWissen: `Der Code gilt ${FAKTEN.codeGueltigMin} Minuten. Kein Code da? Spam-Ordner prüfen, dann erneut „Code senden“. Die Anmeldung bleibt ${FAKTEN.sitzungStunden} Stunden bestehen.`,
        bilder: [{ name: "kunde-anmelden", alt: "Seite „Anmelden“ mit dem Feld „E-Mail“ und dem Knopf „Code senden“" }],
        ausprobieren: { href: "/login", label: "Zur Anmeldung" },
        block: "Hochladen und freigeben",
        minuten: 2,
      },
      {
        slug: "druckdaten-hochladen",
        titel: "Druckdaten hochladen",
        kurz: `Dateien per Drag & Drop hochladen (bis ${FAKTEN.maxDateiMb} MB je Datei), Auftrag beschreiben, Produkt wählen und die Anfrage senden.`,
        einleitung:
          "Auf der Seite „Druckdaten hochladen“ füllen Sie vier Abschnitte nacheinander aus. Ein Konto brauchen Sie dafür nicht — die E-Mail-Bestätigung folgt erst nach dem Senden.",
        schritte: [
          "Ziehen Sie Ihre Dateien in das Feld „Dateien hierher ziehen“ oder klicken Sie darauf, um sie auszuwählen. Dann „Weiter“.",
          "Beschreiben Sie unter „Ihre Anfrage“, was gedruckt werden soll: Menge, Format, Papier, Extras, Wunschtermin. Dann „Weiter“.",
          "Wählen Sie unter „Mögliches Produkt“ das passende Produkt, z. B. „Flyer“ oder „Visitenkarte“.",
          "Tragen Sie unter „Referenz“ optional eine Bezugnahme ein, z. B. „wie letztes Mal“ oder eine Auftragsnummer.",
          "Klicken Sie auf „Anfrage senden“. Ein Balken zeigt, wie weit die Übertragung ist.",
        ],
        gutZuWissen: `Je Datei sind bis zu ${FAKTEN.maxDateiMb} MB möglich; leere Dateien werden abgelehnt. Mehrere Dateien in einem Auftrag sind ausdrücklich erwünscht — z. B. Vorder- und Rückseite oder Logo und Text.`,
        bilder: [
          { name: "kunde-upload-dateien", alt: "Upload-Seite mit drei hinzugefügten Dateien im Abschnitt „Dateien hochladen“" },
          { name: "kunde-upload-anfrage", alt: "Abschnitt „Ihre Anfrage“ mit beschriebenem Druckauftrag" },
        ],
        ausprobieren: { href: "/upload?tour=start", label: "Upload-Seite mit Tour öffnen" },
        block: "Hochladen und freigeben",
        minuten: 3,
      },
      {
        slug: "mit-code-bestaetigen",
        titel: "Upload mit dem E-Mail-Code bestätigen",
        kurz: `Nach dem Senden bestätigen Sie mit Ihrer E-Mail-Adresse und einem ${FAKTEN.codeStellen}-stelligen Code — erst dann geht der Auftrag ein.`,
        einleitung:
          "Der Code beweist, dass die Daten wirklich von Ihnen kommen. Erst nach der Bestätigung erhält der Auftrag eine Nummer und die Druckerei sieht ihn.",
        schritte: [
          "Geben Sie nach „Dateien erhalten“ Ihre hinterlegte E-Mail-Adresse ein und klicken Sie auf „Code senden“.",
          `Öffnen Sie die E-Mail und tippen Sie den ${FAKTEN.codeStellen}-stelligen Code in das Feld „Code“.`,
          "Klicken Sie auf „Upload bestätigen“.",
          "Im Fenster „Auftrag eingegangen“ sehen Sie Auftragsnummer, Status und die erste Prüfung Ihrer Dateien.",
        ],
        gutZuWissen: `Bestätigen Sie zügig: Ein nicht bestätigter Upload wird nach ${FAKTEN.entwurfGueltigMin} Minuten verworfen, der Code gilt ${FAKTEN.codeGueltigMin} Minuten. Unbekannte oder nicht freigeschaltete E-Mail-Adressen werden abgelehnt — dann hilft die Druckerei.`,
        bilder: [
          { name: "kunde-upload-code", alt: "Schritt „Code“ nach dem Upload mit dem Knopf „Upload bestätigen“" },
          { name: "kunde-auftrag-eingegangen", alt: "Fenster „Auftrag eingegangen“ mit Auftragsnummer, automatischem Hinweis und geprüften Dateien" },
        ],
        quiz: {
          frage: "Sie haben „Anfrage senden“ geklickt, aber den Code nicht eingegeben. Was passiert?",
          antworten: [
            { text: "Der Auftrag ist trotzdem bei der Druckerei eingegangen." },
            { text: `Nichts geht ein — nach ${FAKTEN.entwurfGueltigMin} Minuten wird der Upload verworfen.`, richtig: true },
            { text: "Die Druckerei ruft an und fragt nach dem Code." },
          ],
          erklaerung: "Erst „Upload bestätigen“ mit dem Code macht aus dem Upload einen Auftrag mit Nummer. Ohne Bestätigung sieht die Druckerei nichts.",
        },
        block: "Hochladen und freigeben",
        minuten: 2,
      },
      {
        slug: "vorpruefung-verstehen",
        titel: "Die automatische Vorprüfung verstehen",
        kurz: "Was „OK“, „Bitte prüfen“ und „Problem“ bedeuten und welche Punkte (Anschnitt, Schriften, Auflösung, Farbmodus) geprüft werden.",
        einleitung:
          "Jede Datei wird direkt nach dem Eingang automatisch geprüft. Das Ergebnis steht im Auftrag unter „Prüfung“ und je Datei als farbiges Kennzeichen.",
        schritte: [
          "Öffnen Sie Ihren Auftrag unter „Meine Aufträge“ und klappen Sie die Stufe „Prüfung“ auf.",
          "Lesen Sie den „Automatischer Hinweis“: Er fasst in Klartext zusammen, was auffällt.",
          "Sehen Sie sich je Datei das Kennzeichen an: „OK“, „Bitte prüfen“ oder „Problem“.",
          "Bei „Bitte prüfen“ oder „Problem“: Datei verbessern und neu hochladen — oder einfach abwarten, die Vorstufe meldet sich.",
        ],
        details: [
          {
            titel: "Was geprüft wird",
            punkte: [
              "Druckbarkeit: Format und Seitenzahl, Anschnitt, Farbmodus, eingebettete Schriften und Bildauflösung — pro Datei.",
              "Einheitlichkeit: Bei mehrseitigen PDFs werden Seitenformat und Anschnitt verglichen; abweichende Seiten werden genannt.",
              "Sicherheit: Virenscan, PDF-Skripte, Office-Makros und falsche Dateitypen.",
            ],
          },
          {
            titel: "Die Kennzeichen",
            punkte: [
              "„OK“ — nichts Auffälliges.",
              "„Bitte prüfen“ — nutzbar, aber z. B. weniger als 3 mm Anschnitt oder Bilder unter 300 dpi.",
              "„Problem“ — z. B. beschädigte PDF oder Bild deutlich zu gering aufgelöst.",
              "„Virenprüfung läuft“ — der Virenscan steht noch aus und folgt automatisch.",
              "„Zurückgehalten“ — die Datei wurde aus Sicherheitsgründen gesperrt und nicht geöffnet.",
            ],
          },
        ],
        gutZuWissen:
          "Der automatische Hinweis ist eine erste Einschätzung, keine Ablehnung. Die verbindliche Prüfung macht die Vorstufe der Druckerei.",
        bilder: [{ name: "kunde-auftrag-pruefung", alt: "Auftragsseite mit aufgeklappter Stufe „Prüfung“, automatischem Hinweis und Kennzeichen je Datei" }],
        quiz: {
          frage: "Eine Datei zeigt „Bitte prüfen“. Was bedeutet das?",
          antworten: [
            { text: "Die Datei wurde abgelehnt und muss neu hochgeladen werden." },
            { text: "Die Datei ist nutzbar, aber ein Punkt (z. B. Anschnitt oder Auflösung) sollte angesehen werden.", richtig: true },
            { text: "Die Datei enthält einen Virus." },
          ],
          erklaerung: "„Bitte prüfen“ ist ein Hinweis. Abgelehnt wird nichts automatisch; Gesperrtes heißt „Zurückgehalten“.",
        },
        block: "Hochladen und freigeben",
        minuten: 3,
      },
      {
        slug: "druckdaten-vorbereiten",
        titel: "Druckdaten richtig vorbereiten",
        kurz: `Checkliste für druckfertige Daten: PDF, ${FAKTEN.anschnittMm} mm Anschnitt, ${FAKTEN.aufloesungDpi} dpi, eingebettete Schriften, CMYK, einheitliche Seitenformate.`,
        einleitung:
          "Mit diesen Punkten zeigt die Vorprüfung meist sofort „OK“ und Ihr Auftrag geht ohne Rückfragen in die Produktion.",
        schritte: [
          "Exportieren Sie als PDF — am besten als PDF/X aus Ihrem Layoutprogramm.",
          `Legen Sie ${FAKTEN.anschnittMm} mm Anschnitt an allen Seiten an, wenn Farben oder Bilder bis an den Rand gehen.`,
          `Verwenden Sie Bilder mit ${FAKTEN.aufloesungDpi} dpi in der Größe, in der sie gedruckt werden.`,
          "Betten Sie alle Schriften ein (Export-Einstellung „Schriften einbetten“) oder wandeln Sie Text in Pfade um.",
          "Legen Sie Farben in CMYK an; RGB wird umgerechnet und kann sich verändern.",
          "Halten Sie alle Seiten einer Datei im gleichen Format.",
        ],
        gutZuWissen: `Sie haben nur Word, Excel, PowerPoint oder ein Foto? Laden Sie es trotzdem hoch (${FAKTEN.dateitypen}). Die Vorstufe macht daraus druckfähige Daten oder meldet sich.`,
        block: "Hochladen und freigeben",
        minuten: 3,
      },
      {
        slug: "auftrag-freigeben",
        titel: "Auftrag freigeben oder Änderung wünschen",
        kurz: "Auftragsbestätigung und Druckdateien prüfen, mit Code verbindlich freigeben oder per „Änderungswunsch“ korrigieren lassen.",
        einleitung:
          "Sobald die Druckerei Auftragsbestätigung und Druckdateien angehängt hat, bekommen Sie eine E-Mail und der Status lautet „Wartet auf Ihre Freigabe“.",
        schritte: [
          "Öffnen Sie den Auftrag und klappen Sie „Ihre Freigabe“ auf.",
          "Laden Sie die „Auftragsbestätigung“ und die Druckdateien herunter oder sehen Sie sie in der Vorschau an.",
          "Alles richtig? Klicken Sie auf „Freigeben“ — Sie erhalten einen Freigabe-Code per E-Mail.",
          "Geben Sie den Code ein und klicken Sie auf „Freigabe bestätigen“.",
          "Etwas stimmt nicht? Klicken Sie stattdessen auf „Änderungswunsch“ und schreiben Sie der Druckerei per E-Mail, was geändert werden soll.",
        ],
        gutZuWissen:
          "Die Freigabe ist verbindlich: Danach wird gedruckt. Prüfen Sie Texte, Telefonnummern, Daten und Format besonders genau. Bei einer korrigierten Fassung erhalten Sie eine neue Version zur Freigabe.",
        bilder: [{ name: "kunde-auftrag-freigabe", alt: "Stufe „Ihre Freigabe“ mit Auftragsbestätigung, Druckdateien und den Knöpfen „Freigeben“ und „Änderungswunsch“" }],
        quiz: {
          frage: "Was passiert nach „Freigabe bestätigen“?",
          antworten: [
            { text: "Der Auftrag geht verbindlich in die Produktion.", richtig: true },
            { text: "Die Druckerei schickt erst noch einen Korrekturabzug per Post." },
            { text: "Sie können die Freigabe in der App wieder zurücknehmen." },
          ],
          erklaerung: "Mit der bestätigten Freigabe wechselt der Status auf „In Produktion“. Änderungen danach nur nach Rücksprache mit der Druckerei.",
        },
        block: "Hochladen und freigeben",
        minuten: 3,
      },
      {
        slug: "status-und-versand",
        titel: "Status, Versand und Rechnung verfolgen",
        kurz: "Unter „Meine Aufträge“ Aufträge suchen, Status verstehen und nach dem Versand Sendungsnummer, Liefertermin und Rechnung finden.",
        einleitung:
          "Alle Ihre Aufträge stehen unter „Meine Aufträge“ — mit Auftragsnummer, Produkt, Status und Datum. Die wichtigen Schritte (Freigabe angefordert, Freigabe bestätigt, Versand) kommen zusätzlich per E-Mail.",
        schritte: [
          "Klicken Sie oben auf „Aufträge“ (oder „Meine Aufträge“ auf der Startseite).",
          "Suchen Sie im Suchfeld nach Auftragsnummer, Produkt, Text oder Status.",
          "Klicken Sie auf eine Auftragsnummer, um den Auftrag zu öffnen.",
          "Nach dem Versand finden Sie unter „Versand“ die Sendungsnummer oder den Liefertermin und die „Rechnung“ zum Herunterladen.",
        ],
        gutZuWissen: "Kein Auftrag sichtbar? Dann sind Sie nicht angemeldet. Öffnen Sie den Link aus der E-Mail oder melden Sie sich mit Ihrer E-Mail-Adresse an.",
        bilder: [
          { name: "kunde-auftraege", alt: "Liste „Meine Aufträge“ mit Auftragsnummer, Produkt, Status und Datum" },
          { name: "kunde-auftrag-versand", alt: "Stufe „Versand“ mit Sendungsnummer und Rechnung zum Herunterladen" },
        ],
        ausprobieren: { href: "/requests", label: "Zu „Meine Aufträge“" },
        block: "Hochladen und freigeben",
        minuten: 2,
      },
      {
        slug: "einmal-upload-link",
        titel: "Hochladen per Einmal-Upload-Link",
        kurz: `Ohne Konto hochladen: mit dem persönlichen Link der Druckerei, gültig ${FAKTEN.einmalLinkTage} Tage und nur für einen Auftrag.`,
        einleitung:
          "Für neue Kundinnen und Kunden oder einmalige Aufträge schickt die Druckerei einen persönlichen Link. Damit laden Sie ohne Code-Bestätigung hoch.",
        schritte: [
          "Öffnen Sie den Link aus der E-Mail der Druckerei.",
          "Wählen Sie unter „Dateien (mehrere möglich)“ Ihre Dateien aus.",
          "Beschreiben Sie unter „Ihre Anfrage“ den Auftrag und wählen Sie das „Produkt“.",
          "Senden Sie ab — Sie sehen „Dateien erhalten — die Druckerei meldet sich bei Ihnen.“",
        ],
        gutZuWissen: `Der Link gilt ${FAKTEN.einmalLinkTage} Tage und verfällt beim Senden. Für einen weiteren Auftrag brauchen Sie einen neuen Link oder einen freigeschalteten Zugang.`,
        block: "Hochladen und freigeben",
        minuten: 2,
      },
      {
        slug: "personalisierte-drucksachen-ausfuellen",
        block: "Personalisierte Drucksachen und Preis",
        download: PDF_PERS_AUSFUELLEN,
        titel: "Personalisierte Drucksachen ausfüllen",
        kurz: "Visitenkarten, Namensschilder und mehr mit Ihren Daten: Link öffnen, einzeln oder per Tabelle eingeben, prüfen und mit Code absenden.",
        einleitung:
          "Bei einer personalisierten Drucksache ist das Design fertig, Sie tragen nur Ihre Daten ein, zum Beispiel Namen und Telefonnummern. Sie sehen sofort, wie es gedruckt aussieht. Ein Konto brauchen Sie dafür nicht, wenn Sie einen Link von der Druckerei haben.",
        schritte: [
          "Öffnen Sie den Link, den Sie von der Druckerei bekommen haben. Mit Kundenkonto finden Sie die Vorlage unter „Konto“ bei „Meine Vorlagen“ mit dem Knopf „Ausfüllen“.",
          "Wählen Sie „Einzeln eingeben“ oder „Tabelle hochladen“. Einzeln: Füllen Sie die Felder aus. Pflichtangaben sind mit einem Stern markiert. Für den nächsten Eintrag klicken Sie auf „+ Weitere hinzufügen“. Rechts zeigt die Vorschau jeden Eintrag.",
          "Bei vielen Einträgen: Laden Sie die „Beispieltabelle (Excel) laden“ oder die „Beispieltabelle (CSV) laden“ herunter, tragen Sie Ihre Daten ein und ziehen Sie die Datei in das Feld oder wählen Sie „Datei auswählen“. Prüfen Sie die Zuordnung der Spalten und klicken Sie auf „Zuordnung bestätigen und übernehmen“.",
          "Klicken Sie auf „Weiter: Prüfen“. Die Prüfung zeigt, ob alles druckbar ist. Bei einem Fehler führt „Zum Feld“ direkt zur Stelle.",
          "Klicken Sie auf „Weiter: Absenden“. Tragen Sie die Auflage ein („Auflage für alle Einträge“ und „Für alle übernehmen“), dazu Ihren Namen und Ihre E-Mail-Adresse.",
          "Klicken Sie auf „Weiter zur Bestätigung“, geben Sie den Code aus Ihrer E-Mail ein und klicken Sie auf „Bestätigen und absenden“. Erst dann geht der Auftrag bei der Druckerei ein.",
        ],
        details: [
          {
            titel: "Was die Symbole bei der Prüfung bedeuten",
            punkte: [
              "„Alles in Ordnung“: Der Eintrag ist druckbar.",
              "„Hinweis“: Er ist druckbar, aber zum Beispiel ist die Schrift kleiner, damit ein langer Name passt.",
              "„Bitte prüfen“: Etwas fehlt oder passt nicht. Beheben Sie es, bevor Sie absenden.",
              "„Noch leer“: Der Eintrag enthält noch nichts und wird nicht mitgeschickt.",
            ],
          },
        ],
        gutZuWissen: `Ihre Eingaben werden zwischengespeichert, damit Sie später weitermachen können (in diesem Browser). Spätestens ${FAKTEN.persEntwurfStunden} Stunden nach Ihrer letzten Änderung werden sie automatisch gelöscht, mit „Meine Eingaben jetzt löschen“ sofort. Nach dem Absenden löscht unser Server die Eingaben. Tabellen dürfen bis ${FAKTEN.persTabelleMb} MB groß sein, höchstens ${FAKTEN.persMaxDatensaetze.toLocaleString("de-DE")} Einträge je Auftrag.`,
        bilder: [
          { name: "pers-kunde-einzeln", alt: "Seite einer Vorlage mit den Feldern Vorname, Nachname, Funktion, Telefon und E-Mail und der Vorschau der Visitenkarte rechts" },
          { name: "pers-kunde-tabelle-upload", alt: "Reiter „Tabelle hochladen“ mit den Knöpfen für die Beispieltabellen und dem Feld zum Ablegen der Datei" },
          { name: "pers-kunde-zuordnung", alt: "Zuordnung der Spalten einer hochgeladenen Tabelle zu den Feldern der Vorlage" },
          { name: "pers-kunde-pruefen", alt: "Schritt „Prüfen“ mit einem Eintrag, bei dem der Nachname fehlt, und dem Knopf „Zum Feld“" },
          { name: "pers-kunde-absenden", alt: "Schritt „Absenden“ mit Auflage und Kontaktdaten" },
          { name: "pers-kunde-code", alt: "Eingabe des sechsstelligen Codes aus der E-Mail" },
        ],
        quiz: {
          frage: "Wie lange bleiben Ihre Eingaben als Zwischenstand gespeichert?",
          antworten: [
            { text: "Bis 24 Stunden nach Ihrer letzten Änderung. Danach werden sie gelöscht.", richtig: true },
            { text: "Eine Woche." },
            { text: "Für immer, damit Sie sie wiederverwenden können." },
          ],
          erklaerung: "Das dient Ihrem Datenschutz. Mit „Meine Eingaben jetzt löschen“ löschen Sie früher.",
        },
        ausprobieren: { href: "/konto", label: "Zu „Konto“ und „Meine Vorlagen“" },
        minuten: 5,
      },
      {
        slug: "ungefaehren-preis-anzeigen",
        block: "Personalisierte Drucksachen und Preis",
        download: PDF_PERS_AUSFUELLEN,
        titel: "Ungefähren Preis anzeigen",
        kurz: "In der Anfrage unverbindlich sehen, was Ihr Vorhaben ungefähr kostet: Fragen beantworten, Auflagen vergleichen, Anfrage senden.",
        einleitung: "Bei manchen Produkten können Sie schon in der Anfrage einen ungefähren Preis ansehen. Das ist freiwillig und unverbindlich. Den verbindlichen Preis bekommen Sie mit dem Angebot.",
        schritte: [
          "Öffnen Sie „Anfrage ohne Kundenkonto“ und wählen Sie das Produkt.",
          "Gibt es einen Preisrechner zum Produkt, erscheint „Ungefähren Preis anzeigen“. Klicken Sie darauf.",
          "Beantworten Sie die Fragen, zum Beispiel zu Format und Papier, und tragen Sie die Auflage ein. Mit „Auflage hinzufügen“ vergleichen Sie bis zu drei Auflagen.",
          "Der Preis aktualisiert sich von selbst. Sie sehen den Preis netto, brutto und je Stück.",
          "Schicken Sie die Anfrage wie gewohnt ab. Mit „Ausblenden“ klappen Sie den Bereich wieder zu; dann geht kein Preis mit.",
        ],
        gutZuWissen: "Der Preis ist unverbindlich. Steht dort „Dazu nennen wir Ihnen den Preis gern im Angebot“, nennt die Druckerei den Preis persönlich. Gibt es für Ihr Produkt keinen Preisrechner, erscheint der Knopf nicht. Die Anfrage klappt trotzdem.",
        bilder: [
          { name: "anfrage-richtpreis-zu", alt: "Anfrage mit dem Knopf „Ungefähren Preis anzeigen“" },
          { name: "anfrage-richtpreis", alt: "Geöffneter Bereich „Ungefährer Preis“ mit Fragen, Auflage und dem Preis netto und brutto" },
        ],
        quiz: {
          frage: "Ist der angezeigte ungefähre Preis verbindlich?",
          antworten: [
            { text: "Nein. Der verbindliche Preis kommt mit dem Angebot.", richtig: true },
            { text: "Ja, die Druckerei muss ihn einhalten." },
            { text: "Ja, wenn Sie die Anfrage absenden." },
          ],
          erklaerung: "Der Preis ist eine Schätzung auf Grundlage Ihrer Angaben.",
        },
        ausprobieren: { href: "/anfrage", label: "Zur „Anfrage ohne Kundenkonto“" },
        minuten: 3,
      },
    ],
  },
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
      href: "/hilfe/dmp-druckraum-kurzanleitung-druckerei.pdf",
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
  },
  {
    slug: "partner",
    titel: "Partner-Schnittstelle (API)",
    zielgruppe: "Für Partnersysteme und Entwickler",
    beschreibung:
      "Server-zu-Server-Schnittstelle, über die Partnersysteme Druckaufträge einliefern, den Status abrufen und Statusmeldungen per Webhook erhalten.",
    kurz: "Dokumentation der Partner-API von dmp druckraum: Authentifizierung, Auftrag anlegen, Status, Webhooks mit HMAC-Signatur, Fehlercodes.",
    download: {
      titel: "Kurzreferenz Partner-API",
      beschreibung: "1 Seite A4: Endpunkte, Statusmodell, Webhook-Signatur, Fehlercodes.",
      href: "/hilfe/dmp-druckraum-kurzreferenz-partner-api.pdf",
      datei: "dmp-druckraum-Kurzreferenz-Partner-API.pdf",
      seiten: 1,
    },
    lektionen: [
      {
        slug: "ueberblick-und-zugang",
        titel: "Überblick und Zugang",
        kurz: "Wofür die Partner-API da ist, wie der API-Key (Bearer dmp_…) funktioniert und wie Sie Zugang bekommen.",
        einleitung:
          "Die Partner-API ist eine dritte Tür in dieselbe Pipeline wie Upload und Einmal-Link: Datei, Vorprüfung, Virenscan, Auftragsbestätigung, Kundenfreigabe und Versand laufen unverändert.",
        schritte: [
          "Vereinbaren Sie mit der digitale medien print gmbh eine Partnerschaft; Sie erhalten einen API-Key (dmp_…) und ein Webhook-Secret (whsec_…).",
          "Senden Sie den Key in jedem Aufruf als Kopfzeile „Authorization: Bearer dmp_…“.",
          "Nennen Sie der Druckerei die Hosts, von denen Ihre Druckdateien geladen werden (nur HTTPS), und Ihre Webhook-URL.",
          "Legen Sie Aufträge an, fragen Sie den Status ab und werten Sie die Webhooks aus.",
        ],
        gutZuWissen:
          "Key und Secret werden nur einmal ausgegeben und nur als Hash bzw. verschlüsselt gespeichert. Ein fehlender, falscher oder gesperrter Key ergibt 401.",
        code: [
          {
            titel: "Kopfzeile jedes Aufrufs",
            sprache: "http",
            inhalt: "Authorization: Bearer dmp_<64 hex>\nContent-Type: application/json",
          },
        ],
        minuten: 2,
      },
      {
        slug: "auftrag-anlegen",
        titel: "Auftrag anlegen",
        kurz: "POST /api/partner/requests — idempotent über partnerRef; Datei per HTTPS-URL mit Größe und SHA-256.",
        einleitung:
          "Ein Aufruf legt Auftrag, Datei und Auftragsnummer in einem Schritt an. Derselbe partnerRef liefert immer denselben Auftrag zurück.",
        schritte: [
          "Erzeugen Sie eine eindeutige partnerRef (1–120 Zeichen A–Z a–z 0–9 . _ : -).",
          "Füllen Sie customer (E-Mail, Name, Organisation), product (hint, Format), quantity, delivery und file (url, name, mime, size, sha256).",
          "Senden Sie POST /api/partner/requests — 201 heißt neu angelegt, 200 heißt: gab es schon, unverändert zurückgegeben.",
          "Merken Sie sich number (Auftragsnummer) und status aus der Antwort.",
        ],
        details: [
          {
            titel: "Feldregeln",
            punkte: [
              "product.hint: flyer, poster, brochure, business-card, letterhead, sticker, banner, name-tag, campaign oder other.",
              "quantity: Ganzzahl 1–1 000 000; wishDate: YYYY-MM-DD oder null.",
              "delivery.mode: abholung oder lieferung (dann ist delivery.address Pflicht).",
              `file.url: HTTPS, Port 443, Host freigegeben; file.size und file.sha256 müssen exakt passen; höchstens ${FAKTEN.maxDateiMb} MB.`,
              "source.system ist Pflicht; publication und link sind optional und werden im Staff-Bereich angezeigt.",
            ],
          },
        ],
        code: [
          {
            titel: "Auftrag anlegen (curl)",
            sprache: "bash",
            inhalt: `curl -sS https://www.druck-s.de/api/partner/requests \\
  -H "Authorization: Bearer $DRUCK_S_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "partnerRef": "bestellung-2026-0042",
    "customer": { "email": "anna@example.org", "name": "Anna Muster", "organisation": "Quartierszentrum" },
    "product": { "hint": "poster", "label": "Plakat A2", "widthMm": 420, "heightMm": 594, "bleedMm": 3, "sides": 1 },
    "quantity": 10,
    "wishDate": "2026-11-20",
    "delivery": { "mode": "abholung", "address": null },
    "file": { "url": "https://files.example.org/plakat.pdf", "name": "plakat.pdf",
              "mime": "application/pdf", "size": 2048, "sha256": "<64 hex>" },
    "source": { "system": "beispiel-partner" }
  }'
# 201 {"request":{"id":"…","number":"091126-004","status":"RECEIVED","partnerRef":"bestellung-2026-0042",…}}`,
          },
        ],
        minuten: 4,
      },
      {
        slug: "status-abrufen",
        titel: "Status abrufen und Statusmodell",
        kurz: "GET /api/partner/requests/{partnerRef} und die Status RECEIVED, IN_REVIEW, WAITING_APPROVAL, IN_PROGRESS, SHIPPED, WITHDRAWN.",
        einleitung: "Den aktuellen Stand fragen Sie jederzeit über die partnerRef ab. Sie sehen nur eigene Aufträge.",
        schritte: [
          "Senden Sie GET /api/partner/requests/{partnerRef} mit Ihrem Key.",
          "Werten Sie status aus (siehe Statusmodell).",
          "Bei SHIPPED stehen trackingNumber oder specialDeliveryDate in der Antwort.",
        ],
        details: [
          {
            titel: "Statusmodell",
            punkte: [
              "RECEIVED — eingegangen, Auftragsnummer vergeben.",
              "IN_REVIEW — die Druckerei prüft.",
              "WAITING_APPROVAL — Auftragsbestätigung an die Kundin oder den Kunden verschickt.",
              "IN_PROGRESS — per Code freigegeben, in Produktion.",
              "SHIPPED — versendet oder Liefertermin erfasst.",
              "WITHDRAWN — vom Partner zurückgezogen (Endzustand).",
            ],
          },
        ],
        code: [
          {
            titel: "Status abrufen",
            sprache: "bash",
            inhalt: `curl -sS https://www.druck-s.de/api/partner/requests/bestellung-2026-0042 \\
  -H "Authorization: Bearer $DRUCK_S_API_KEY"`,
          },
        ],
        minuten: 2,
      },
      {
        slug: "webhooks",
        titel: "Webhooks empfangen und Signatur prüfen",
        kurz: "Jeder Statuswechsel als signierter POST (HMAC-SHA256 über Zeitstempel und rohen Body) mit Wiederholungen bei Fehlern.",
        einleitung:
          "Bei jedem echten Statuswechsel schickt dmp druckraum ein Ereignis status_changed an Ihre Webhook-URL — in der richtigen Reihenfolge je Auftrag.",
        schritte: [
          "Nehmen Sie POST-Anfragen an Ihrer Webhook-URL an und lesen Sie den rohen Body.",
          "Prüfen Sie x-druck-s-timestamp (höchstens 5 Minuten alt) und x-druck-s-signature (v1=HMAC-SHA256(secret, timestamp + \".\" + body)).",
          "Entdoppeln Sie über x-druck-s-delivery.",
          "Antworten Sie mit 2xx. Andere Antworten werden mit Backoff bis zu 10-mal wiederholt; 400, 410 und 422 gelten als endgültig.",
        ],
        code: [
          {
            titel: "Beispiel-Ereignis",
            sprache: "json",
            inhalt: `{"event":"status_changed","partnerRef":"bestellung-2026-0042","number":"091126-004",
 "status":"SHIPPED","occurredAt":"2026-11-09T10:00:00.000Z",
 "trackingNumber":"00340434…","specialDeliveryDate":null}`,
          },
          {
            titel: "Signatur prüfen (Node.js)",
            sprache: "js",
            inhalt: `import { createHmac, timingSafeEqual } from "node:crypto";
function valid(secret, rawBody, ts, sig) {
  if (!/^\\d{9,11}$/.test(ts ?? "") || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = Buffer.from(\`v1=\${createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex")}\`);
  const got = Buffer.from(sig ?? "");
  return expected.length === got.length && timingSafeEqual(expected, got);
}`,
          },
        ],
        gutZuWissen: "Die Reihenfolge der JSON-Schlüssel ist nicht festgelegt — prüfen Sie die Signatur immer über den rohen Body, nie über neu serialisiertes JSON.",
        minuten: 3,
      },
      {
        slug: "zurueckziehen-und-fehler",
        titel: "Zurückziehen und Fehlercodes",
        kurz: "POST …/cancel nur aus RECEIVED oder IN_REVIEW; alle Fehlercodes (400–500) mit Bedeutung.",
        einleitung: "Fehler kommen als JSON { error, code, details? }. Alle Aufrufe sind idempotent und dürfen wiederholt werden.",
        schritte: [
          "Zurückziehen: POST /api/partner/requests/{partnerRef}/cancel — erlaubt aus RECEIVED oder IN_REVIEW, sonst 409 not_withdrawable.",
          "Werten Sie code aus, nicht den Text in error.",
          "Bei 429 rate_limited warten Sie die Zeit aus Retry-After ab.",
          "Bei 500 internal_error wiederholen Sie denselben Aufruf.",
        ],
        details: [
          {
            titel: "Fehlercodes",
            punkte: [
              "400 invalid_json / invalid_body (details listet alle Feldfehler) / file_host_not_allowed",
              "401 unauthorized — Key fehlt, ist falsch oder der Partner ist gesperrt",
              "404 not_found — partnerRef unbekannt oder gehört einem anderen Partner",
              "409 not_withdrawable — Zurückziehen nach IN_REVIEW",
              "413 body_too_large — JSON größer als 64 KB",
              "422 file_unavailable / file_size_mismatch / file_sha256_mismatch / customer_disabled",
              "429 rate_limited — zu viele neue Aufträge pro Stunde",
              "500 internal_error — gleicher Aufruf kann wiederholt werden",
            ],
          },
        ],
        minuten: 2,
      },
    ],
  },
];

export const FRAGEN: Frage[] = [
  {
    thema: "Zugang",
    frage: "Brauche ich ein Konto, um Druckdaten hochzuladen?",
    antwort: `Nein, ein Passwort oder eine Registrierung gibt es nicht. Nach dem Hochladen bestätigen Sie mit einem ${FAKTEN.codeStellen}-stelligen Code aus Ihrer E-Mail. Ist Ihre Adresse bei der Druckerei freigeschaltet, sehen Sie den Auftrag danach unter „Meine Aufträge“. Sind Sie neu, geht Ihr Upload als Anfrage ohne Kundenkonto ein und die Druckerei meldet sich bei Ihnen.`,
  },
  {
    thema: "Zugang",
    frage: "Ich bekomme keinen Code. Was kann ich tun?",
    antwort: `Prüfen Sie den Spam-Ordner und ob die E-Mail-Adresse richtig geschrieben ist. Der Code gilt ${FAKTEN.codeGueltigMin} Minuten — fordern Sie bei Bedarf einen neuen an. Für die Anmeldung unter „Meine Aufträge“ wird nur an freigeschaltete Adressen ein Code verschickt; sind Sie neu, stellen Sie eine Anfrage ohne Kundenkonto.`,
  },
  {
    thema: "Zugang",
    frage: "Wie bekomme ich einen Zugang?",
    antwort: "Stellen Sie eine Anfrage ohne Kundenkonto (/anfrage) oder rufen Sie die digitale medien print gmbh an (siehe Kontakt). Die Druckerei meldet sich, schaltet Ihre Adresse frei oder schickt Ihnen einen Einmal-Upload-Link.",
  },
  {
    thema: "Zugang",
    frage: "Kann ich anfragen, ohne Kunde zu sein?",
    antwort: `Ja, unter „Anfrage ohne Kundenkonto“ (/anfrage). Sie beschreiben Ihr Vorhaben, hängen bei Bedarf Dateien an und bestätigen mit einem ${FAKTEN.codeStellen}-stelligen Code aus Ihrer E-Mail. Erst mit dem Code geht die Anfrage bei der Druckerei ein; sie meldet sich persönlich bei Ihnen. Ein Zugang zum Portal entsteht dadurch noch nicht.`,
  },
  {
    thema: "Hochladen",
    frage: "Welche Dateien kann ich hochladen und wie groß dürfen sie sein?",
    antwort: `${FAKTEN.dateitypen}. Je Datei sind bis zu ${FAKTEN.maxDateiMb} MB möglich, mehrere Dateien pro Auftrag sind erlaubt. Am besten druckt sich ein PDF/X mit ${FAKTEN.anschnittMm} mm Anschnitt und eingebetteten Schriften.`,
  },
  {
    thema: "Hochladen",
    frage: "Wie lange habe ich Zeit, den Upload zu bestätigen?",
    antwort: `Ein hochgeladener, aber nicht bestätigter Auftrag wird nach ${FAKTEN.entwurfGueltigMin} Minuten verworfen. Der Code aus der E-Mail gilt ${FAKTEN.codeGueltigMin} Minuten.`,
  },
  {
    thema: "Hochladen",
    frage: "Kann ich Dateien nachreichen oder etwas ändern, nachdem ich gesendet habe?",
    antwort: "Laden Sie einen neuen Auftrag hoch und tragen Sie unter „Referenz“ die bisherige Auftragsnummer ein — oder schreiben Sie der Druckerei. Nach der Auftragsbestätigung nutzen Sie den Knopf „Änderungswunsch“.",
  },
  {
    thema: "Prüfung",
    frage: "Was prüft die automatische Vorprüfung?",
    antwort: `Format und Seitenzahl, Anschnitt (Ziel: ${FAKTEN.anschnittMm} mm), Farbmodus (CMYK/RGB), eingebettete Schriften, Bildauflösung (Ziel: ${FAKTEN.aufloesungDpi} dpi), einheitliche Seitenformate sowie Sicherheit (Virenscan, PDF-Skripte, Office-Makros, falsche Dateitypen).`,
  },
  {
    thema: "Prüfung",
    frage: "Meine Datei zeigt „Bitte prüfen“ oder „Problem“. Wird der Auftrag abgelehnt?",
    antwort: "Nein. Die Vorprüfung gibt Hinweise, sie lehnt nichts ab. Die Vorstufe der Druckerei sieht sich jeden Auftrag an und meldet sich, wenn etwas geändert werden muss. Sie können eine verbesserte Datei aber jederzeit selbst nachreichen.",
  },
  {
    thema: "Freigabe & Versand",
    frage: "Wann wird mein Auftrag gedruckt?",
    antwort: "Erst nachdem Sie Auftragsbestätigung und Druckdateien mit einem Code aus Ihrer E-Mail freigegeben haben. Danach steht der Status auf „In Produktion“.",
  },
  {
    thema: "Freigabe & Versand",
    frage: "Kann ich eine Freigabe zurücknehmen?",
    antwort: "In der App nicht — die Freigabe ist verbindlich. Melden Sie sich sofort telefonisch bei der Druckerei, wenn Ihnen nach der Freigabe noch ein Fehler auffällt.",
  },
  {
    thema: "Freigabe & Versand",
    frage: "Wo finde ich Sendungsnummer und Rechnung?",
    antwort: "Im Auftrag unter der Stufe „Versand“. Sie erhalten außerdem eine E-Mail, sobald der Versand erfasst ist.",
  },
  {
    thema: "Personalisierung",
    frage: "Brauche ich ein Konto, um eine personalisierte Drucksache auszufüllen?",
    antwort: `Nein, wenn Sie einen Link von der Druckerei haben. Mit Kundenkonto finden Sie die Vorlage unter „Meine Vorlagen“. Zum Absenden bestätigen Sie mit einem ${FAKTEN.codeStellen}-stelligen Code aus Ihrer E-Mail; erst dann geht der Auftrag bei der Druckerei ein.`,
  },
  {
    thema: "Personalisierung",
    frage: "Wie lange bleiben meine Eingaben gespeichert?",
    antwort: `Spätestens ${FAKTEN.persEntwurfStunden} Stunden nach Ihrer letzten Änderung werden sie automatisch gelöscht. Mit „Meine Eingaben jetzt löschen“ löschen Sie sofort. Nach dem Absenden löscht der Server Ihre Eingaben.`,
  },
  {
    thema: "Personalisierung",
    frage: "Kann ich viele Einträge als Tabelle hochladen?",
    antwort: `Ja. Im Reiter „Tabelle hochladen“ laden Sie die Beispieltabelle (Excel oder CSV) herunter, tragen Ihre Daten ein und laden die Datei wieder hoch. Die Tabelle darf bis ${FAKTEN.persTabelleMb} MB groß sein, es sind höchstens ${FAKTEN.persMaxDatensaetze.toLocaleString("de-DE")} Einträge je Auftrag möglich.`,
  },
  {
    thema: "Personalisierung",
    frage: "Was heißt „Hinweis“ und „Bitte prüfen“ bei der Prüfung?",
    antwort: "„Hinweis“ bedeutet: druckbar, aber zum Beispiel ist die Schrift verkleinert, damit ein langer Name passt. „Bitte prüfen“ bedeutet: Etwas fehlt oder passt nicht. Beheben Sie es mit „Zum Feld“, dann können Sie absenden.",
  },
  {
    thema: "Ungefährer Preis",
    frage: "Ist der ungefähre Preis in der Anfrage verbindlich?",
    antwort: "Nein. Er ist eine Schätzung auf Grundlage Ihrer Angaben. Den verbindlichen Preis nennt Ihnen die Druckerei mit dem Angebot.",
  },
  {
    thema: "Ungefährer Preis",
    frage: "Warum sehe ich in der Anfrage keinen Preis?",
    antwort: "Der Preisrechner ist nur bei Produkten eingeschaltet, für die die Druckerei einen Artikel hinterlegt hat. Fehlt „Ungefähren Preis anzeigen“, klappt Ihre Anfrage trotzdem, und die Druckerei nennt Ihnen den Preis im Angebot.",
  },
  {
    thema: "Sicherheit & Datenschutz",
    frage: "Wo werden meine Daten gespeichert und wer sieht sie?",
    antwort: "Dateien und Auftragsdaten sind nur für Sie und das Team der Druckerei sichtbar; jede Datei wird auf Viren geprüft. Wo die Daten gespeichert werden und welche Dienstleister beteiligt sind, steht in der Datenschutzerklärung.",
  },
  {
    thema: "Sicherheit & Datenschutz",
    frage: "Wird künstliche Intelligenz eingesetzt?",
    antwort: "Ja, für den Abschnitt „Automatischer Hinweis“: Ein KI-Modell auf EU-Servern fasst Ihre Anfrage und die Prüfergebnisse kurz zusammen und schlägt eine Produktkategorie vor. Über den Auftrag entscheiden immer Menschen in der Druckerei.",
  },
  {
    thema: "Für KI-Assistenten",
    frage: "Kann ein KI-Assistent (z. B. ChatGPT, Claude, Copilot) für mich Druckdaten hochladen?",
    antwort: `Ein Assistent kann Ihre Daten vorbereiten und über die Anfrage-Schnittstelle (/api/docs) einen Entwurf mit Beschreibung und Dateien anlegen. Bestätigen und freigeben müssen Sie selbst: Beides verlangt einen ${FAKTEN.codeStellen}-stelligen Code aus Ihrem E-Mail-Postfach. Der Assistent gibt Ihnen dazu einen Link, unter dem Sie die Anfrage ansehen und bestätigen. Partnersysteme nutzen nach Vereinbarung die Partner-API.`,
  },
  {
    thema: "Für KI-Assistenten",
    frage: "Gibt es eine maschinenlesbare Fassung dieser Hilfe?",
    antwort: "Ja. /llms.txt ist ein Überblick mit Links, /llms-full.txt enthält die komplette Hilfe als Markdown. Jede Hilfeseite gibt es zusätzlich als Markdown, wenn Sie „.md“ an die Adresse anhängen (z. B. /hilfe/kunden/druckdaten-hochladen.md).",
  },
];

// ---------- Zugriffshilfen ----------

export function kursFuer(slug: string): Kurs | undefined {
  return KURSE.find((k) => k.slug === slug);
}

export function lektionFuer(kursSlug: string, lektionSlug: string): { kurs: Kurs; lektion: Lektion; index: number } | undefined {
  const kurs = kursFuer(kursSlug);
  if (!kurs) return undefined;
  const index = kurs.lektionen.findIndex((l) => l.slug === lektionSlug);
  if (index < 0) return undefined;
  return { kurs, lektion: kurs.lektionen[index], index };
}

export function lektionsPfad(kurs: KursSlug | Kurs, lektion: string | Lektion): string {
  const k = typeof kurs === "string" ? kurs : kurs.slug;
  const l = typeof lektion === "string" ? lektion : lektion.slug;
  return `/hilfe/${k}/${l}`;
}

export function kursMinuten(kurs: Kurs): number {
  return kurs.lektionen.reduce((s, l) => s + l.minuten, 0);
}

/** Alle Kurzanleitungen eines Kurses: die Hauptanleitung zuerst, dann die zu einzelnen Themenblöcken. */
export function kursDownloads(kurs: Kurs): Download[] {
  const liste = [...(kurs.download ? [kurs.download] : []), ...(kurs.weitereDownloads ?? []), ...kurs.lektionen.flatMap((l) => (l.download ? [l.download] : []))];
  return liste.filter((d, i) => liste.findIndex((x) => x.href === d.href) === i);
}

/** Die Kurzanleitung, die zu einer Lektion passt (eigene, sonst die des Kurses). */
export function lektionsDownload(kurs: Kurs, lektion: Lektion): Download | undefined {
  return lektion.download ?? kurs.download;
}

export const DOWNLOADS: Download[] = KURSE.flatMap(kursDownloads);
