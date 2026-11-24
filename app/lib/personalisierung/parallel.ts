/**
 * Begrenzer für gleichzeitige, rechenintensive Arbeiten (PDF-Erzeugung, Vorschau, Prüfung) je Instanz.
 * Die Arbeit läuft im Event-Loop des einen Node-Prozesses; zu viele parallele Aufrufe würden alle
 * anderen Funktionen ausbremsen. Ohne freien Platz wird je nach `warteMs` sofort (0) oder nach
 * Wartezeit mit 503 abgelehnt: "Bitte gleich nochmal versuchen".
 */
import { config } from "../config";
import { PersFehler } from "./dateien";

let aktiv = 0;
const wartende: Array<() => void> = [];

export const BUSY_TEXT = "Gerade wird viel gerechnet. Bitte gleich nochmal versuchen.";

function maximal(): number {
  return config.personalisierung.maxParallelRender;
}

function freigeben(): void {
  aktiv -= 1;
  const naechster = wartende.shift();
  if (naechster) naechster();
}

/** Führt `fn` aus, sobald ein Platz frei ist. `warteMs` = 0: nicht warten. */
export async function mitRenderPlatz<T>(fn: () => Promise<T>, opt: { warteMs?: number } = {}): Promise<T> {
  const max = maximal();
  if (max > 0 && aktiv >= max) {
    const warteMs = opt.warteMs ?? 0;
    if (warteMs <= 0 || wartende.length >= 50) throw new PersFehler(BUSY_TEXT, 503, "ausgelastet");
    await new Promise<void>((ok, nein) => {
      const eintrag = () => {
        clearTimeout(timer);
        aktiv += 1;
        ok();
      };
      const timer = setTimeout(() => {
        const i = wartende.indexOf(eintrag);
        if (i >= 0) wartende.splice(i, 1);
        nein(new PersFehler(BUSY_TEXT, 503, "ausgelastet"));
      }, warteMs);
      timer.unref?.();
      wartende.push(eintrag);
    });
  } else {
    aktiv += 1;
  }
  try {
    return await fn();
  } finally {
    freigeben();
  }
}

/** Nur für Tests. */
export function renderAuslastung(): { aktiv: number; wartend: number } {
  return { aktiv, wartend: wartende.length };
}
