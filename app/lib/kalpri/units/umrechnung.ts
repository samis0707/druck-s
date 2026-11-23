import { type Laenge } from './laenge';
import { GANZZAHLIGE_EINHEITEN, menge, type Einheit, type Menge } from './menge';

/** „1 einheit = anzahl je“, z. B. 1 Bündel = 50 Stück. */
export type Umrechnung = {
  readonly einheit: Einheit;
  readonly anzahl: number;
  readonly je: Einheit;
};

export function umrechnung(einheit: Einheit, anzahl: number, je: Einheit): Umrechnung {
  if (Number.isNaN(anzahl) || !Number.isFinite(anzahl) || anzahl <= 0) {
    throw new RangeError(`Umrechnung braucht eine Anzahl größer als 0: ${anzahl}`);
  }
  if (einheit === je) {
    throw new RangeError(`Umrechnung in dieselbe Einheit: ${einheit}`);
  }
  return { einheit, anzahl, je };
}

/**
 * Rechnet eine Menge über die Umrechnung um, in beide Richtungen.
 * In die Sammeleinheit (Stück → Bündel) wird bei ganzzahligen Einheiten aufgerundet.
 */
export function rechneUm(m: Menge<Einheit>, u: Umrechnung): Menge<Einheit> {
  if (m.einheit === u.je) {
    const roh = m.wert / u.anzahl;
    const ganz = (GANZZAHLIGE_EINHEITEN as readonly string[]).includes(u.einheit);
    return menge(ganz ? Math.ceil(roh) : roh, u.einheit);
  }
  if (m.einheit === u.einheit) {
    return menge(m.wert * u.anzahl, u.je);
  }
  throw new TypeError(
    `Umrechnung passt nicht: ${m.einheit} (1 ${u.einheit} = ${u.anzahl} ${u.je})`,
  );
}

/**
 * Stapel für eine Anzahl Blatt/Bogen: so viele ganze Blatt je Stapel, wie in die Einlegehöhe passen,
 * Stapel aufgerundet. Wirft, wenn ein Blatt dicker als die Einlegehöhe ist.
 */
export function stapelAnzahl(anzahl: number, dicke: Laenge, einlegehoehe: Laenge): Menge<'Stapel'> {
  menge(anzahl, 'Stueck');
  if (dicke.um <= 0 || einlegehoehe.um <= 0) {
    throw new RangeError('Dicke und Einlegehöhe müssen größer als 0 sein');
  }
  const jeStapel = Math.floor(einlegehoehe.um / dicke.um);
  if (jeStapel === 0) {
    throw new RangeError('Material ist dicker als die Einlegehöhe');
  }
  return menge(Math.ceil(anzahl / jeStapel), 'Stapel');
}
