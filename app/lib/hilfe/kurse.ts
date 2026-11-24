/**
 * Kurssuche der Hilfe MIT Zielgruppen-Prüfung: Jede Funktion verlangt ausdrücklich, ob die Anfrage von
 * Mitarbeitenden kommt. Der Mitarbeiter-Kurs wird nur geliefert, wenn `mitarbeiter` true ist.
 * (Nur serverseitig importieren: zieht inhalte-mitarbeiter.ts nach sich.)
 */
import { KURSE_OEFFENTLICH, kursDownloads, type Download, type Kurs } from "./inhalte";
import { KURS_MITARBEITER } from "./inhalte-mitarbeiter";
import { darfSehen, KURS_ZIELGRUPPE } from "./zugriff";

const ALLE: Kurs[] = [...KURSE_OEFFENTLICH, KURS_MITARBEITER];

/** Kurse, die diese Zielgruppe sehen darf (Mitarbeiter-Kurs zuerst, wenn sichtbar). */
export function sichtbareKurse(mitarbeiter: boolean): Kurs[] {
  const liste = ALLE.filter((k) => darfSehen(k.slug, mitarbeiter));
  return liste.sort((a, b) => Number(KURS_ZIELGRUPPE[b.slug] === "mitarbeiter") - Number(KURS_ZIELGRUPPE[a.slug] === "mitarbeiter"));
}

export function kursFuer(slug: string, mitarbeiter: boolean): Kurs | undefined {
  return sichtbareKurse(mitarbeiter).find((k) => k.slug === slug);
}

export function lektionFuer(kursSlug: string, lektionSlug: string, mitarbeiter: boolean): { kurs: Kurs; lektion: Kurs["lektionen"][number]; index: number } | undefined {
  const kurs = kursFuer(kursSlug, mitarbeiter);
  if (!kurs) return undefined;
  const index = kurs.lektionen.findIndex((l) => l.slug === lektionSlug);
  if (index < 0) return undefined;
  return { kurs, lektion: kurs.lektionen[index], index };
}

/** Alle Kurzanleitungen, die diese Zielgruppe sehen darf. */
export function downloadsFuer(mitarbeiter: boolean): Download[] {
  return sichtbareKurse(mitarbeiter).flatMap(kursDownloads);
}

/** Ungefilterte Kursliste — nur für Tests und die Pipeline-Prüfung; nie für Ausgaben an Besucher. */
export function alleKurseUngefiltert(): Kurs[] {
  return [...ALLE];
}
