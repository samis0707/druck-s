/**
 * Die eingebettete Kalkulations-Werkbank legt Stammdaten-Entwürfe im Browser-Speicher ab
 * (Schlüssel „werkbank.…“). Beim Abmelden werden sie entfernt, damit auf einem geteilten Rechner
 * nichts von Material- und Maschinenkosten zurückbleibt. Andere Schlüssel (Hilfe-Fortschritt,
 * Farbschema) bleiben unberührt.
 */
export const WERKBANK_PRAEFIX = "werkbank.";

type Speicher = Pick<Storage, "length" | "key" | "removeItem">;

/** Entfernt alle Werkbank-Schlüssel; gibt die Anzahl zurück. Wirft nie (Speicher kann gesperrt sein). */
export function loescheWerkbankSpeicher(speicher: Speicher | null | undefined): number {
  if (!speicher) return 0;
  try {
    const schluessel: string[] = [];
    for (let i = 0; i < speicher.length; i++) {
      const k = speicher.key(i);
      if (k !== null && k.startsWith(WERKBANK_PRAEFIX)) schluessel.push(k);
    }
    for (const k of schluessel) speicher.removeItem(k);
    return schluessel.length;
  } catch {
    return 0;
  }
}

/** Beide Browser-Speicher leeren (nur im Browser aufrufen). */
export function loescheWerkbankSpeicherImBrowser(): void {
  try {
    loescheWerkbankSpeicher(window.localStorage);
  } catch {
    /* gesperrt */
  }
  try {
    loescheWerkbankSpeicher(window.sessionStorage);
  } catch {
    /* gesperrt */
  }
}
