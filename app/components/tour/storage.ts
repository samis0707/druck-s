/**
 * Merker für die geführten Touren. Jeder Zugriff ist abgesichert: ohne Storage
 * (privates Fenster, gesperrte Cookies) gilt die Tour als „noch nicht gesehen“.
 */

/** Teil der Storage-Schnittstelle, den wir brauchen (für Tests leicht nachzubauen) */
export type KleinerSpeicher = Pick<Storage, "getItem" | "setItem">;

type Quelle = () => KleinerSpeicher | null | undefined;

/** Schlüssel in localStorage: „erledigt“ (Tour gestartet oder beendet) */
export const erledigtSchluessel = (id: string) => `tour:${id}:v1`;
/** Schlüssel in sessionStorage: Einladung in dieser Sitzung schon gezeigt */
export const angebotenSchluessel = (id: string) => `tour:${id}:v1:angeboten`;

function lesen(quelle: Quelle, key: string): string | null {
  try {
    return quelle()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function schreiben(quelle: Quelle, key: string, value: string) {
  try {
    quelle()?.setItem(key, value);
  } catch {
    // Speicher voll oder gesperrt – dann eben ohne Merker
  }
}

const lokal: Quelle = () => (typeof window === "undefined" ? null : window.localStorage);
const sitzung: Quelle = () => (typeof window === "undefined" ? null : window.sessionStorage);

export function istErledigt(id: string, quelle: Quelle = lokal) {
  return lesen(quelle, erledigtSchluessel(id)) === "done";
}

export function alsErledigtMerken(id: string, quelle: Quelle = lokal) {
  schreiben(quelle, erledigtSchluessel(id), "done");
}

export function wurdeAngeboten(id: string, quelle: Quelle = sitzung) {
  return lesen(quelle, angebotenSchluessel(id)) === "1";
}

export function alsAngebotenMerken(id: string, quelle: Quelle = sitzung) {
  schreiben(quelle, angebotenSchluessel(id), "1");
}

/** Soll die Einladung (Toast) erscheinen? */
export function einladungZeigen(id: string, quellen: { lokal?: Quelle; sitzung?: Quelle } = {}) {
  return !istErledigt(id, quellen.lokal ?? lokal) && !wurdeAngeboten(id, quellen.sitzung ?? sitzung);
}

/** `?tour=aus` → keine Einladung, `?tour=start` → Tour sofort starten */
export function tourModusAusUrl(search: string): "aus" | "start" | null {
  try {
    const wert = new URLSearchParams(search).get("tour");
    return wert === "aus" || wert === "start" ? wert : null;
  } catch {
    return null;
  }
}
