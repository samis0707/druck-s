import { druckText, formatText } from './artikel';
import type { Artikelbestand, DruckWert } from './artikel-schema';
import type { Kalkulation, Teil } from './kalkulation-schema';
import type { Lager } from './lager-schema';
import type { Arbeitsschritt, Produktion } from './produktion-schema';

type Zeile = Kalkulation['zeilen'][number];

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function zahlText(wert: number): string {
  return String(Math.round(wert * 10) / 10).replace('.', ',');
}

/** Teil, zu dem eine Zeile gehört (Papierweg oder Zukauf); null = ganzes Produkt. */
function teilVon(z: Zeile): string | null {
  if ((z.art === 'material' || z.art === 'arbeitsgang') && z.menge.art === 'papierweg') {
    return z.menge.teilId;
  }
  if (z.art === 'zukauf') return z.teilId ?? null;
  return null;
}

/** Farbigkeit des Teils aus seiner ersten Druckzeile; null ohne Druckzeile. */
function druckVon(k: Kalkulation, teilId: string): DruckWert | null {
  for (const z of k.zeilen) {
    if (z.art === 'arbeitsgang' && z.druck !== undefined && teilVon(z) === teilId) return z.druck;
  }
  return null;
}

/**
 * Ob ein Arbeitsschritt in der Produktbeschreibung erscheint: wie am Schritt eingestellt;
 * fehlt die Einstellung, ja – außer bei „Im Arbeitsweg: Druck“ und „Schneiden“ (der Druck
 * steckt in der Farbigkeit, Schneiden merkt der Kunde nicht).
 */
export function schrittInBeschreibung(s: Arbeitsschritt): boolean {
  if (s.inBeschreibung !== undefined) return s.inBeschreibung;
  return inBeschreibungStandard(s.imWeg?.art);
}

/** Standard ohne Einstellung am Schritt (T96): nein bei Druck, Schneiden und (T108) einmal je
 *  Auftrag (Datencheck, Auftrag anlegen), sonst ja. */
export function inBeschreibungStandard(
  imWeg: 'druck' | 'schnitt' | 'merkmal' | 'auftrag' | undefined,
): boolean {
  return imWeg !== 'druck' && imWeg !== 'schnitt' && imWeg !== 'auftrag';
}

/** Papier für den Kunden: Sorte und Grammatur, ohne Rohbogenformat; unbekannt → null. */
function papierText(t: Teil, lager: Pick<Lager, 'materialien'>): string | null {
  if (t.materialId === undefined) return null;
  const m = lager.materialien.find((x) => x.id === t.materialId);
  if (!m) return null;
  return m.grammatur === undefined
    ? m.sorte.trim()
    : `${m.sorte.trim()} ${zahlText(m.grammatur)} g`;
}

/** Arbeitsgänge eines Teils (null = ganzes Produkt) als Text, ohne Druckzeilen und ohne
 *  Schritte, die nicht in die Beschreibung gehören; mit Angaben („Bohren 4-fach, Ø 6 mm“). */
function schrittTexte(k: Kalkulation, p: Produktion, teilId: string | null): string[] {
  const texte: string[] = [];
  for (const z of k.zeilen) {
    if (z.art !== 'arbeitsgang' || z.druck !== undefined || teilVon(z) !== teilId) continue;
    const s = p.arbeitsschritte.find((x) => x.id === z.schrittId);
    if (!s || !schrittInBeschreibung(s)) continue;
    const angaben = z.angaben ?? [];
    const text = angaben.length > 0 ? `${s.name} ${angaben.join(', ')}` : s.name;
    if (!texte.includes(text)) texte.push(text);
  }
  return texte;
}

/** Seiten aus dem Artikel der Kalkulation (gleiche Teil-ID, festgelegt); sonst null. */
function seitenAusArtikel(
  k: Kalkulation,
  teilId: string,
  bestand: Pick<Artikelbestand, 'artikel'> | undefined,
): string | null {
  const a = bestand?.artikel.find((x) => x.id === k.artikelId);
  const s = a?.teile.find((t) => t.id === teilId)?.seiten;
  if (s?.zustand !== 'fest') return null;
  return `${s.wert} ${s.wert === 1 ? 'Seite' : 'Seiten'}`;
}

/**
 * Produktbeschreibung aus der Kalkulation – mit festen Werten, ohne Auflage (die steht in
 * Paginanet in einem eigenen Feld), z. B. „Flyer A5 · Format 148 × 210 mm · offen 297 × 210
 * mm, 4/4 auf Bilderdruck matt 250 g, Rillen, Wickelfalz · Verpacken“.
 *
 * Titel; Endformat einmal, wenn alle Teile es teilen (sonst je Teil); je Teil offenes Format,
 * Seiten (nur aus dem Artikel, die Kalkulation kennt sie nicht), Farbigkeit aus der ersten
 * Druckzeile und Papier (Sorte + Grammatur), dazu seine Arbeitsgänge; mehrere Teile mit Namen
 * („Umschlag: …“); bei gestellter Ware „auf Ware vom Kunden gestellt (…)“. Am Ende die Arbeitsgänge des ganzen Produkts. Zukauf und Sonstiges bleiben
 * draußen (deren Text ist intern).
 */
export function kalkulationBeschreibung(
  k: Kalkulation,
  p: Produktion,
  lager: Pick<Lager, 'materialien'>,
  bestand?: Pick<Artikelbestand, 'artikel'>,
): string {
  const teile = k.teile ?? [];
  const gruppen: string[] = [k.titel];
  const erstes = teile[0];
  const einFormat =
    erstes !== undefined && teile.every((t) => gleich(t.endformat, erstes.endformat));
  if (einFormat) gruppen.push(`Format ${formatText(erstes.endformat)}`);
  for (const t of teile) {
    const angaben: string[] = [];
    if (!einFormat) angaben.push(`Format ${formatText(t.endformat)}`);
    if (t.offenesFormat !== undefined) angaben.push(`offen ${formatText(t.offenesFormat)}`);
    const seiten = seitenAusArtikel(k, t.id, bestand);
    if (seiten !== null) angaben.push(seiten);
    const druck = druckVon(k, t.id);
    // Ware gestellt (T101): statt des Papiers, was der Kunde stellt
    const was = t.wareText?.trim();
    const papier =
      t.wareGestellt === true
        ? `Ware vom Kunden gestellt${was ? ` (${was})` : ''}`
        : papierText(t, lager);
    if (druck !== null && papier !== null) angaben.push(`${druckText(druck)} auf ${papier}`);
    else if (druck !== null) angaben.push(druckText(druck));
    else if (papier !== null) angaben.push(papier);
    angaben.push(...schrittTexte(k, p, t.id));
    if (angaben.length === 0) continue;
    gruppen.push(teile.length > 1 ? `${t.name}: ${angaben.join(', ')}` : angaben.join(', '));
  }
  const produkt = schrittTexte(k, p, null);
  if (produkt.length > 0) gruppen.push(produkt.join(', '));
  return gruppen.join(' · ');
}
