/**
 * Vorschau-Modus (docs/vorschau.md): Schalter und Schutzregeln, rein und ohne Seiteneffekte.
 *
 * Der Modus ist für eine getrennte Vorschau-Umgebung gedacht (leere Datenbank, eigener Speicher, keine
 * Produktionsdaten). Er ist nur aktiv, wenn PREVIEW_MODE=1 gesetzt ist. Diese Datei darf weder config.ts
 * noch Datenbank oder Netzwerk laden, damit config.ts sie importieren kann.
 */

/** Hosts der Produktion: Dort legt der Vorschau-Modus nie Beispieldaten an. */
export const PRODUKTIONS_HOSTS = ["druck-s.de", "www.druck-s.de"] as const;

type Env = Record<string, string | undefined>;

/** PREVIEW_MODE=1 (oder "true"); Standard aus. */
export function vorschauAktiv(env: Env = process.env): boolean {
  const roh = (env.PREVIEW_MODE ?? "").trim().toLowerCase();
  return roh === "1" || roh === "true";
}

/** Zeigt die Adresse auf die Produktion (druck-s.de, www.druck-s.de)? Ungültige Adressen zählen als unbedenklich. */
export function istProduktionsUrl(url: string | undefined | null): boolean {
  const roh = (url ?? "").trim();
  if (!roh) return false;
  let host = "";
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(roh) ? roh : `https://${roh}`).hostname;
  } catch {
    return false;
  }
  host = host.toLowerCase().replace(/\.$/, "");
  return (PRODUKTIONS_HOSTS as readonly string[]).includes(host);
}

export type SeedErlaubnis = { ok: true } | { ok: false; grund: string };

/** Darf die Seed-Logik laufen? Nur im Vorschau-Modus und nie gegen die Produktions-Adresse. */
export function pruefeSeedErlaubnis(env: Env = process.env): SeedErlaubnis {
  if (!vorschauAktiv(env)) return { ok: false, grund: "PREVIEW_MODE ist nicht aktiv." };
  for (const name of ["APP_BASE_URL", "BETTER_AUTH_URL"]) {
    if (istProduktionsUrl(env[name])) {
      return {
        ok: false,
        grund: `${name} zeigt auf die Produktion (${env[name]}). Der Vorschau-Modus legt dort keine Beispieldaten an – bitte nur in einer eigenen Vorschau-Umgebung verwenden.`,
      };
    }
  }
  return { ok: true };
}

/** PREVIEW_STAFF_EMAILS: kommagetrennt, klein geschrieben, ohne Dubletten; offensichtlich ungültige Einträge entfallen. */
export function vorschauStaffEmails(env: Env = process.env): string[] {
  const liste = (env.PREVIEW_STAFF_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return [...new Set(liste)];
}

export const VORSCHAU_BETREFF_PRAEFIX = "[Vorschau] ";

/** Betreff mit Präfix (nicht doppelt). */
export function vorschauBetreff(betreff: string): string {
  return betreff.startsWith(VORSCHAU_BETREFF_PRAEFIX) ? betreff : VORSCHAU_BETREFF_PRAEFIX + betreff;
}

/** Hinweistext des Banners. */
export const VORSCHAU_BANNER_TEXT = "Vorschau-Umgebung – nur Beispieldaten, keine echten Aufträge";

function adressen(wert: string | string[] | undefined): string[] {
  const liste = Array.isArray(wert) ? wert : wert ? [wert] : [];
  return liste.flatMap((a) => a.split(",")).map((a) => a.trim()).filter((a) => a.length > 0);
}

/** Reine Adresse aus „Name <adresse>“ (klein geschrieben). */
export function reineAdresse(eintrag: string): string {
  const m = /<([^>]+)>/.exec(eintrag);
  return (m ? m[1] : eintrag).trim().toLowerCase();
}

/**
 * Empfänger einer Mail auf das in der Vorschau Erlaubte beschränken: Mitarbeiter-Adressen
 * (PREVIEW_STAFF_EMAILS) und Adressen, die im Ablauf selbst eingegeben wurden (`bekannt`).
 */
export async function filtereEmpfaenger(
  mail: { to: string | string[]; cc?: string | string[]; bcc?: string | string[] },
  staff: readonly string[],
  bekannt: (adresse: string) => Promise<boolean>,
): Promise<{ to: string[]; cc: string[]; bcc: string[]; verworfen: number }> {
  let verworfen = 0;
  const cache = new Map<string, boolean>();
  async function ok(eintrag: string): Promise<boolean> {
    const a = reineAdresse(eintrag);
    if (staff.includes(a)) return true;
    if (!cache.has(a)) cache.set(a, await bekannt(a));
    return cache.get(a)!;
  }
  async function filter(wert: string | string[] | undefined): Promise<string[]> {
    const aus: string[] = [];
    for (const e of adressen(wert)) {
      if (await ok(e)) aus.push(e);
      else verworfen++;
    }
    return aus;
  }
  return { to: await filter(mail.to), cc: await filter(mail.cc), bcc: await filter(mail.bcc), verworfen };
}
