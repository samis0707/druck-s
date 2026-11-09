/**
 * Lernfortschritt der Online-Schulung in localStorage (`hilfe:<kurs>:v1` = JSON-Liste erledigter Lektionen).
 * Jeder Zugriff ist abgesichert: ohne Speicher läuft alles, es merkt sich nur nichts.
 */
import { useSyncExternalStore } from "react";

export type KleinerSpeicher = Pick<Storage, "getItem" | "setItem">;

export const fortschrittSchluessel = (kurs: string) => `hilfe:${kurs}:v1`;

const EREIGNIS = "hilfe-fortschritt";
const LEER: readonly string[] = Object.freeze([]);

function speicher(): KleinerSpeicher | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function erledigteLesen(kurs: string, quelle: KleinerSpeicher | null = speicher()): string[] {
  try {
    const roh = quelle?.getItem(fortschrittSchluessel(kurs));
    const werte: unknown = roh ? JSON.parse(roh) : [];
    return Array.isArray(werte) ? werte.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

export function erledigtSetzen(kurs: string, lektion: string, erledigt: boolean, quelle: KleinerSpeicher | null = speicher()) {
  const bisher = erledigteLesen(kurs, quelle);
  const neu = erledigt ? [...new Set([...bisher, lektion])] : bisher.filter((l) => l !== lektion);
  try {
    quelle?.setItem(fortschrittSchluessel(kurs), JSON.stringify(neu));
  } catch {
    // Speicher voll oder gesperrt
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EREIGNIS));
}

// Cache je Kurs, damit useSyncExternalStore stabile Referenzen bekommt.
const cache = new Map<string, { roh: string; werte: string[] }>();

function schnappschuss(kurs: string): readonly string[] {
  const werte = erledigteLesen(kurs);
  const roh = JSON.stringify(werte);
  const alt = cache.get(kurs);
  if (alt && alt.roh === roh) return alt.werte;
  cache.set(kurs, { roh, werte });
  return werte;
}

function abonnieren(rueckruf: () => void) {
  window.addEventListener(EREIGNIS, rueckruf);
  window.addEventListener("storage", rueckruf);
  return () => {
    window.removeEventListener(EREIGNIS, rueckruf);
    window.removeEventListener("storage", rueckruf);
  };
}

/** Erledigte Lektionen eines Kurses (Server-Render: leer). */
export function useErledigte(kurs: string): readonly string[] {
  return useSyncExternalStore(abonnieren, () => schnappschuss(kurs), () => LEER);
}
