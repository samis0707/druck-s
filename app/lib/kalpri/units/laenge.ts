import { pruefeZahl, rundeKaufmaennisch } from './runden';

export type Laenge = { readonly um: number; readonly __art: 'Laenge' };

function legeAn(umWert: number): Laenge {
  return { um: umWert, __art: 'Laenge' };
}

export function um(wert: number): Laenge {
  pruefeZahl(wert);
  if (!Number.isInteger(wert)) {
    throw new RangeError(`Länge muss ganzzahlig in µm sein: ${wert}`);
  }
  return legeAn(wert);
}

export function mm(wert: number): Laenge {
  pruefeZahl(wert);
  return legeAn(rundeKaufmaennisch(wert * 1000));
}

export function m(wert: number): Laenge {
  pruefeZahl(wert);
  return legeAn(rundeKaufmaennisch(wert * 1_000_000));
}

export function pt(wert: number): Laenge {
  pruefeZahl(wert);
  return legeAn(rundeKaufmaennisch((wert * 25400) / 72));
}

export function inMm(l: Laenge): number {
  return l.um / 1000;
}

export function inPt(l: Laenge): number {
  return (l.um * 72) / 25400;
}

export function plus(a: Laenge, b: Laenge): Laenge {
  return legeAn(a.um + b.um);
}

export function minus(a: Laenge, b: Laenge): Laenge {
  return legeAn(a.um - b.um);
}

export function mal(a: Laenge, faktor: number): Laenge {
  pruefeZahl(faktor);
  return legeAn(rundeKaufmaennisch(a.um * faktor));
}

export function vergleiche(a: Laenge, b: Laenge): -1 | 0 | 1 {
  if (a.um < b.um) return -1;
  if (a.um > b.um) return 1;
  return 0;
}

/** Deutsches Format mit Komma, z. B. "210,0 mm". Standard: 1 Nachkommastelle. */
export function formatMm(l: Laenge, nachkommastellen = 1): string {
  pruefeZahl(nachkommastellen);
  return `${inMm(l).toFixed(nachkommastellen).replace('.', ',')} mm`;
}
