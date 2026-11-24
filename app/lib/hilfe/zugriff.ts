/**
 * Wer darf welche Hilfe sehen? Zentrale, reine Regeln (keine Server-Abhängigkeiten, daher auch im Browser importierbar).
 *
 * Zielgruppen der Kurse:
 * - `oeffentlich`: Gäste ohne Konto und Kunden (Kurs „kunden“).
 *   Bewusste Entscheidung: auch der Partner-Kurs („partner“, Schnittstellen-Doku) bleibt öffentlich — Partner haben
 *   kein Login, und die API-Beschreibung steht ohnehin öffentlich unter /api/docs und /api/v1/openapi.json.
 * - `mitarbeiter`: nur angemeldete Mitarbeitende (Rolle staff) — Kurs „druckerei“ samt PDFs, Screenshots und Tour-Texten.
 *
 * Die Prüfung mit der Sitzung steht in zugriff-server.ts; erzwungen wird sie in den Seiten und Route Handlers.
 */
import type { KursSlug } from "./inhalte";

export type Zielgruppe = "oeffentlich" | "mitarbeiter";

export const KURS_ZIELGRUPPE: Record<KursSlug, Zielgruppe> = {
  kunden: "oeffentlich",
  partner: "oeffentlich",
  druckerei: "mitarbeiter",
};

/** Der Kurs, den Mitarbeitende im Staff-Bereich als Hilfe-Einstieg bekommen. */
export const MITARBEITER_KURS: KursSlug = "druckerei";

/** Zielgruppe eines Kurs-Slugs; unbekannte Slugs → undefined (404). */
export function zielgruppeVon(slug: string): Zielgruppe | undefined {
  return Object.hasOwn(KURS_ZIELGRUPPE, slug) ? KURS_ZIELGRUPPE[slug as KursSlug] : undefined;
}

export function istMitarbeiterKurs(slug: string): boolean {
  return zielgruppeVon(slug) === "mitarbeiter";
}

/** Darf diese Zielgruppe den Kurs sehen? `mitarbeiter` = Staff-Sitzung vorhanden. */
export function darfSehen(slug: string, mitarbeiter: boolean): boolean {
  const z = zielgruppeVon(slug);
  if (!z) return false;
  return z === "oeffentlich" || mitarbeiter;
}

/** Anmeldeseite der Mitarbeitenden mit Rücksprung zur gewünschten Hilfeseite. */
export function mitarbeiterLoginUrl(zielPfad: string): string {
  return `/staff/login?weiter=${encodeURIComponent(zielPfad)}`;
}

/**
 * Rücksprungziel nach der Anmeldung: nur interne Pfade (kein „//“, keine Schema-Angaben, keine Backslashes),
 * sonst der Standard. Verhindert offene Weiterleitungen über `?weiter=`.
 */
export function sichererRuecksprung(wert: string | null | undefined, standard = "/staff"): string {
  if (!wert || wert.length > 300) return standard;
  if (!wert.startsWith("/") || wert.startsWith("//") || /[\\\0\r\n]/.test(wert)) return standard;
  return wert;
}
