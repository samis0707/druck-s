import { druckText, formatText } from './artikel';
import type { Artikel } from './artikel-schema';
import type { Kalkulation } from './kalkulation-schema';
import { neuesProduktTeil, produktAusKalkulation, produktVon } from './kalkulation-produkt';
import type { Lager } from './lager-schema';
import type { Einheit } from '@druck/units';

/**
 * T119: Eigenschaften einer Kalkulation aus ihrem Produkt (Format, Material, Farbigkeit, Seiten,
 * Merkmale) – zum Suchen und als Vorschau dessen, wonach später ein Artikel gefunden wird.
 */

/** Übliche Formate (mm, hoch) mit Namen; quer wird erkannt. */
const FORMATE: readonly [number, number, string][] = [
  [297, 420, 'A3'],
  [210, 297, 'A4'],
  [148, 210, 'A5'],
  [105, 148, 'A6'],
  [74, 105, 'A7'],
  [99, 210, 'DIN lang'],
  [100, 210, 'DIN lang'],
  [55, 85, 'Visitenkarte'],
  [420, 594, 'A2'],
  [594, 841, 'A1'],
];

/** Name eines Formats, z. B. „A5“, „A4 quer“; unbekannt: null. Toleranz 1 mm. */
export function formatName(f: { breiteUm: number; hoeheUm: number }): string | null {
  const b = f.breiteUm / 1000;
  const h = f.hoeheUm / 1000;
  const nah = (x: number, y: number) => Math.abs(x - y) <= 1;
  for (const [fb, fh, name] of FORMATE) {
    if (nah(b, fb) && nah(h, fh)) return name;
    if (nah(b, fh) && nah(h, fb)) return name === 'Visitenkarte' ? name : `${name} quer`;
  }
  return null;
}

const ohneMarke = (t: string) => t.replace(/\s*·\s*von Claude\s*$/u, '').trim();

function grammText(g: number): string {
  return `${String(Math.round(g * 10) / 10).replace('.', ',')} g`;
}

/** Eigenschaften der Kalkulation, ohne Doppelte, in fester Reihenfolge. */
export function kalkulationEigenschaften(
  k: Kalkulation,
  lager?: Pick<Lager, 'materialien'>,
): string[] {
  const p: Artikel = produktVon(k) ?? produktAusKalkulation(k);
  const aus: string[] = [];
  const dazu = (t: string | null | undefined) => {
    const s = t?.trim();
    if (s && !aus.some((x) => x.toLowerCase() === s.toLowerCase())) aus.push(s);
  };
  if (p.endformat.zustand === 'fest') {
    dazu(formatName(p.endformat.wert));
    dazu(formatText(p.endformat.wert));
  }
  for (const t of p.teile) {
    if (!/^Teil( \d+)?$/.test(t.name)) dazu(t.name);
    if (t.woraus.zustand === 'fest') {
      const q = t.woraus.wert;
      if (q.art === 'sorte') {
        dazu(ohneMarke(q.sorte));
        dazu(grammText(q.grammatur));
      } else if (q.art === 'material') {
        const m = lager?.materialien.find((x) => x.id === q.materialId);
        if (m) {
          dazu(ohneMarke(m.sorte));
          if (m.grammatur !== undefined) dazu(grammText(m.grammatur));
        }
      } else if (q.art === 'beschrieben') dazu(q.text);
    }
    if (t.druck.zustand === 'fest') dazu(druckText(t.druck.wert));
    if (t.seiten?.zustand === 'fest') dazu(`${t.seiten.wert} Seiten`);
    if (t.wareGestellt === true) dazu('Ware vom Kunden');
    for (const m of t.merkmale ?? []) {
      if (m.wert.zustand === 'fest') dazu(`${m.name}: ${m.wert.wert}`);
      else dazu(m.name);
    }
  }
  for (const m of p.merkmale ?? []) {
    if (m.wert.zustand === 'fest') dazu(`${m.name}: ${m.wert.wert}`);
    else dazu(m.name);
  }
  return aus;
}

/** Text, in dem gesucht wird: Nummer, Titel, Kunde, Stichworte, Notiz, Beschreibung, Eigenschaften. */
export function kalkulationSuchtext(k: Kalkulation, lager?: Pick<Lager, 'materialien'>): string {
  return [
    k.id,
    k.titel,
    k.kunde ?? '',
    ...(k.stichworte ?? []),
    k.notiz ?? '',
    k.beschreibung ?? '',
    k.arbeitsanweisung ?? '',
    ...kalkulationEigenschaften(k, lager),
  ]
    .join(' ')
    .toLowerCase();
}

/** Passt die Kalkulation zur Suche? Jedes Wort muss vorkommen (Groß/klein egal). */
export function kalkulationPasst(
  k: Kalkulation,
  suche: string,
  lager?: Pick<Lager, 'materialien'>,
): boolean {
  const woerter = suche
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (woerter.length === 0) return true;
  const text = kalkulationSuchtext(k, lager);
  return woerter.every((w) => text.includes(w));
}

/** Stichworte aus einer Eingabe „Pagina, Seminar; jährlich“: getrennt an Komma/Semikolon. */
export function leseStichworte(text: string): string[] {
  const aus: string[] = [];
  for (const roh of text.split(/[,;]/)) {
    const s = roh.trim().slice(0, 40);
    if (s !== '' && !aus.some((x) => x.toLowerCase() === s.toLowerCase())) aus.push(s);
  }
  return aus.slice(0, 30);
}

/** Neue Kalkulation ohne Artikel: Titel, Auflagen, Einheit, ein Produkt mit einem Teil. */
export function neueKalkulation(kopf: {
  titel: string;
  auflagen: number[];
  einheit: Einheit;
  erstelltAm: string;
}): Record<string, unknown> {
  const produkt: Artikel = {
    id: 'PRODUKT',
    titel: kopf.titel,
    einheit: kopf.einheit,
    endformat: { zustand: 'offen' },
    teile: [neuesProduktTeil(1)],
  };
  return {
    titel: kopf.titel,
    auflagen: kopf.auflagen,
    einheit: kopf.einheit,
    erstelltAm: kopf.erstelltAm,
    zeilen: [],
    produkt,
  };
}
