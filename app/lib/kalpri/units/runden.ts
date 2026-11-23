/** Wirft bei NaN, Infinity oder -Infinity mit der Meldung der Vorgabe. */
export function pruefeZahl(wert: number): void {
  if (Number.isNaN(wert) || !Number.isFinite(wert)) {
    throw new RangeError(`Ungültige Länge: ${wert}`);
  }
}

/** Rundet kaufmännisch: .5 immer vom Nullpunkt weg (2.5 → 3, -2.5 → -3). */
export function rundeKaufmaennisch(x: number): number {
  pruefeZahl(x);
  return x < 0 ? -Math.round(-x) : Math.round(x);
}
