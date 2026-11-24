/**
 * Beispieldaten der Vorschau-Umgebung (docs/vorschau.md). Läuft nur mit PREVIEW_MODE=1 und nie gegen die
 * Produktions-Adresse; jeder Schritt ist idempotent und fügt nur hinzu, was fehlt. Ein Fehler in einem
 * Schritt wird geloggt und stoppt weder die anderen Schritte noch die App.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { config } from "../config";
import { getPool, query } from "../db";
import { beispielSicherung } from "../kalkulation/beispieldaten";
import { KUNDEN_RICHTPREIS_KEY, PRODUKTZUORDNUNG_KEY, setzeKundenRichtpreisAktiv, speichereZuordnung } from "../kalkulation/kundenRichtpreis";
import { importieren, istLeer } from "../kalkulation/store";
import { getSetting, setSetting } from "../settings";
import { parseVorlage } from "../personalisierung/schema";
import { checkStorage } from "../storage";
import { pruefeSeedErlaubnis } from "./modus";
import { openSansBytes } from "./schriften";

const VON = "vorschau";
const SPERR_SCHLUESSEL = 7_346_011; // pg_advisory_lock: nur ein Seed gleichzeitig (mehrere Instanzen)
export const PERS_MARKER_KEY = "vorschau.personalisierung";

/** Mitarbeiter-Konten anlegen bzw. auf Rolle staff setzen (E-Mail verifiziert). Keine anderen Nutzer. */
export async function seedMitarbeiter(emails: readonly string[]): Promise<number> {
  let n = 0;
  for (const email of emails) {
    const name = email.split("@")[0];
    await query(
      `INSERT INTO "user" (id, email, name, "emailVerified", role, status)
       VALUES (gen_random_uuid(), $1, $2, true, 'staff', 'customer')
       ON CONFLICT (email) DO UPDATE SET role = 'staff', "emailVerified" = true, "updatedAt" = now()
        WHERE "user".role IS DISTINCT FROM 'staff' OR "user"."emailVerified" IS DISTINCT FROM true`,
      [email, name],
    );
    n++;
  }
  return n;
}

/** Kalkulations-Stammdaten laden, wenn noch keine vorhanden sind. */
export async function seedKalkulation(): Promise<"geladen" | "vorhanden"> {
  if (!(await istLeer())) return "vorhanden";
  const heute = new Date().toISOString().slice(0, 10);
  const r = await importieren(beispielSicherung(heute), VON);
  if (!r.ok) throw new Error(r.meldungen.join("; "));
  return "geladen";
}

/** Richtpreis für Kunden an und Produktzuordnung der freigegebenen Beispielartikel (nur, wenn nie gesetzt). */
export async function seedRichtpreis(): Promise<void> {
  if (!(await getSetting(KUNDEN_RICHTPREIS_KEY))) await setzeKundenRichtpreisAktiv(true, VON);
  if (!(await getSetting(PRODUKTZUORDNUNG_KEY))) {
    const r = await speichereZuordnung({ flyer: ["A-FLYER"], "business-card": ["A-VISITENKARTE"] }, VON);
    if (!r.ok) throw new Error(r.fehler.join("; "));
  }
}

/** Beispielvorlage (Visitenkarte): Spezifikation ohne Design-Datei-ID. */
export function beispielVorlage(designDateiId: string, schriftFamilie = "Open Sans") {
  const schrift = { familie: schriftFamilie };
  const r = parseVorlage({
    name: "Visitenkarte (Beispiel)",
    beschreibung: "Beispielvorlage der Vorschau-Umgebung: Name, Funktion, Telefon und E-Mail eintragen, Druck-PDF erzeugen.",
    endformat: { breite: 85, hoehe: 55 },
    beschnitt: 3,
    design: { dateiId: designDateiId, vorne: 1, hinten: 2, mitBeschnitt: true },
    variablen: [
      { schluessel: "name", bezeichnung: "Name", pflicht: true, beispiel: "Erika Mustermann", maxLaenge: 40 },
      { schluessel: "funktion", bezeichnung: "Funktion", beispiel: "Geschäftsführerin" },
      { schluessel: "telefon", bezeichnung: "Telefon", beispiel: "07071 12345" },
      { schluessel: "email", bezeichnung: "E-Mail", beispiel: "erika@example.com" },
    ],
    felder: [
      { typ: "text", id: "name", name: "Name", x: 8, y: 14, breite: 60, hoehe: 7, vorlage: "{{name}}", schrift: { ...schrift, fett: true }, groesse: 12, verkleinernBis: 8, umbruch: "einzeilig" },
      { typ: "text", id: "kontakt", name: "Kontakt", x: 8, y: 26, breite: 60, hoehe: 18, vorlage: "{{funktion}}\nTel. {{telefon}}\n{{email}}", schrift, groesse: 8 },
      { typ: "qr", id: "qr", name: "QR", seite: "hinten", x: 65, y: 35, breite: 15, hoehe: 15, inhalt: "mailto:{{email}}" },
    ],
    ausgabe: { modus: "ausgeschossen", bogen: { breite: 320, hoehe: 450 }, rand: { oben: 5, unten: 5, links: 5, rechts: 5 }, abstand: { spalten: 0, zeilen: 0 } },
  });
  if (!r.ok) throw new Error("Beispielvorlage ungültig: " + r.fehler.map((f) => `${f.pfad}: ${f.text}`).join("; "));
  return r.vorlage;
}

/** Kleines selbst erzeugtes Design-PDF, 91 × 61 mm (85 × 55 mm plus 3 mm Beschnitt), Vorder- und Rückseite. */
export async function beispielDesign(): Promise<Uint8Array> {
  const mm = (v: number) => (v * 72) / 25.4;
  const doc = await PDFDocument.create();
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  for (const seite of [0, 1]) {
    const p = doc.addPage([mm(91), mm(61)]);
    p.drawRectangle({ x: 0, y: 0, width: mm(91), height: mm(61), color: seite ? rgb(0.13, 0.27, 0.45) : rgb(0.97, 0.96, 0.93) });
    p.drawRectangle({ x: 0, y: mm(50), width: mm(91), height: mm(11), color: rgb(0.13, 0.27, 0.45) });
    p.drawText(seite ? "Beispiel Druckerei" : "Vorschau", { x: mm(8), y: mm(53), size: 11, font: fett, color: rgb(1, 1, 1) });
    if (!seite) p.drawText("Beispieldesign – nicht für den Druck", { x: mm(8), y: mm(6), size: 6, font: normal, color: rgb(0.4, 0.4, 0.4) });
  }
  return doc.save();
}

/** Personalisierung: Beispielvorlage mit freier Schrift, aktiv und öffentlich per Link; der Link steht im Log. */
export async function seedPersonalisierung(): Promise<"angelegt" | "vorhanden" | "uebersprungen"> {
  const speicher = await checkStorage();
  if (!speicher.ok) {
    console.warn(`[vorschau] Speicher (S3) nicht erreichbar, Personalisierungs-Beispiel übersprungen: ${speicher.detail}`);
    return "uebersprungen";
  }
  const repo = await import("../personalisierung/repo");
  const marker = await getSetting(PERS_MARKER_KEY);
  if (marker) {
    try {
      const m = JSON.parse(marker.value) as { vorlageId: string; linkId: string };
      if (await repo.holeVorlage(m.vorlageId)) {
        const token = await repo.holeLinkToken(m.linkId, m.vorlageId);
        if (token) console.info(`[vorschau] Personalisierung (Beispiel): ${config.appBaseUrl.replace(/\/+$/, "")}/personalisieren/${token}`);
        return "vorhanden";
      }
    } catch {
      /* Marker unbrauchbar: neu anlegen */
    }
  }
  const schriften = await repo.listeSchriften();
  for (const schnitt of ["regular", "bold"] as const) {
    if (!schriften.some((s) => s.familie === "Open Sans" && s.schnitt === schnitt)) {
      await repo.speichereSchrift(openSansBytes(schnitt), { dateiname: `OpenSans-${schnitt === "bold" ? "Bold" : "Regular"}.ttf`, familie: "Open Sans", schnitt, userId: null });
    }
  }
  const { datei } = await repo.speichereDatei("design", "visitenkarte-beispiel.pdf", await beispielDesign(), null);
  // Selbst erzeugte Dateien sind unbedenklich: ein ausstehender Batch-Scan darf das Aktivieren nicht blockieren.
  await query(`UPDATE pers_files SET scan_status = 'CLEAN', scan_detail = NULL WHERE id = $1 AND scan_status <> 'INFECTED'`, [datei.id]);
  await query(`UPDATE pers_fonts SET scan_status = 'CLEAN', scan_detail = NULL WHERE family = 'Open Sans' AND scan_status <> 'INFECTED'`);
  const vorlage = await repo.erstelleVorlage(beispielVorlage(datei.id), { userId: null, status: "aktiv", sichtbarkeit: "oeffentlich", importQuelle: VON });
  const { link, token } = await repo.erstelleLink(vorlage.id, { label: "Vorschau", ablaufTage: null, userId: null });
  await setSetting(PERS_MARKER_KEY, JSON.stringify({ vorlageId: vorlage.id, linkId: link.id }), VON);
  console.info(`[vorschau] Personalisierung (Beispiel): ${config.appBaseUrl.replace(/\/+$/, "")}/personalisieren/${token}`);
  return "angelegt";
}

async function schritt<T>(name: string, fn: () => Promise<T>): Promise<void> {
  try {
    const r = await fn();
    console.info(`[vorschau] ${name}: ${r ?? "ok"}`);
  } catch (err) {
    console.error(`[vorschau] ${name} fehlgeschlagen:`, err instanceof Error ? err.message : err);
  }
}

/** Alle Seed-Schritte; Fehler werden geloggt, nie geworfen. */
export async function seedVorschau(env: Record<string, string | undefined> = process.env): Promise<void> {
  const erlaubnis = pruefeSeedErlaubnis(env);
  if (!erlaubnis.ok) {
    console.error(`[vorschau] Seed verweigert: ${erlaubnis.grund}`);
    return;
  }
  let client;
  try {
    client = await getPool().connect();
    await client.query("SELECT pg_advisory_lock($1)", [SPERR_SCHLUESSEL]);
  } catch (err) {
    console.error("[vorschau] Seed nicht gestartet (Datenbank nicht erreichbar):", err instanceof Error ? err.message : err);
    client?.release();
    return;
  }
  try {
    console.info("[vorschau] Vorschau-Modus aktiv, lege Beispieldaten an");
    if (config.preview.staffEmails.length === 0) console.warn("[vorschau] PREVIEW_STAFF_EMAILS ist leer: kein Mitarbeiter-Konto, keine Anmeldung im Backoffice möglich");
    await schritt("Mitarbeiter", () => seedMitarbeiter(config.preview.staffEmails));
    await schritt("Kalkulation", seedKalkulation);
    await schritt("Richtpreis", seedRichtpreis);
    await schritt("Personalisierung", seedPersonalisierung);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [SPERR_SCHLUESSEL]);
    } finally {
      client.release();
    }
  }
}
