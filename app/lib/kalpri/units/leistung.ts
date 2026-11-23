import { ms, formatDauer, type Dauer } from './dauer';
import { einheitAnzeige, menge, type Einheit } from './menge';
import { rundeKaufmaennisch } from './runden';

/** Leistung = Menge + Einheit + Zeit, z. B. „10 Stück in 5 min“. */
export type Leistung = { readonly menge: number; readonly einheit: Einheit; readonly dauer: Dauer };

const MS_JE_STUNDE = 3_600_000;

export function leistung(mengeWert: number, einheit: Einheit, dauer: Dauer): Leistung {
  menge(mengeWert, einheit);
  if (mengeWert <= 0) {
    throw new RangeError('Leistung braucht eine Menge größer als 0');
  }
  if (dauer.ms <= 0) {
    throw new RangeError('Leistung braucht eine Zeit größer als 0');
  }
  return { menge: mengeWert, einheit, dauer };
}

/** Einheiten je Stunde (ungerundet). */
export function jeStunde(l: Leistung): number {
  return (l.menge * MS_JE_STUNDE) / l.dauer.ms;
}

/** Zeit für eine Einheit, auf ganze ms gerundet. */
export function dauerJeEinheit(l: Leistung): Dauer {
  return ms(rundeKaufmaennisch(l.dauer.ms / l.menge));
}

/** Laufzeit für eine Menge in der Einheit der Leistung, auf ganze ms gerundet. */
export function laufzeit(l: Leistung, mengeWert: number): Dauer {
  menge(mengeWert, l.einheit);
  return ms(rundeKaufmaennisch((mengeWert * l.dauer.ms) / l.menge));
}

function formatZahl(wert: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}

/** z. B. „68,57 Hübe/h“. */
export function formatLeistung(l: Leistung): string {
  return `${formatZahl(jeStunde(l))} ${einheitAnzeige(l.einheit)}/h`;
}

/** z. B. „10 Stück in 5 min = 120 Stück/h = 30 s je Stück“; bei Menge 1 ohne den letzten Teil. */
export function beschreibeLeistung(l: Leistung): string {
  const eingabe = `${formatZahl(l.menge)} ${einheitAnzeige(l.einheit, l.menge)} in ${formatDauer(l.dauer)}`;
  const teile = [eingabe, formatLeistung(l)];
  if (l.menge !== 1) {
    teile.push(`${formatDauer(dauerJeEinheit(l))} je ${einheitAnzeige(l.einheit, 1)}`);
  }
  return teile.join(' = ');
}
