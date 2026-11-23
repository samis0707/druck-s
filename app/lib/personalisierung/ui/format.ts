/** Endformat und Beschnitt aus der Seitengröße eines Design-PDFs erkennen (Vorschlag, im Assistenten änderbar). */

export interface SeitenMass {
  breiteMm: number;
  hoeheMm: number;
  trim?: { breiteMm: number; hoeheMm: number; beschnittMm: number | null };
}

export interface ErkanntesFormat {
  endformat: { breite: number; hoehe: number };
  beschnitt: number;
  mitBeschnitt: boolean;
  /** Fließtext für die Anzeige */
  text: string;
  /** false: geraten, bitte prüfen lassen */
  sicher: boolean;
}

export const GAENGIGE_FORMATE = [
  { name: "Visitenkarte", breite: 85, hoehe: 55 },
  { name: "Visitenkarte", breite: 90, hoehe: 50 },
  { name: "Visitenkarte", breite: 85, hoehe: 54 },
  { name: "Namensschild", breite: 90, hoehe: 55 },
  { name: "DIN A8", breite: 52, hoehe: 74 },
  { name: "DIN A7", breite: 74, hoehe: 105 },
  { name: "DIN A6", breite: 105, hoehe: 148 },
  { name: "DIN lang", breite: 99, hoehe: 210 },
  { name: "DIN lang", breite: 100, hoehe: 210 },
  { name: "DIN A5", breite: 148, hoehe: 210 },
  { name: "DIN A4", breite: 210, hoehe: 297 },
  { name: "DIN A3", breite: 297, hoehe: 420 },
] as const;

const BESCHNITTE = [3, 2, 5, 1];
const TOLERANZ = 0.8;

const zahl = (n: number) => (Math.round(n * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function erkenneFormat(seite: SeitenMass): ErkanntesFormat {
  const { breiteMm: B, hoeheMm: H } = seite;
  const t = seite.trim;
  if (t && t.beschnittMm !== null && t.beschnittMm > 0 && t.beschnittMm <= 20) {
    return {
      endformat: { breite: t.breiteMm, hoehe: t.hoeheMm },
      beschnitt: t.beschnittMm,
      mitBeschnitt: true,
      text: `Das PDF enthält ein Endformat (TrimBox) von ${zahl(t.breiteMm)} × ${zahl(t.hoeheMm)} mm mit ${zahl(t.beschnittMm)} mm Beschnitt.`,
      sicher: true,
    };
  }
  const nah = (a: number, b: number) => Math.abs(a - b) <= TOLERANZ;
  for (const b of BESCHNITTE) {
    for (const f of GAENGIGE_FORMATE) {
      for (const [fw, fh] of [[f.breite, f.hoehe], [f.hoehe, f.breite]] as const) {
        if (nah(B, fw + 2 * b) && nah(H, fh + 2 * b)) {
          return {
            endformat: { breite: fw, hoehe: fh },
            beschnitt: b,
            mitBeschnitt: true,
            text: `Die Seite (${zahl(B)} × ${zahl(H)} mm) passt zu ${f.name} ${fw} × ${fh} mm mit ${b} mm Beschnitt rundum.`,
            sicher: true,
          };
        }
      }
    }
  }
  for (const f of GAENGIGE_FORMATE) {
    for (const [fw, fh] of [[f.breite, f.hoehe], [f.hoehe, f.breite]] as const) {
      if (nah(B, fw) && nah(H, fh)) {
        return {
          endformat: { breite: fw, hoehe: fh },
          beschnitt: 3,
          mitBeschnitt: false,
          text: `Die Seite (${zahl(B)} × ${zahl(H)} mm) entspricht ${f.name} ${fw} × ${fh} mm ohne Beschnitt.`,
          sicher: true,
        };
      }
    }
  }
  return {
    endformat: { breite: Math.round(B * 10) / 10, hoehe: Math.round(H * 10) / 10 },
    beschnitt: 3,
    mitBeschnitt: false,
    text: `Die Seite ist ${zahl(B)} × ${zahl(H)} mm groß. Wir konnten das Endformat nicht sicher erkennen. Bitte prüfen Sie die Maße.`,
    sicher: false,
  };
}

/** Passt die Seitengröße zu den Angaben? Leerer Text = ja. */
export function formatHinweis(seite: SeitenMass, endformat: { breite: number; hoehe: number }, beschnitt: number, mitBeschnitt: boolean): string {
  const erwartetB = endformat.breite + (mitBeschnitt ? 2 * beschnitt : 0);
  const erwartetH = endformat.hoehe + (mitBeschnitt ? 2 * beschnitt : 0);
  const passt = (b: number, h: number) => Math.abs(seite.breiteMm - b) <= 1 && Math.abs(seite.hoeheMm - h) <= 1;
  if (passt(erwartetB, erwartetH)) return "";
  return `Die PDF-Seite ist ${zahl(seite.breiteMm)} × ${zahl(seite.hoeheMm)} mm groß, erwartet werden ${zahl(erwartetB)} × ${zahl(erwartetH)} mm${mitBeschnitt ? " (Endformat plus Beschnitt)" : ""}. Das Design wird mittig platziert.`;
}
