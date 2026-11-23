import { anzahlAusText } from './arbeitsweg';

/**
 * Freie Angaben einer Zeile: mit Semikolon oder Komma getrennt (ein Komma zwischen zwei
 * Ziffern ist ein Dezimalkomma: „Ø 1,5 mm“ bleibt eins), leere Teile fallen weg,
 * jedes Stück getrimmt und höchstens 80 Zeichen (längere werden abgeschnitten).
 */
export function angabenAusText(text: string): string[] {
  if (text === undefined || text === null) return [];
  // Ein Komma zwischen Ziffern ist Dezimalkomma - wir müssen es vor dem Split schützen
  const geschuetzt = text.replace(/(\d),(\d)/g, '$1__KOMMA__DEZ__ $2');
  const teile = geschuetzt.split(/[,;]/);
  const ergebnis: string[] = [];
  for (const teil of teile) {
    const wiederhergestellt = teil.replace(/__KOMMA__DEZ__ /g, ',');
    const getrimmt = wiederhergestellt.trim();
    if (getrimmt === '') continue;
    if (getrimmt.length > 80) {
      ergebnis.push(getrimmt.slice(0, 80));
    } else {
      ergebnis.push(getrimmt);
    }
  }
  return ergebnis;
}

/**
 * Anzahl aus den Angaben: die erste Zahl der ersten Angabe, die eine Zahl enthält –
 * dieselbe Lesart wie `anzahlAusText` im Arbeitsweg („4-fach“ → 4, „Ø 6 mm“ → 6).
 */
export function anzahlAusAngaben(angaben: readonly string[] | undefined): number | null {
  if (!angaben || angaben.length === 0) return null;
  for (const angabe of angaben) {
    const n = anzahlAusText(angabe);
    if (n !== null) return n;
  }
  return null;
}

/** „4-fach, Ø 6 mm“; leere Liste → ''. */
export function angabenText(angaben: readonly string[] | undefined): string {
  if (!angaben || angaben.length === 0) return '';
  return angaben.join(', ');
}
