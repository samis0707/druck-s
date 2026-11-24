/**
 * Richtpreis für Kunden (offene Anfrage und Website): Schalter, Zuordnung Produkt → Artikel und die
 * gemeinsame Prüfung/Berechnung der Angaben, die mit einer Anfrage mitkommen.
 *
 * - Schalter `kalkulation.kunden_richtpreis` (app_settings, Standard AUS): solange aus, gibt es für
 *   Besucher keinen Preis; das Formular verhält sich wie ohne Richtpreis.
 * - Zuordnung `kalkulation.produktzuordnung`: { "flyer": ["A-0001", …] }. Die Produktliste der
 *   Anfrage (PRODUCT_HINTS) ist grob, die Artikel der Kalkulation sind konkret; welcher Artikel zu
 *   welchem Produkt gehört, entscheidet die Druckerei in den Kalkulations-Einstellungen.
 * - Beim Bestätigen einer Anfrage wird neu gerechnet (nie Client-Werte übernehmen).
 */
import { z } from "zod/v3";
import { getSetting, setSetting } from "../settings";
import { PRODUCT_HINTS } from "../ui-text";
import { ladeDaten } from "./daten";
import { ladePreisEinstellungen } from "./einstellungen";
import { euroText, type RichtpreisErgebnis } from "./richtpreis";
import {
  berechneIntern,
  oeffentlicheFragen,
  pruefeAntworten,
  RichtpreisAnfrageSchema,
  speichereSnapshot,
  type AuflageRichtpreis,
  type RichtpreisSnapshot,
} from "./richtpreisService";
import { shopFreigegeben } from "./schnittstelle";

export const KUNDEN_RICHTPREIS_KEY = "kalkulation.kunden_richtpreis";
export const PRODUKTZUORDNUNG_KEY = "kalkulation.produktzuordnung";
/** Höchstens so viele Auflagen zum Vergleichen im Formular. */
export const MAX_AUFLAGEN_ANFRAGE = 3;

export async function kundenRichtpreisAktiv(): Promise<boolean> {
  const s = await getSetting(KUNDEN_RICHTPREIS_KEY);
  return s?.value === "an";
}

export async function setzeKundenRichtpreisAktiv(an: boolean, von: string): Promise<void> {
  await setSetting(KUNDEN_RICHTPREIS_KEY, an ? "an" : "aus", von);
}

export type Produktzuordnung = Record<string, string[]>;

const PRODUKT_SLUGS = PRODUCT_HINTS.map((p) => p.value);

export function pruefeZuordnung(roh: unknown): { ok: true; wert: Produktzuordnung } | { ok: false; fehler: string[] } {
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return { ok: false, fehler: ["Zuordnung muss ein Objekt sein"] };
  const fehler: string[] = [];
  const wert: Produktzuordnung = {};
  for (const [slug, ids] of Object.entries(roh)) {
    if (!PRODUKT_SLUGS.includes(slug)) {
      fehler.push(`Unbekanntes Produkt: ${slug.slice(0, 40)}`);
      continue;
    }
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((i) => typeof i !== "string" || i.length < 1 || i.length > 80)) {
      fehler.push(`${slug}: Liste mit höchstens 50 Artikel-Kennungen erwartet`);
      continue;
    }
    const einmalig = [...new Set(ids as string[])];
    if (einmalig.length > 0) wert[slug] = einmalig;
  }
  return fehler.length > 0 ? { ok: false, fehler } : { ok: true, wert };
}

export async function ladeZuordnung(): Promise<Produktzuordnung> {
  const s = await getSetting(PRODUKTZUORDNUNG_KEY);
  if (!s) return {};
  try {
    const r = pruefeZuordnung(JSON.parse(s.value));
    return r.ok ? r.wert : {};
  } catch {
    return {};
  }
}

export async function speichereZuordnung(roh: unknown, von: string) {
  const r = pruefeZuordnung(roh);
  if (r.ok) await setSetting(PRODUKTZUORDNUNG_KEY, JSON.stringify(r.wert), von);
  return r;
}

/** Produkte, denen ein Artikel zugeordnet ist. */
export function produkteVonArtikel(zuordnung: Produktzuordnung, artikelId: string): string[] {
  return Object.entries(zuordnung)
    .filter(([, ids]) => ids.includes(artikelId))
    .map(([slug]) => slug);
}

// ---------------------------------------------------------------------------
// Angaben, die mit einer Anfrage mitkommen

/** `quote` der Anfrage-Schnittstelle: dieselbe Form wie POST /api/v1/richtpreis, höchstens 3 Auflagen. */
export const AnfrageRichtpreisSchema = RichtpreisAnfrageSchema.refine((q) => q.auflagen.length <= MAX_AUFLAGEN_ANFRAGE, {
  message: `Höchstens ${MAX_AUFLAGEN_ANFRAGE} Auflagen`,
  path: ["auflagen"],
});

export type AnfrageRichtpreis = z.infer<typeof AnfrageRichtpreisSchema>;

export type PruefungQuote =
  | { ok: true; quote: AnfrageRichtpreis }
  | { ok: false; fehler: string[] };

/**
 * Prüft die Angaben gegen Stammdaten und Zuordnung: Artikel freigegeben, zum gewählten Produkt
 * zugeordnet, Antworten zu den Fragen des Artikels passend. Gibt die bereinigten Angaben zurück.
 */
export async function pruefeAnfrageQuote(product: string, roh: unknown): Promise<PruefungQuote> {
  const e = AnfrageRichtpreisSchema.safeParse(roh);
  if (!e.success) return { ok: false, fehler: e.error.issues.map((i) => `quote.${i.path.join(".")}: ${i.message}`) };
  const g = await ladeDaten();
  if (!g.ok) return { ok: false, fehler: ["quote: Der Richtpreis-Rechner ist gerade nicht verfügbar"] };
  const a = g.daten.artikel.find((x) => x.id === e.data.artikel);
  if (!a || !shopFreigegeben(a)) return { ok: false, fehler: ["quote.artikel: unbekannter Artikel"] };
  const zu = await ladeZuordnung();
  if (!produkteVonArtikel(zu, a.id).includes(product)) return { ok: false, fehler: ["quote.artikel: passt nicht zum gewählten Produkt"] };
  const p = pruefeAntworten(oeffentlicheFragen(a, g.daten), e.data.antworten ?? {});
  if (!p.ok) return { ok: false, fehler: p.details.map((d) => `quote.${d.pfad}: ${d.meldung}`) };
  return { ok: true, quote: e.data };
}

export type KundenRechnung =
  | { ok: true; snapshot: RichtpreisSnapshot; auflagen: AuflageRichtpreis[]; artikelTitel: string }
  | { ok: false; grund: "inaktiv" | "ungueltig" | "nicht_berechenbar" };

/**
 * Beim Bestätigen: Richtpreis aus den gespeicherten Angaben NEU berechnen (aktuelle Stammdaten und
 * Einstellungen) und als Snapshot zur Anfrage speichern. Preise aus dem Browser gibt es nicht.
 */
export async function berechneFuerAnfrage(requestId: string, product: string, roh: unknown): Promise<KundenRechnung> {
  if (!(await kundenRichtpreisAktiv())) return { ok: false, grund: "inaktiv" };
  const pr = await pruefeAnfrageQuote(product, roh);
  if (!pr.ok) return { ok: false, grund: "ungueltig" };
  const g = await ladeDaten();
  if (!g.ok) return { ok: false, grund: "nicht_berechenbar" };
  const a = g.daten.artikel.find((x) => x.id === pr.quote.artikel);
  if (!a) return { ok: false, grund: "ungueltig" };
  const p = pruefeAntworten(oeffentlicheFragen(a, g.daten), pr.quote.antworten ?? {});
  if (!p.ok) return { ok: false, grund: "ungueltig" };
  const einst = await ladePreisEinstellungen();
  const r = berechneIntern(g.daten, a, pr.quote.auflagen, p.antworten, einst, { nurOeffentlicheFragen: true });
  if (!r.ok) return { ok: false, grund: "nicht_berechenbar" };
  const snapshot = await speichereSnapshot(
    requestId,
    a.id,
    p.antworten,
    pr.quote.auflagen,
    { artikel: r.artikel, auflagen: r.auflagen, offen: r.offen, hinweise: r.hinweise, quelle: "anfrage" },
    einst,
  );
  return { ok: true, snapshot: { ...snapshot, artikelTitel: a.titel }, auflagen: r.auflagen, artikelTitel: a.titel };
}

// ---------------------------------------------------------------------------
// Darstellung (Mails)

export interface RichtpreisZeile {
  auflage: number;
  /** „ca. 120,00 – 150,00 € netto (ca. 142,80 – 178,50 € brutto)“ oder „Preis auf Anfrage“. */
  text: string;
  jeStueck: string | null;
}

const ohneEuro = (cent: number) => euroText(cent).replace(/ €$/, "");

/** „120,00 – 150,00 €“ aus zwei Cent-Beträgen. */
export function spanneText(vonCent: number, bisCent: number): string {
  return vonCent === bisCent ? euroText(vonCent) : `${ohneEuro(vonCent)} – ${euroText(bisCent)}`;
}

export function richtpreisZeile(r: RichtpreisErgebnis): RichtpreisZeile {
  if (r.status === "auf_anfrage") return { auflage: r.auflage, text: "Preis auf Anfrage", jeStueck: null };
  const je = r.jeStueckZehntelcent % 10 === 0 ? euroText(r.jeStueckZehntelcent / 10) : `${(r.jeStueckZehntelcent / 1000).toFixed(3).replace(".", ",")} €`;
  return {
    auflage: r.auflage,
    text: `ca. ${spanneText(r.von.nettoCent, r.bis.nettoCent)} netto (ca. ${spanneText(r.von.bruttoCent, r.bis.bruttoCent)} brutto)`,
    jeStueck: `ca. ${je} netto je Stück`,
  };
}

export function richtpreisZeilen(auflagen: readonly AuflageRichtpreis[]): RichtpreisZeile[] {
  return auflagen.map((a) => richtpreisZeile(a.richtpreis));
}
