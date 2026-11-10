"use client";

export type StatistikKonfig = { aktiv: true; url: string; websiteId: string } | { aktiv: false };

let laden: Promise<StatistikKonfig> | null = null;

/** Einstellungen der Statistik einmal je Seitenaufruf vom Server holen (siehe app/api/statistik) */
export function statistikKonfig(): Promise<StatistikKonfig> {
  laden ??= fetch("/api/statistik")
    .then((r) => (r.ok ? (r.json() as Promise<StatistikKonfig>) : { aktiv: false as const }))
    .catch(() => ({ aktiv: false as const }));
  return laden;
}
