/**
 * Serverseitige Zielgruppen-Prüfung der Hilfe mit der Sitzung (Regeln: zugriff.ts).
 * Schlägt die Sitzungsprüfung fehl (Datenbank, Konfiguration), gilt: kein Zugriff auf Mitarbeiter-Inhalte.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { getSessionUser, isStaff } from "@/lib/auth/session";
import { kursFuer, lektionFuer } from "./kurse";
import type { Kurs, Lektion } from "./inhalte";
import { zielgruppeVon } from "./zugriff";

/** Hat der Aufrufer hinter diesen Headern eine gültige Staff-Sitzung? */
export async function istMitarbeiterSitzung(reqHeaders: Headers): Promise<boolean> {
  try {
    const user = await getSessionUser(reqHeaders);
    return !!user && isStaff(user);
  } catch {
    return false;
  }
}

/**
 * Für Server Components und generateMetadata: liest die Header der Anfrage (macht die Seite dynamisch, daher nur
 * dort aufrufen, wo die Zielgruppe wirklich den Inhalt bestimmt) und prüft die Staff-Sitzung. Je Anfrage nur einmal.
 */
export const istMitarbeiterAnfrage = cache(async (): Promise<boolean> => istMitarbeiterSitzung(await headers()));

export type KursZugriff = { art: "ok"; kurs: Kurs; mitarbeiter: boolean } | { art: "login" } | { art: "unbekannt" };
export type LektionZugriff =
  | { art: "ok"; kurs: Kurs; lektion: Lektion; index: number; mitarbeiter: boolean }
  | { art: "login" }
  | { art: "unbekannt" };

/**
 * Zugriff auf einen Kurs. Mitarbeiter-Kurse: ohne Staff-Sitzung → „login“ (die Seite leitet zur Anmeldung um) —
 * und zwar allein aufgrund des Kurs-Slugs, damit nicht verraten wird, welche Lektionen es gibt.
 * Öffentliche Kurse lesen weder Header noch Sitzung (bleiben statisch vorab erzeugbar).
 */
export async function kursZugriff(slug: string): Promise<KursZugriff> {
  const z = zielgruppeVon(slug);
  if (!z) return { art: "unbekannt" };
  const mitarbeiter = z === "mitarbeiter" ? await istMitarbeiterAnfrage() : false;
  if (z === "mitarbeiter" && !mitarbeiter) return { art: "login" };
  const kurs = kursFuer(slug, mitarbeiter);
  return kurs ? { art: "ok", kurs, mitarbeiter } : { art: "unbekannt" };
}

export async function lektionZugriff(kursSlug: string, lektionSlug: string): Promise<LektionZugriff> {
  const z = await kursZugriff(kursSlug);
  if (z.art !== "ok") return z;
  const treffer = lektionFuer(kursSlug, lektionSlug, z.mitarbeiter);
  return treffer ? { art: "ok", ...treffer, mitarbeiter: z.mitarbeiter } : { art: "unbekannt" };
}
