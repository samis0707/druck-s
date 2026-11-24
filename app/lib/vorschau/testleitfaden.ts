/**
 * Testleitfaden der Vorschau-Umgebung: einzige Quelle für die Seite /staff/vorschau-test und für
 * docs/vorschau-testleitfaden.md (ein Test prüft, dass beide übereinstimmen).
 * Markdown neu schreiben: LEITFADEN_SCHREIBEN=1 npx vitest run lib/vorschau/testleitfaden.test.ts
 */

export type Szenario = {
  id: string;
  buchstabe: string;
  titel: string;
  wo: string;
  tun: string[];
  erwartung: string[];
};

export type Abschnitt = {
  id: string;
  titel: string;
  absaetze?: string[];
  /** Aufzählung (nicht abhakbar). */
  punkte?: string[];
  /** Unterüberschriften mit Aufzählung (nur Entwickler-Abschnitt). */
  gruppen?: { titel: string; punkte: string[] }[];
  szenarien?: Szenario[];
};

export const LEITFADEN_TITEL = "Testleitfaden Vorschau-Umgebung";
export const LEITFADEN_UNTERTITEL = "Für Elysen Butz – Einbindung von kalpri in druck-s";

export const ABSCHNITTE: Abschnitt[] = [
  {
    id: "worum",
    titel: "Worum es geht",
    absaetze: [
      "Der Rechenkern von kalpri läuft jetzt in druck-s: Aus Artikel, Fragen und Auflage entstehen Kosten und daraus ein unverbindlicher Richtpreis, im Backoffice, für Kunden in der Anfrage und über eine Schnittstelle.",
      "Die Vorschau ist von der Produktion getrennt. Sie hat eine eigene, zunächst leere Datenbank mit Beispieldaten und eigenen Speicher. Es gibt keine Kundendaten und keine echten Aufträge.",
      "Du kennst kalpri und die Werkbank sehr gut. Neu ist die Einbindung. Teste vor allem, ob sich alles so verhält, wie Du es aus kalpri erwartest, und ob die Preisschicht von druck-s sinnvolle Zahlen daraus macht.",
    ],
  },
  {
    id: "einbindung",
    titel: "So ist kalpri eingebunden",
    absaetze: ["Für Dich als Entwickler, damit Du beim Weiterentwickeln von kalpri weißt, was in druck-s daran hängt."],
    gruppen: [
      {
        titel: "Rechenkern und Werkbank",
        punkte: [
          "Die Pakete units, layout-core und resources liegen unverändert vendoriert unter lib/kalpri/. Der Stand steht in lib/kalpri/HERKUNFT.json (kalpri-Commit ae8e558, sauberer Stand, Hash des Werkbank-Patches).",
          "scripts/kalpri-sync.mjs kopiert die Pakete aus einem lokalen kalpri-Repo und schreibt HERKUNFT.json. Einzige Änderung am Code: Der Import 'zod' wird zu 'zod/v3' umgeschrieben, weil druck-s auf zod 4 steht und der Kern die v3-API nutzt.",
          "Mit --werkbank baut das Skript die Werkbank mit lib/kalpri/werkbank.patch und legt sie unter vendor/kalpri-werkbank/ ab. Der Patch setzt den Basis-Pfad /staff/kalkulation/werkbank/, nutzt die Staff-Session statt eines API-Keys (Build mit VITE_SERVER_ADRESSE) und blendet die Verbindungsmaske aus.",
          "Die Werkbank wird nur an angemeldete Mitarbeitende ausgeliefert (Route unter /staff/kalkulation/werkbank/).",
        ],
      },
      {
        titel: "Ablage und Sicherung",
        punkte: [
          "Die Werkbank-Bereiche (z. B. werkbank.stanze.v1) liegen in Postgres. Geschrieben wird mit optimistischer Sperre: Bei veralteter Version antwortet der Server mit 409. Jede Änderung landet im unveränderlichen Verlauf.",
          "Das Sicherungsformat ist kompatibel (werkbank-sicherung): Import und Export gehen in beide Richtungen, also auch aus Deiner lokalen Werkbank nach druck-s und zurück.",
          "Beim Abmelden im Mitarbeiterbereich werden die lokalen Werkbank-Daten (werkbank.* im Browser-Speicher) gelöscht.",
        ],
      },
      {
        titel: "Preisschicht und Schnittstellen",
        punkte: [
          "kalpri liefert nur Kosten. Die Preisschicht in druck-s legt Zuschläge, Gewinn, Mindestpreis, Rundung, Spanne und MwSt darauf (Einstellungen unter /staff/kalkulation/einstellungen).",
          "Maschinen-API: /api/v1/kalkulation/* mit Bearer-Key. Key anlegen mit node scripts/kalkulation-key.mjs create \"<Name>\". Beschreibung unter /api/docs.",
          "Öffentliche Richtpreis-Endpunkte: GET /api/v1/richtpreis/artikel und POST /api/v1/richtpreis (mit Begrenzung pro IP).",
        ],
      },
      {
        titel: "Was Du beim Weiterentwickeln von kalpri beachten musst",
        punkte: [
          "Ablauf: Änderung in kalpri committen (sauberer Stand, sonst vermerkt HERKUNFT.json das), dann in druck-s node scripts/kalpri-sync.mjs <kalpri-repo> --werkbank ausführen, Ergebnis und HERKUNFT.json committen.",
          "Der Werkbank-Patch kann brechen, sobald sich server-sync.ts oder andere vom Patch berührte Dateien der Werkbank ändern. Dann den Patch gegen den neuen Stand neu erzeugen. Das Skript merkt sich den Hash des Patches.",
          "Die Tests laufen in druck-s mit (npm test). Ändert sich eine Kostenberechnung, schlagen Tests der Preisschicht und der Beispieldaten an. Das ist gewollt, dann prüfen und Erwartungswerte bewusst anpassen.",
          "Neue Bereiche oder Felder in der Werkbank: Sicherungsformat und Import in druck-s mitziehen, sonst gehen sie beim Einspielen verloren.",
        ],
      },
    ],
  },
  {
    id: "szenarien",
    titel: "Testszenarien",
    absaetze: ["Hake ab, was Du erledigt hast. Der Haken bleibt nur in diesem Browser gespeichert (kein Server)."],
    szenarien: [
      {
        id: "a",
        buchstabe: "A",
        titel: "Ad-hoc-Kalkulation",
        wo: "/staff/kalkulation",
        tun: [
          "Einen der Beispielartikel wählen (Flyer, Visitenkarten, Plakat).",
          "Die Fragen beantworten und eine Auflage eintragen.",
          "Den Rechenweg aufklappen und Kosten, Zuschläge und Richtpreis nachvollziehen.",
          "Auflage ändern und prüfen, ob sich Preis und Staffel plausibel verändern.",
        ],
        erwartung: [
          "Sofort ein Richtpreis netto mit Spanne und Bruttopreis.",
          "Der Rechenweg zeigt die Kosten aus kalpri und die Schritte der Preisschicht nachvollziehbar.",
          "Das Plakat ist nur intern und dem Kunden nicht angeboten.",
        ],
      },
      {
        id: "b",
        buchstabe: "B",
        titel: "Werkbank bearbeiten",
        wo: "/staff/kalkulation/werkbank/",
        tun: [
          "Die Werkbank öffnen. Es gibt keine Verbindungsmaske, Du bist über die Anmeldung verbunden.",
          "Etwas ändern, z. B. einen Papierpreis, und speichern.",
          "Zurück zu /staff/kalkulation: gleiche Kalkulation wie vorher neu rechnen und die Wirkung prüfen.",
          "Die Werkbank in zwei Tabs öffnen, in beiden denselben Bereich ändern, erst in Tab 1 speichern, dann in Tab 2.",
        ],
        erwartung: [
          "Die Änderung wirkt auf den Rechner, ohne dass Du etwas exportieren musst.",
          "In Tab 2 erscheint ein Konflikthinweis (Server antwortet 409), Deine Änderung überschreibt die erste nicht stillschweigend.",
        ],
      },
      {
        id: "c",
        buchstabe: "C",
        titel: "Sicherung herunterladen und einspielen",
        wo: "/staff/kalkulation/stammdaten und die Werkbank",
        tun: [
          "Eine Sicherung herunterladen.",
          "Etwas ändern und die Sicherung wieder einspielen. Zuerst die Vorschau der Übernahme ansehen, dann übernehmen.",
          "Eine eigene Sicherung aus Deiner lokalen kalpri-Werkbank (Format werkbank-sicherung) einspielen.",
          "Danach in der Werkbank und im Rechner prüfen, ob Deine Daten angekommen sind.",
        ],
        erwartung: [
          "Der Stand vor der Änderung ist wieder da.",
          "Die Vorschau der Übernahme nennt, was neu, geändert oder abgelehnt wird. Ungültige Sicherungen werden mit verständlicher Meldung abgelehnt.",
          "Deine lokale Sicherung lässt sich einspielen und lässt sich wieder exportieren.",
        ],
      },
      {
        id: "d",
        buchstabe: "D",
        titel: "Preis-Einstellungen und Kundenfreigabe",
        wo: "/staff/kalkulation/einstellungen",
        tun: [
          "Zuschläge, Gewinn, Mindestpreis, Rundung, Spanne oder MwSt ändern.",
          "Die Beispielrechnung auf der Seite prüfen und mit eigener Handrechnung vergleichen.",
          "Die Zuordnung Produkt zu Artikel ansehen und ändern.",
          "Den Schalter \"Richtpreis für Kunden anzeigen\" ein- und ausschalten.",
        ],
        erwartung: [
          "Die Beispielrechnung folgt den Einstellungen sofort. Rundung und Mindestpreis greifen wie beschrieben.",
          "Änderungen gelten für neue Berechnungen. Gespeicherte Richtpreise zu Anfragen behalten ihre damaligen Werte.",
          "Bei ausgeschaltetem Schalter sieht der Kunde keinen Richtpreis (Szenario E).",
        ],
      },
      {
        id: "e",
        buchstabe: "E",
        titel: "Richtpreis in der Kundenanfrage",
        wo: "/anfrage (als Gast, im privaten Fenster)",
        tun: [
          "Ein privates Browserfenster öffnen und /anfrage aufrufen.",
          "Ein zugeordnetes Produkt wählen und den Richtpreis anzeigen lassen.",
          "Die Anfrage mit Deiner eigenen Mailadresse absenden und den Code aus der Mail bestätigen.",
          "Im normalen Fenster im Backoffice die Anfrage öffnen.",
        ],
        erwartung: [
          "Der Kunde sieht einen unverbindlichen Richtpreis mit Spanne, klar als unverbindlich gekennzeichnet.",
          "Die Mail kommt an (Betreff mit [Vorschau]), weil die Adresse im Ablauf eingegeben wurde.",
          "Im Backoffice steht bei der Anfrage \"Richtpreis (unverbindlich)\" mit dem Wert vom Absenden.",
        ],
      },
      {
        id: "f",
        buchstabe: "F",
        titel: "Personalisierung",
        wo: "/staff/personalisierung",
        tun: [
          "Die Beispielvorlage (Visitenkarte) im Editor ansehen.",
          "Eine neue Vorlage aus einem eigenen PDF anlegen.",
          "Den Kundenlink im privaten Fenster öffnen und ausfüllen, einmal einzeln und einmal per Tabelle.",
          "Absenden und das erzeugte PDF öffnen.",
        ],
        erwartung: [
          "Der Editor zeigt Felder und Vorschau zur Vorlage.",
          "Das PDF enthält die eingetragenen Werte, die Barcodes sind Vektoren (scharf bei starkem Zoom) und der Beschnitt stimmt.",
          "Bei der Tabelle entsteht ein PDF mit allen Zeilen.",
        ],
      },
      {
        id: "g",
        buchstabe: "G",
        titel: "Hilfe",
        wo: "/hilfe",
        tun: [
          "Den Mitarbeiter-Kurs durchgehen.",
          "Die geführten Touren starten, z. B. unter /staff und /staff/kalkulation.",
          "Notieren, wo Du hängen bleibst oder etwas nicht stimmt.",
        ],
        erwartung: [
          "Texte und Schritte sind verständlich und passen zu dem, was Du auf dem Bildschirm siehst.",
          "Rückmeldung zur Verständlichkeit ist ausdrücklich erwünscht.",
        ],
      },
    ],
  },
  {
    id: "einschraenkungen",
    titel: "Bekannte Einschränkungen der Vorschau",
    punkte: [
      "Nur Beispiel-Stammdaten, keine echten DMP-Preise.",
      "Kein Virenscanner: Uploads werden ungeprüft angenommen.",
      "Mails gehen nur an Vorschau-Mitarbeitende und an Adressen, die im Ablauf selbst eingegeben wurden. Der Betreff beginnt mit \"[Vorschau]\".",
      "Bei jedem Push auf den Branch claude/magical-albattani-4nczto baut die Vorschau automatisch neu auf. Die Daten bleiben erhalten.",
      "Die Vorschau ist für Suchmaschinen gesperrt (noindex).",
    ],
  },
  {
    id: "rueckmeldung",
    titel: "Rückmeldung geben",
    absaetze: [
      "Notiere pro Fund kurz: Szenario-Buchstabe, Seite bzw. URL, was Du erwartet hast, was passiert ist und wenn möglich einen Screenshot. Schick das an Samis. Ein Ticket-System brauchst Du nicht.",
    ],
  },
];

/** Alle abhakbaren Einträge (Schlüssel für den lokalen Speicher). */
export function checklistenIds(): string[] {
  return ABSCHNITTE.flatMap((a) => (a.szenarien ?? []).flatMap((s) => s.tun.map((_, i) => `${s.id}-${i}`)));
}

/** Markdown-Fassung (docs/vorschau-testleitfaden.md). */
export function leitfadenMarkdown(): string {
  const z: string[] = [`# ${LEITFADEN_TITEL}`, "", LEITFADEN_UNTERTITEL, ""];
  for (const a of ABSCHNITTE) {
    z.push(`## ${a.titel}`, "");
    for (const p of a.absaetze ?? []) z.push(p, "");
    for (const p of a.punkte ?? []) z.push(`- ${p}`);
    if (a.punkte) z.push("");
    for (const g of a.gruppen ?? []) {
      z.push(`### ${g.titel}`, "");
      for (const p of g.punkte) z.push(`- ${p}`);
      z.push("");
    }
    for (const s of a.szenarien ?? []) {
      z.push(`### ${s.buchstabe}: ${s.titel}`, "", `Wo: ${s.wo}`, "", "Was tun:", "");
      for (const t of s.tun) z.push(`- [ ] ${t}`);
      z.push("", "Das sollte passieren:", "");
      for (const e of s.erwartung) z.push(`- ${e}`);
      z.push("");
    }
  }
  return z.join("\n").replace(/\n+$/, "\n");
}
