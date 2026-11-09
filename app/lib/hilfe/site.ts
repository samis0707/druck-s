/** Öffentliche Basis-URL (ohne Schrägstrich am Ende) für Canonicals, Sitemap, llms.txt und JSON-LD. */
export function siteUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function absolut(pfad: string): string {
  return `${siteUrl()}${pfad.startsWith("/") ? pfad : `/${pfad}`}`;
}

/** Stand der Hilfe (sichtbar auf den Seiten, in llms.txt und als dateModified im JSON-LD). */
export const HILFE_STAND = "2026-11-09";
