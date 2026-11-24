/** Mail-Schutz der Vorschau-Umgebung: nur Mitarbeiter und im Ablauf eingegebene Adressen, Betreff mit Präfix. */
import { query } from "../db";
import type { OutboundMail } from "../mailTransport";
import { filtereEmpfaenger, vorschauBetreff } from "./modus";

/** Wurde die Adresse in dieser Umgebung selbst eingegeben (Konto/Interessent oder Bestätigungscode einer Anfrage)? */
export async function adresseBekannt(adresse: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM "user" WHERE lower(email) = $1
     UNION ALL SELECT 1 FROM inquiry_codes WHERE lower(email) = $1
     LIMIT 1`,
    [adresse],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Mail für die Vorschau vorbereiten: Betreff-Präfix, Empfänger eingeschränkt. null = kein Empfänger übrig
 * (die Mail wird nicht versendet).
 */
export async function vorschauMail(
  mail: OutboundMail,
  staff: readonly string[],
  bekannt: (adresse: string) => Promise<boolean> = adresseBekannt,
): Promise<{ mail: OutboundMail; verworfen: number } | null> {
  const e = await filtereEmpfaenger(mail, staff, bekannt);
  if (e.to.length === 0 && e.cc.length === 0 && e.bcc.length === 0) return null;
  return {
    verworfen: e.verworfen,
    mail: {
      ...mail,
      // Ohne Hauptempfänger rückt die erste Kopie nach, damit der Transport nie eine leere Liste bekommt.
      to: e.to.length > 0 ? e.to : (e.cc.length > 0 ? e.cc : e.bcc).slice(0, 1),
      cc: e.to.length > 0 ? e.cc : e.cc.slice(1),
      bcc: e.to.length > 0 || e.cc.length > 0 ? e.bcc : e.bcc.slice(1),
      subject: vorschauBetreff(mail.subject),
    },
  };
}
