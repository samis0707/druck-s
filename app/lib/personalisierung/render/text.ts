/** Textvorlagen, Umbruch, Ausrichtung und automatisches Verkleinern (rein, ohne PDF). */
import type { TextFeld } from "../schema";
import { MM } from "./geometrie";
import type { Messer } from "./typen";

const PLATZHALTER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
const STEUERZEICHEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

/** Wert säubern: Steuerzeichen raus, Zeilenumbrüche vereinheitlichen, Ränder abschneiden. */
export function saeubereWert(wert: string | undefined | null, mehrzeilig: boolean): string {
  let t = (wert ?? "").replace(/\r\n?/g, "\n").replace(STEUERZEICHEN, "").replace(/\t/g, " ");
  t = mehrzeilig ? t.split("\n").map((z) => z.trim()).join("\n").trim() : t.replace(/\s*\n\s*/g, " ").trim();
  return t;
}

/**
 * Vorlage mit {{variablen}} füllen. Zeilen, die Variablen enthalten und in denen ALLE leer sind,
 * entfallen (retorix-Verhalten); Zeilen ohne Variablen bleiben. Rückgabe: die verbleibenden Zeilen.
 */
export function fuelleVorlage(vorlage: string, werte: Record<string, string | undefined>, mehrzeiligeWerte = false): string[] {
  const out: string[] = [];
  for (const zeile of vorlage.replace(/\r\n?/g, "\n").split("\n")) {
    let hatVariable = false;
    let alleLeer = true;
    const gefuellt = zeile.replace(PLATZHALTER, (_m, key: string) => {
      hatVariable = true;
      const v = saeubereWert(werte[key], mehrzeiligeWerte);
      if (v !== "") alleLeer = false;
      return v;
    });
    if (hatVariable && alleLeer) continue;
    out.push(gefuellt);
  }
  return out;
}

/** Wie `fuelleVorlage`, aber ein einziger String (QR-/Barcode-Inhalt); leere Variablen bleiben leer. */
export function fuelleInhalt(vorlage: string, werte: Record<string, string | undefined>): string {
  return vorlage.replace(PLATZHALTER, (_m, key: string) => saeubereWert(werte[key], false));
}

function wortUmbruch(wort: string, max: number, m: Messer, groesse: number): string[] {
  const teile: string[] = [];
  let aktuell = "";
  for (const zeichen of Array.from(wort)) {
    if (aktuell && m.breite(aktuell + zeichen, groesse) > max) {
      teile.push(aktuell);
      aktuell = zeichen;
    } else aktuell += zeichen;
  }
  if (aktuell) teile.push(aktuell);
  return teile;
}

/** Absatz an der Breite (pt) umbrechen. Überlange Wörter werden zeichenweise getrennt. */
export function umbrich(absatz: string, max: number, m: Messer, groesse: number): string[] {
  const woerter = absatz.split(/ +/).filter((w) => w !== "");
  if (woerter.length === 0) return [""];
  const zeilen: string[] = [];
  let aktuell = "";
  for (const wort of woerter) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort;
    if (m.breite(kandidat, groesse) <= max) {
      aktuell = kandidat;
      continue;
    }
    if (aktuell) zeilen.push(aktuell);
    if (m.breite(wort, groesse) <= max) aktuell = wort;
    else {
      const teile = wortUmbruch(wort, max, m, groesse);
      aktuell = teile.pop() ?? "";
      zeilen.push(...teile);
    }
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen;
}

export interface TextTeil {
  text: string;
  /** pt von der linken Kante des Feldes */
  x: number;
}
export interface TextZeile {
  teile: TextTeil[];
  /** pt von der Oberkante des Feldes nach unten bis zur Grundlinie */
  grundlinie: number;
}
export interface TextLayout {
  groesse: number;
  zeilen: TextZeile[];
  passt: boolean;
  ueberlauf: "breite" | "hoehe" | null;
  /** Schriftgröße wurde verkleinert */
  verkleinert: boolean;
}

function layoutBeiGroesse(feld: TextFeld, zeilen: string[], m: Messer, groesse: number): TextLayout {
  const b = feld.breite * MM;
  const h = feld.hoehe * MM;
  const einzeilig = feld.umbruch === "einzeilig";
  const zeilenRoh: { text: string; absatzEnde: boolean }[] = [];
  for (const absatz of zeilen) {
    if (einzeilig) zeilenRoh.push({ text: absatz, absatzEnde: true });
    else {
      const teile = umbrich(absatz, b, m, groesse);
      teile.forEach((t, i) => zeilenRoh.push({ text: t, absatzEnde: i === teile.length - 1 }));
    }
  }
  const ascent = m.ascent(groesse);
  const descent = m.descent(groesse);
  const pitch = groesse * feld.zeilenabstand;
  const n = zeilenRoh.length;
  const blockH = n === 0 ? 0 : ascent + (n - 1) * pitch + descent;
  const ersteGrundlinie = feld.vertikal === "oben" ? ascent : feld.vertikal === "mitte" ? (h - blockH) / 2 + ascent : h - blockH + ascent;
  let maxBreite = 0;
  const out: TextZeile[] = zeilenRoh.map((z, i) => {
    const w = m.breite(z.text, groesse);
    maxBreite = Math.max(maxBreite, w);
    const teile: TextTeil[] = [];
    if (feld.ausrichtung === "block" && !z.absatzEnde && z.text.includes(" ") && w <= b) {
      const woerter = z.text.split(" ");
      const summe = woerter.reduce((s, wo) => s + m.breite(wo, groesse), 0);
      const luecke = (b - summe) / (woerter.length - 1);
      let x = 0;
      for (const wo of woerter) {
        teile.push({ text: wo, x });
        x += m.breite(wo, groesse) + luecke;
      }
    } else {
      const x = feld.ausrichtung === "zentriert" ? (b - w) / 2 : feld.ausrichtung === "rechts" ? b - w : 0;
      teile.push({ text: z.text, x });
    }
    return { teile, grundlinie: ersteGrundlinie + i * pitch };
  });
  const zuBreit = maxBreite > b + 0.01;
  const zuHoch = blockH > h + 0.01;
  return { groesse, zeilen: out, passt: !zuBreit && !zuHoch, ueberlauf: zuBreit ? "breite" : zuHoch ? "hoehe" : null, verkleinert: false };
}

/**
 * Text im Feld anordnen. Mit `verkleinernBis` wird die größte Schriftgröße (auf 0,1 pt genau)
 * zwischen Mindest- und Sollgröße gesucht, bei der alles passt; sonst bleibt `passt` false.
 */
export function ordneText(feld: TextFeld, zeilen: string[], m: Messer): TextLayout {
  const soll = feld.groesse;
  const erste = layoutBeiGroesse(feld, zeilen, m, soll);
  if (erste.passt || feld.verkleinernBis === null || feld.verkleinernBis >= soll) return erste;
  const min = feld.verkleinernBis;
  const kleinste = layoutBeiGroesse(feld, zeilen, m, min);
  if (!kleinste.passt) return { ...kleinste, verkleinert: true };
  let lo = min;
  let hi = soll;
  let best = kleinste;
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    const l = layoutBeiGroesse(feld, zeilen, m, mid);
    if (l.passt) {
      best = l;
      lo = mid;
    } else hi = mid;
  }
  return { ...best, verkleinert: true };
}
