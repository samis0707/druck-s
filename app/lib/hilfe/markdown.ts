/**
 * Markdown-Fassungen der Hilfe für KI-Assistenten und Agenten (llms.txt-Konvention, https://llmstxt.org).
 * Alles wird aus lib/hilfe/inhalte.ts erzeugt — keine zweite Textquelle.
 */
import { company } from "@/lib/company";
import {
  ABLAUF,
  FAKTEN,
  FRAGEN,
  GLOSSAR,
  KURSE,
  PRODUKT,
  STATUS_ERKLAERT,
  kursMinuten,
  lektionsPfad,
  type Frage,
  type Kurs,
  type Lektion,
} from "./inhalte";
import { HILFE_STAND, absolut } from "./site";

const THEMEN: Frage["thema"][] = [
  "Zugang",
  "Hochladen",
  "Prüfung",
  "Freigabe & Versand",
  "Sicherheit & Datenschutz",
  "Für KI-Assistenten",
];

function liste(punkte: string[]): string {
  return punkte.map((p) => `- ${p}`).join("\n");
}

function nummeriert(punkte: string[]): string {
  return punkte.map((p, i) => `${i + 1}. ${p}`).join("\n");
}

function kontaktZeilen(): string {
  return [
    `- Anbieter: ${company.name}, ${company.street}, ${company.zip} ${company.city}`,
    `- Telefon: ${company.phone}`,
    `- E-Mail: ${company.email}`,
    `- Erreichbar: ${company.hours.map((h) => `${h.days} ${h.time}`).join("; ")}`,
  ].join("\n");
}

/** Eine Lektion als Markdown (Überschriftenebene einstellbar, damit sie in llms-full.txt passt). */
export function lektionMarkdown(kurs: Kurs, lektion: Lektion, ebene = 1): string {
  const h = (n: number) => "#".repeat(ebene + n);
  const teile: string[] = [
    `${h(0)} ${lektion.titel}`,
    `> ${lektion.kurz}`,
    `Kurs: ${kurs.titel} (${kurs.zielgruppe}) · Quelle: ${absolut(lektionsPfad(kurs, lektion))}`,
    lektion.einleitung,
    `${h(1)} Schritt für Schritt`,
    nummeriert(lektion.schritte),
  ];
  for (const d of lektion.details ?? []) teile.push(`${h(1)} ${d.titel}`, liste(d.punkte));
  if (lektion.gutZuWissen) teile.push(`${h(1)} Gut zu wissen`, lektion.gutZuWissen);
  for (const c of lektion.code ?? []) teile.push(`${h(1)} ${c.titel}`, "```" + c.sprache + "\n" + c.inhalt + "\n```");
  if (lektion.quiz) {
    const richtig = lektion.quiz.antworten.find((a) => a.richtig)?.text ?? "";
    teile.push(`${h(1)} Kurz geprüft`, `**${lektion.quiz.frage}** ${richtig} ${lektion.quiz.erklaerung}`);
  }
  if (lektion.ausprobieren) teile.push(`In der App: [${lektion.ausprobieren.label}](${absolut(lektion.ausprobieren.href)})`);
  return teile.join("\n\n") + "\n";
}

export function kursMarkdown(kurs: Kurs, mitLektionen = false, ebene = 1): string {
  const h = (n: number) => "#".repeat(ebene + n);
  const teile = [
    `${h(0)} ${kurs.titel}`,
    `> ${kurs.beschreibung}`,
    `${kurs.zielgruppe} · ${kurs.lektionen.length} Lektionen · ca. ${kursMinuten(kurs)} Minuten · ${absolut(`/hilfe/${kurs.slug}`)}`,
  ];
  if (kurs.download) teile.push(`PDF: [${kurs.download.titel}](${absolut(kurs.download.href)}) — ${kurs.download.beschreibung}`);
  if (mitLektionen) {
    for (const l of kurs.lektionen) teile.push(lektionMarkdown(kurs, l, ebene + 1).trim());
  } else {
    teile.push(
      `${h(1)} Lektionen`,
      kurs.lektionen.map((l) => `- [${l.titel}](${absolut(lektionsPfad(kurs, l))}.md): ${l.kurz}`).join("\n"),
    );
  }
  return teile.join("\n\n") + "\n";
}

export function fragenMarkdown(ebene = 2): string {
  const h = "#".repeat(ebene);
  return THEMEN.map((thema) => {
    const fragen = FRAGEN.filter((f) => f.thema === thema);
    return `${h} ${thema}\n\n` + fragen.map((f) => `${h}# ${f.frage}\n\n${f.antwort}`).join("\n\n");
  }).join("\n\n");
}

function faktenMarkdown(): string {
  return liste([
    `Maximale Dateigröße: ${FAKTEN.maxDateiMb} MB je Datei, mehrere Dateien je Auftrag`,
    `Dateitypen: ${FAKTEN.dateitypen}`,
    `Empfohlener Anschnitt: ${FAKTEN.anschnittMm} mm; empfohlene Bildauflösung: ${FAKTEN.aufloesungDpi} dpi; Farbmodus CMYK; Schriften eingebettet`,
    `Bestätigung und Freigabe: ${FAKTEN.codeStellen}-stelliger Code per E-Mail, gültig ${FAKTEN.codeGueltigMin} Minuten`,
    `Nicht bestätigte Uploads werden nach ${FAKTEN.entwurfGueltigMin} Minuten verworfen`,
    `Einmal-Upload-Link: gültig ${FAKTEN.einmalLinkTage} Tage, verfällt beim Senden`,
    "Kein Passwort, keine Registrierung: Zugang über freigeschaltete E-Mail-Adresse und Code",
  ]);
}

/** /llms.txt — kurzer Einstieg mit Links (llmstxt.org-Format). */
export function llmsTxt(): string {
  return [
    `# ${PRODUKT.name}`,
    `> ${PRODUKT.satz} Kundinnen und Kunden laden Dateien hoch, erhalten sofort eine automatische Druckdaten-Prüfung (Anschnitt, Schriften, Auflösung, Farbmodus, Virenscan) und geben ihren Auftrag per E-Mail-Code frei.`,
    `Sprache: Deutsch. Stand: ${HILFE_STAND}. Die komplette Hilfe als eine Datei: ${absolut("/llms-full.txt")}. Jede Hilfeseite gibt es als Markdown, wenn „.md“ an die Adresse angehängt wird.`,
    "## Wichtige Fakten",
    faktenMarkdown(),
    "## Hinweise für KI-Assistenten",
    liste([
      `Freigeschaltete Kundinnen und Kunden laden unter ${absolut("/upload")} hoch. Wer neu ist, stellt eine Anfrage ohne Kundenkonto unter ${absolut("/anfrage")} oder über die Schnittstelle (nächster Abschnitt).`,
      "Bestätigen und Freigeben verlangen einen Code aus dem E-Mail-Postfach der Kundin oder des Kunden — ein Assistent kann das nicht ersetzen und soll nicht nach dem Code fragen, um ihn selbst einzugeben, außer der Mensch bittet ausdrücklich darum.",
      "Partnersysteme nutzen nach Vereinbarung die Partner-API (siehe unten).",
      `Bereiche hinter Anmeldung (/requests, /konto, /staff) enthalten persönliche Auftragsdaten und sind nicht zum Crawlen gedacht.`,
      `Bei Fragen zu Preisen, Lieferzeiten oder Papieren: an die Druckerei verweisen (${company.phone}, ${company.email}).`,
    ]),
    "## Anfrage über die Schnittstelle",
    liste([
      `Beschreibung als OpenAPI 3.1: ${absolut("/api/v1/openapi.json")}. Oberfläche zum Lesen und Ausprobieren: ${absolut("/api/docs")}. Ohne Anmeldung, ohne Schlüssel.`,
      "Schritt 1: `POST /api/v1/inquiries` mit JSON `{ \"product\", \"description\", \"contact\": { \"name\", \"email\", \"organisation\"?, \"phone\"? } }` legt einen Entwurf an und liefert `inquiry.id` und `inquiry.confirmUrl`. Erlaubte Werte für `product`: `GET /api/v1/products`.",
      "Schritt 2 (optional): `POST /api/v1/inquiries/{id}/files` als `multipart/form-data`, Feld `file`, mehrfach möglich.",
      "Schritt 3: `POST /api/v1/inquiries/{id}/code` schickt einen sechsstelligen Code an die Kontakt-Adresse.",
      "Schritt 4: `POST /api/v1/inquiries/{id}/confirm` mit `{ \"code\": \"…\" }`. Erst jetzt ist die Anfrage bei der Druckerei eingegangen und hat eine Nummer.",
      "Ein Assistent darf die Schritte 1 bis 3 ausführen, wenn der Mensch ihn darum bittet. Vorher zeigt er, was er senden wird (Produkt, Beschreibung, Dateien, Kontakt), und erfindet keine Angaben. Schritt 4 gehört dem Menschen: Der Assistent nennt ihm `confirmUrl`; dort sieht er die Anfrage und gibt den Code selbst ein.",
      `Ein Entwurf verfällt nach ${FAKTEN.entwurfGueltigMin} Minuten, ein Code nach ${FAKTEN.codeGueltigMin} Minuten. Je Datei höchstens ${FAKTEN.maxDateiMb} MB, je Anfrage höchstens 20 Dateien.`,
      "Fehler kommen als JSON `{ \"error\", \"code\", \"details\"? }`. Bei `rate_limited` nicht wiederholen, sondern den Menschen an die Druckerei verweisen.",
      "Die Schnittstelle nennt keine Preise, Lieferzeiten oder Papiere und nimmt keine verbindlichen Aufträge an. Verbindlich wird ein Auftrag erst mit der Freigabe der Auftragsbestätigung im Portal.",
    ]),
    "## Online-Schulung",
    KURSE.map((k) => `- [${k.titel}](${absolut(`/hilfe/${k.slug}`)}.md): ${k.zielgruppe}. ${k.kurz}`).join("\n"),
    "## Lektionen",
    KURSE.flatMap((k) => k.lektionen.map((l) => `- [${l.titel}](${absolut(lektionsPfad(k, l))}.md): ${l.kurz}`)).join("\n"),
    "## Weitere Seiten",
    liste([
      `[Hilfe-Startseite mit Häufigen Fragen](${absolut("/hilfe")}.md)`,
      `[Druckdaten hochladen](${absolut("/upload")})`,
      `[Anfrage ohne Kundenkonto](${absolut("/anfrage")})`,
      `[Schnittstellen (Swagger)](${absolut("/api/docs")})`,
      `[Kontakt](${absolut("/kontakt")})`,
      `[Datenschutz](${absolut("/datenschutz")})`,
      `[Impressum](${absolut("/impressum")})`,
    ]),
    "## Optional",
    liste([
      `[Komplette Hilfe in einer Datei](${absolut("/llms-full.txt")})`,
      ...KURSE.flatMap((k) => (k.download ? [`[${k.download.titel} (PDF)](${absolut(k.download.href)})`] : [])),
    ]),
    "",
  ].join("\n\n");
}

/** /hilfe.md — Startseite der Hilfe als Markdown. */
export function hilfeStartMarkdown(): string {
  return [
    `# Hilfe & Schulung — ${PRODUKT.name}`,
    `> ${PRODUKT.satz}`,
    "## Der Ablauf im Überblick",
    nummeriert(ABLAUF.map((s) => `**${s.titel}** (${s.wer}): ${s.text}`)),
    "## Kurse",
    KURSE.map((k) => `- [${k.titel}](${absolut(`/hilfe/${k.slug}`)}.md) — ${k.zielgruppe}: ${k.kurz}`).join("\n"),
    "## Wichtige Fakten",
    faktenMarkdown(),
    "## Häufige Fragen",
    fragenMarkdown(3),
    "## Kontakt",
    kontaktZeilen(),
    "",
  ].join("\n\n");
}

/** /llms-full.txt — alles in einer Datei. */
export function llmsFullTxt(): string {
  return [
    `# ${PRODUKT.name} — vollständige Hilfe`,
    `> ${PRODUKT.satz}`,
    `Stand: ${HILFE_STAND}. Quelle: ${absolut("/hilfe")}. Sprache: Deutsch.`,
    "## Wichtige Fakten",
    faktenMarkdown(),
    "## Der Ablauf im Überblick",
    nummeriert(ABLAUF.map((s) => `**${s.titel}** (${s.wer}): ${s.text}`)),
    "## Status eines Auftrags",
    liste(STATUS_ERKLAERT.map((s) => `„${s.status}“ — ${s.bedeutung}`)),
    ...KURSE.map((k) => kursMarkdown(k, true, 2).trim()),
    "## Häufige Fragen",
    fragenMarkdown(3),
    "## Begriffe",
    liste(GLOSSAR.map((g) => `**${g.begriff}**: ${g.erklaerung}`)),
    "## Kontakt",
    kontaktZeilen(),
    "",
  ].join("\n\n");
}
