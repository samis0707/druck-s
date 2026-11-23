/**
 * Logik des Kundenablaufs (rein, testbar): Einträge, Auswertung der Prüfmeldungen je Eintrag und Zelle,
 * Übernahme von Tabellen, Auflage.
 */
import type { Meldung } from "../render/typen";
import type { Datensatz, Variable } from "../schema";

export interface Eintrag {
  /** Nur im Browser: stabile Kennung für Listen, Fokus und Schlüssel (wird nie gesendet) */
  uid: string;
  werte: Record<string, string>;
  auflage: number;
}

let zaehler = 0;
export function neueUid(): string {
  zaehler += 1;
  return `e${Date.now().toString(36)}${zaehler}`;
}

export function neuerEintrag(variablen: Variable[], auflage = 1): Eintrag {
  return { uid: neueUid(), werte: Object.fromEntries(variablen.map((v) => [v.schluessel, ""])), auflage };
}

export function istLeer(e: Eintrag): boolean {
  return Object.values(e.werte).every((w) => w.trim() === "");
}

export function zuDatensaetzen(eintraege: Eintrag[]): Datensatz[] {
  return eintraege.map((e) => ({ werte: e.werte, auflage: e.auflage }));
}

export function ausDatensaetzen(ds: Datensatz[], variablen: Variable[]): Eintrag[] {
  return ds.map((d) => ({ uid: neueUid(), werte: { ...Object.fromEntries(variablen.map((v) => [v.schluessel, ""])), ...d.werte }, auflage: d.auflage ?? 1 }));
}

export function dupliziereEintrag(eintraege: Eintrag[], uid: string): { eintraege: Eintrag[]; uid: string | null } {
  const i = eintraege.findIndex((e) => e.uid === uid);
  if (i < 0) return { eintraege, uid: null };
  const kopie: Eintrag = { uid: neueUid(), werte: { ...eintraege[i].werte }, auflage: eintraege[i].auflage };
  return { eintraege: [...eintraege.slice(0, i + 1), kopie, ...eintraege.slice(i + 1)], uid: kopie.uid };
}

/** Eintrag löschen; liefert die UID, die danach ausgewählt sein sollte (Nachbar). */
export function loescheEintrag(eintraege: Eintrag[], uid: string): { eintraege: Eintrag[]; auswahl: string | null } {
  const i = eintraege.findIndex((e) => e.uid === uid);
  if (i < 0) return { eintraege, auswahl: eintraege[0]?.uid ?? null };
  const rest = eintraege.filter((e) => e.uid !== uid);
  return { eintraege: rest, auswahl: rest[Math.min(i, rest.length - 1)]?.uid ?? null };
}

/** Tabelle übernehmen: ersetzen oder anhängen; leere Standardzeile (ein ungenutzter Eintrag) verschwindet dabei. */
export function uebernehmeTabelle(bestehend: Eintrag[], neu: Eintrag[], modus: "ersetzen" | "anhaengen"): Eintrag[] {
  if (modus === "ersetzen") return neu;
  return [...bestehend.filter((e) => !istLeer(e)), ...neu];
}

export function setzeAuflageFuerAlle(eintraege: Eintrag[], auflage: number): Eintrag[] {
  const a = Math.min(100000, Math.max(1, Math.round(auflage) || 1));
  return eintraege.map((e) => ({ ...e, auflage: a }));
}

export function gesamtAuflage(eintraege: Eintrag[]): number {
  return eintraege.reduce((s, e) => s + e.auflage, 0);
}

/** Kurzbeschreibung eines Eintrags für Listen: die ersten ausgefüllten Werte. */
export function kurzText(e: Eintrag, variablen: Variable[], max = 60): string {
  const teile = variablen.map((v) => (e.werte[v.schluessel] ?? "").trim().replace(/\s+/g, " ")).filter(Boolean);
  const t = teile.slice(0, 2).join(" · ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface Auswertung {
  fehler: Meldung[];
  hinweise: Meldung[];
  /** je Variablen-Schlüssel die Fehlertexte (für die Zelle) */
  nachVariable: Record<string, string[]>;
}

export type Status = "ok" | "hinweis" | "fehler" | "leer";

/** Meldungen (Datensatz = Position ab 1) auf Einträge verteilen. */
export function wertePruefungAus(meldungen: Meldung[], anzahl: number): Auswertung[] {
  const out: Auswertung[] = Array.from({ length: anzahl }, () => ({ fehler: [], hinweise: [], nachVariable: {} }));
  for (const m of meldungen) {
    if (m.datensatz === null || m.datensatz < 1 || m.datensatz > anzahl) continue;
    const a = out[m.datensatz - 1];
    if (m.schwere === "fehler") {
      a.fehler.push(m);
      if (m.variable) (a.nachVariable[m.variable] ??= []).push(m.text);
    } else a.hinweise.push(m);
  }
  return out;
}

export function statusVon(a: Auswertung | undefined, e: Eintrag): Status {
  if (!a) return istLeer(e) ? "leer" : "ok";
  if (a.fehler.length) return "fehler";
  if (a.hinweise.length) return "hinweis";
  return "ok";
}

export function zaehleStatus(auswertung: Auswertung[]): { ok: number; hinweis: number; fehler: number } {
  const z = { ok: 0, hinweis: 0, fehler: 0 };
  for (const a of auswertung) {
    if (a.fehler.length) z.fehler += 1;
    else if (a.hinweise.length) z.hinweis += 1;
    else z.ok += 1;
  }
  return z;
}

/** Texte der Meldung ohne den technischen Vorspann „Datensatz 3, “ (die Liste zeigt die Nummer schon). */
export function meldungsText(m: Meldung): string {
  return m.text.replace(/^Datensatz \d+,\s*/, "").replace(/^Datensatz \d+:\s*/, "");
}

/** Auflage aus einer Eingabe: ganze Zahl von 1 bis 100000, sonst null. */
export function leseAuflage(text: string): number | null {
  const n = Number(text.trim().replace(/\./g, "").replace(",", "."));
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
}

/** Schlüssel für den Zwischenspeicher im Browser (ein Entwurf je Link bzw. Vorlage). */
export function entwurfSchluessel(ref: string): string {
  return `pers-entwurf-v1:${ref}`;
}
