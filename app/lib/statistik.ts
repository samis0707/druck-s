/**
 * Besucherstatistik (Umami, selbst betrieben) – reine Logik ohne Browser-Abhängigkeit:
 * gespeicherte Einwilligung lesen/prüfen und Adressen vor dem Senden bereinigen.
 * Die Oberfläche steckt in components/analytics/Statistik.tsx.
 */

/** Schlüssel der Einwilligung im localStorage */
export const STATISTIK_KEY = "drucks.statistik";
/** Nach 12 Monaten fragen wir erneut */
export const GUELTIG_MS = 365 * 24 * 60 * 60 * 1000;
/** Name der Filterfunktion für `data-before-send` (muss am window hängen) */
export const FILTER_NAME = "drucksStatistikFilter";
/** Ereignis, mit dem die Fußzeile den Hinweis wieder öffnet */
export const EINSTELLUNGEN_EREIGNIS = "drucks:statistik-einstellungen";

export type StatistikWert = "ja" | "nein";
export type StatistikWahl = { wert: StatistikWert; zeit: number };

/** Gespeicherte Wahl lesen; ungültig oder älter als 12 Monate → null (dann neu fragen) */
export function wahlLesen(roh: string | null | undefined, jetzt: number): StatistikWahl | null {
  if (!roh) return null;
  try {
    const w = JSON.parse(roh) as Partial<StatistikWahl>;
    if ((w.wert !== "ja" && w.wert !== "nein") || typeof w.zeit !== "number" || !Number.isFinite(w.zeit)) return null;
    if (w.zeit > jetzt + 60_000 || jetzt - w.zeit > GUELTIG_MS) return null;
    return { wert: w.wert, zeit: w.zeit };
  } catch {
    return null;
  }
}

export function wahlText(wert: StatistikWert, jetzt: number): string {
  return JSON.stringify({ wert, zeit: jetzt } satisfies StatistikWahl);
}

/** Bereiche, die nie gezählt werden und in denen der Hinweis nicht erscheint */
const INTERN = /^\/(staff|konto|login|api)(\/|$)/;

export function istIntern(pfad: string): boolean {
  return INTERN.test(pfad);
}

/**
 * Pfad für die Statistik: interne Bereiche → null (nicht senden). Geheime oder persönliche Teile werden ersetzt:
 * Upload-Links `/u/<token>` → `/u/[token]`, Aufträge `/requests/<id>` → `/requests/[id]`.
 * Suchparameter fallen immer weg (können E-Mail-Adressen, Codes oder Tokens enthalten).
 */
export function pfadBereinigen(pfad: string): string | null {
  const p = pfad.split(/[?#]/)[0] || "/";
  if (istIntern(p)) return null;
  return p.replace(/^\/u\/[^/]+/, "/u/[token]").replace(/^\/requests\/[^/]+/, "/requests/[id]");
}

/**
 * Bereinigt das, was Umami senden will (`url`, `referrer`). Gibt `false` zurück, wenn nichts gesendet werden soll.
 * Externe Herkunftsseiten werden auf ihre Adresse ohne Pfad gekürzt.
 */
export function nutzlastBereinigen<T extends { url?: string; referrer?: string }>(nutzlast: T, eigeneHerkunft: string): T | false {
  const url = new URL(nutzlast.url ?? "/", eigeneHerkunft);
  const pfad = pfadBereinigen(url.pathname);
  if (pfad === null) return false;
  const neu = { ...nutzlast, url: pfad };
  if (nutzlast.referrer) {
    try {
      const ref = new URL(nutzlast.referrer, eigeneHerkunft);
      if (ref.origin === new URL(eigeneHerkunft).origin) {
        const refPfad = pfadBereinigen(ref.pathname);
        neu.referrer = refPfad ? `${ref.origin}${refPfad}` : "";
      } else {
        neu.referrer = `${ref.origin}/`;
      }
    } catch {
      neu.referrer = "";
    }
  }
  return neu;
}

/** „Do not track“ oder „Global Privacy Control“ im Browser gesetzt? Dann wie „Nein“ behandeln, nicht fragen. */
export function datenschutzSignal(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined): boolean {
  if (!nav) return false;
  return nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.globalPrivacyControl === true;
}
