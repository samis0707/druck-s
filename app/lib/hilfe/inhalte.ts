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
  thema: "Zugang" | "Hochladen" | "Prüfung" | "Freigabe & Versand" | "Sicherheit & Datenschutz" | "Für KI-Assistenten";
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

const ALLGEMEIN_ZUGANG = `Hochladen können Kundinnen und Kunden, deren E-Mail-Adresse bei der Druckerei hinterlegt und freigeschaltet ist. Neu hier? Fragen Sie die Druckerei nach einem Zugang oder einem Einmal-Upload-Link.`;

export const KURSE: Kurs[] = [
  {
    slug: "kunden",
    titel: "Druckdaten hochladen und freigeben",
    zielgruppe: "Für Kundinnen und Kunden",
    beschreibung:
      "Vom Hochladen über die automatische Vorprüfung bis zur Freigabe und zum Versand: alles, was Sie für Ihren Druckauftrag im dmp druckraum brauchen.",
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
        minuten: 2,
      },
    ],
  },
  {
    slug: "druckerei",
    titel: "Aufträge bearbeiten im Staff-Bereich",
    zielgruppe: "Für die Druckerei (Staff)",
    beschreibung:
      "Für Vorstufe, Kundenberatung und Versand: Aufträge sichten, Befunde prüfen, zur Freigabe senden, Versand erfassen und Kunden freischalten.",
    kurz: "Schulung für das Team der Druckerei: Triage, Befunde, Freigabe, Rechnung und Versand, Kundenfreischaltung und Einmal-Links.",
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
          "Filtern Sie nach Status und Herkunft („Verifiziert“, „Per Link“) oder schalten Sie „Nur: braucht Blick“ ein.",
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
        minuten: 2,
      },
      {
        slug: "kunden-und-links",
        titel: "Kunden freischalten und Einmal-Links erstellen",
        kurz: "Unter „Kunden & Links“ Interessenten freischalten, Konten deaktivieren und Einmal-Upload-Links für neue Kunden erzeugen.",
        einleitung:
          "Nur freigeschaltete Kunden können selbst hochladen. Für alle anderen erzeugen Sie einen Einmal-Upload-Link.",
        schritte: [
          "Klicken Sie in „Aufträge“ oben auf „Kunden & Links“.",
          "Für einen Einmal-Link: E-Mail-Adresse unter „Einmal-Upload-Link“ eintragen und „Link erstellen“ klicken; den Link an den Kunden schicken.",
          "Für einen festen Zugang: in der Kundenliste bei Status „Interessent“ auf „Freischalten“ klicken.",
          "Um einen Zugang zu sperren: „Deaktivieren“ klicken und „Konto wirklich deaktivieren?“ bestätigen.",
        ],
        gutZuWissen: `Ein Einmal-Link gilt ${FAKTEN.einmalLinkTage} Tage und verfällt beim Senden. Aufträge über einen Link tragen in der Liste das Kennzeichen „Per Link“.`,
        bilder: [{ name: "druckerei-kunden", alt: "Seite „Kunden & Links“ mit Einmal-Upload-Link, Historien-Import und Kundenliste" }],
        ausprobieren: { href: "/staff/customers", label: "Zu „Kunden & Links“" },
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
            inhalt: `curl -sS https://druck-s.de/api/partner/requests \\
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
            inhalt: `curl -sS https://druck-s.de/api/partner/requests/bestellung-2026-0042 \\
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
    antwort: `Nein, ein Passwort oder eine Registrierung gibt es nicht. Ihre E-Mail-Adresse muss aber bei der Druckerei hinterlegt und freigeschaltet sein; nach dem Hochladen bestätigen Sie mit einem ${FAKTEN.codeStellen}-stelligen Code aus Ihrer E-Mail. Ohne Zugang hilft ein Einmal-Upload-Link der Druckerei.`,
  },
  {
    thema: "Zugang",
    frage: "Ich bekomme keinen Code. Was kann ich tun?",
    antwort: `Prüfen Sie den Spam-Ordner und ob die E-Mail-Adresse richtig geschrieben ist. Der Code gilt ${FAKTEN.codeGueltigMin} Minuten — fordern Sie bei Bedarf mit „Code senden“ einen neuen an. Ist Ihre Adresse nicht freigeschaltet, wird kein Code verschickt; dann wenden Sie sich an die Druckerei.`,
  },
  {
    thema: "Zugang",
    frage: "Wie bekomme ich einen Zugang?",
    antwort: "Rufen Sie die digitale medien print gmbh an oder schreiben Sie eine E-Mail (siehe Kontakt). Die Druckerei schaltet Ihre Adresse frei oder schickt Ihnen einen Einmal-Upload-Link.",
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
    antwort: `Ein Assistent kann Sie durch das Hochladen führen und Ihre Daten vorbereiten. Bestätigen und freigeben müssen Sie selbst: Beides verlangt einen ${FAKTEN.codeStellen}-stelligen Code aus Ihrem E-Mail-Postfach. Eine öffentliche API für Endkunden gibt es nicht; Partnersysteme nutzen nach Vereinbarung die Partner-API.`,
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

export const DOWNLOADS: Download[] = KURSE.flatMap((k) => (k.download ? [k.download] : []));
