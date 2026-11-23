/**
 * Fragen des öffentlichen Richtpreises in Kundensprache (Browser und Server, ohne Abhängigkeiten).
 * Titel säubern, Hilfetexte und Voreinstellungen. Die Website (digitalemedien.de) hat dieselbe
 * Logik in assets/site.js; beide gleich halten.
 */
import { euroText } from "./richtpreis";

export type KundenFrage = {
  schluessel: string;
  titel: string;
  art: "auswahl" | "zahl" | "text" | "format" | string;
  einheit?: "mm";
  optionen: { wert: string; text: string }[];
};

/** „Flyer: Farbigkeit“ → „Farbigkeit“ (der Artikel steht schon darüber). */
export function kundenFrageTitel(titel: string): string {
  const i = titel.indexOf(": ");
  return (i > 0 ? titel.slice(i + 2) : titel).trim();
}

/** Kurzer Hilfetext zu häufigen Fragen; leer, wenn nichts Sinnvolles dazu zu sagen ist. */
export function kundenFrageHilfe(f: Pick<KundenFrage, "titel" | "art">): string {
  const t = f.titel.toLowerCase();
  if (f.art === "format") return "Fertige Größe in Millimetern, Breite mal Höhe. DIN A5 hoch = 148 × 210.";
  if (t.includes("farbig")) return "4/0 = nur die Vorderseite farbig, 4/4 = beide Seiten farbig.";
  if (t.includes("papier") || t.includes("material")) return "Höhere Grammatur fühlt sich fester an. Unsicher? Wir beraten Sie gern.";
  if (t.includes("format")) return "Fertige Größe nach dem Schneiden.";
  if (t.includes("seiten") || t.includes("umfang")) return "Gesamtzahl der Seiten; bei Broschüren meist ein Vielfaches von 4.";
  if (t.includes("veredel") || t.includes("lack") || t.includes("folie")) return "Optional: schützt und gibt Oberfläche, kostet extra.";
  return "";
}

/** Erste Option als sinnvolle Voreinstellung (so entsteht sofort ein Preis). */
export function voreinstellungen(fragen: readonly KundenFrage[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fragen) if (f.art === "auswahl" && f.optionen.length > 0) v[f.schluessel] = f.optionen[0].wert;
  return v;
}

export type OeffentlichesErgebnis =
  | {
      auflage: number;
      status: "preis";
      netto: { vonCent: number; richtpreisCent: number; bisCent: number };
      brutto: { vonCent: number; richtpreisCent: number; bisCent: number };
      mwstProzent: number;
      jeStueckNettoZehntelcent: number;
    }
  | { auflage: number; status: "auf_anfrage"; gruende: string[] };

const ohneEuro = (cent: number) => euroText(cent).replace(/ €$/, "");
const spanne = (von: number, bis: number) => (von === bis ? euroText(von) : `${ohneEuro(von)} – ${euroText(bis)}`);

/** „ca. 120,00 – 150,00 € netto“ bzw. „Preis auf Anfrage“. */
export function ergebnisNettoText(e: OeffentlichesErgebnis): string {
  return e.status === "preis" ? `ca. ${spanne(e.netto.vonCent, e.netto.bisCent)} netto` : "Preis auf Anfrage";
}

/** „(ca. 142,80 – 178,50 € brutto)“ oder leer. */
export function ergebnisBruttoText(e: OeffentlichesErgebnis): string {
  return e.status === "preis" ? `ca. ${spanne(e.brutto.vonCent, e.brutto.bisCent)} brutto` : "";
}

/** „ca. 0,25 € je Stück (netto)“ oder leer. */
export function ergebnisJeStueckText(e: OeffentlichesErgebnis): string {
  if (e.status !== "preis") return "";
  const zc = e.jeStueckNettoZehntelcent;
  const euro = zc % 10 === 0 ? euroText(zc / 10) : `${(zc / 1000).toFixed(3).replace(".", ",")} €`;
  return `ca. ${euro} je Stück (netto)`;
}
