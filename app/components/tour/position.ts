/**
 * Reine Rechenfunktionen für die Tour: wo das „Loch“ in der Abdunklung sitzt
 * und wo die Karte mit dem Text hinkommt. Ohne DOM, damit sie testbar sind.
 */

export interface Rechteck {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Groesse {
  breite: number;
  hoehe: number;
}

export type KartenLage =
  | { art: "mitte" }
  | { art: "leiste"; kante: "oben" | "unten" }
  | { art: "frei"; top: number; left: number; seite: "unter" | "ueber" | "innen" };

/** unter dieser Breite (Tailwind `sm`) wird die Karte zur Leiste am Rand */
export const SCHMAL = 640;
/** Abstand zwischen Loch und Karte */
export const ABSTAND = 12;
/** Mindestabstand zum Bildschirmrand */
export const RAND = 12;
/** Luft rund um das hervorgehobene Element */
export const POLSTER = 6;
/** Breite der Karte auf breiten Bildschirmen */
export const KARTEN_BREITE = 380;

const klemmen = (wert: number, min: number, max: number) => Math.min(Math.max(wert, min), Math.max(min, max));

export function kartenBreite(ansicht: Groesse) {
  return Math.min(KARTEN_BREITE, ansicht.breite - 2 * RAND);
}

/**
 * Loch um das Element: etwas Polster, auf den sichtbaren Bereich begrenzt.
 * `null`, wenn es kein Element gibt, es nichts misst oder ganz außerhalb liegt.
 */
export function lochFuer(ziel: Rechteck | null, ansicht: Groesse, polster = POLSTER): Rechteck | null {
  if (!ziel || ziel.width <= 0 || ziel.height <= 0) return null;
  const top = Math.max(ziel.top - polster, 0);
  const left = Math.max(ziel.left - polster, 0);
  const bottom = Math.min(ziel.top + ziel.height + polster, ansicht.hoehe);
  const right = Math.min(ziel.left + ziel.width + polster, ansicht.breite);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Wohin mit der Karte? Unter oder über das Loch, auf schmalen Bildschirmen als Leiste. */
export function karteFuer(loch: Rechteck | null, karte: Groesse, ansicht: Groesse): KartenLage {
  if (!loch) return { art: "mitte" };

  const lochUnten = loch.top + loch.height;

  if (ansicht.breite < SCHMAL) {
    // Leiste unten, außer sie würde das Element verdecken und oben ist Platz
    const verdecktUnten = lochUnten > ansicht.hoehe - karte.hoehe - RAND;
    const verdecktOben = loch.top < karte.hoehe + RAND;
    return { art: "leiste", kante: verdecktUnten && !verdecktOben ? "oben" : "unten" };
  }

  const left = klemmen(loch.left, RAND, ansicht.breite - karte.breite - RAND);
  const platzUnten = ansicht.hoehe - lochUnten - ABSTAND - RAND;
  const platzOben = loch.top - ABSTAND - RAND;

  if (platzUnten >= karte.hoehe) return { art: "frei", seite: "unter", top: lochUnten + ABSTAND, left };
  if (platzOben >= karte.hoehe) return { art: "frei", seite: "ueber", top: loch.top - ABSTAND - karte.hoehe, left };
  // Element größer als der Bildschirm: Karte unten in den sichtbaren Bereich legen
  return { art: "frei", seite: "innen", top: klemmen(ansicht.hoehe - karte.hoehe - RAND, RAND, ansicht.hoehe), left };
}

/** Sichtbarer Ausschnitt (visualViewport) innerhalb des Layout-Viewports, z. B. beim Zoomen auf dem Handy */
export interface Ausschnitt extends Groesse {
  x: number;
  y: number;
}

/** Feste Pixelposition der Karte (Layout-Viewport, für `position: fixed`) */
export function kartenRahmen(lage: KartenLage, karte: Groesse, sicht: Ausschnitt): { top: number; left: number; width: number } {
  const breite = kartenBreite(sicht);
  if (lage.art === "leiste") {
    const top = lage.kante === "unten" ? sicht.hoehe - karte.hoehe - RAND : RAND;
    return { top: sicht.y + Math.max(RAND, top), left: sicht.x + RAND, width: sicht.breite - 2 * RAND };
  }
  if (lage.art === "frei") return { top: sicht.y + lage.top, left: sicht.x + lage.left, width: breite };
  return {
    top: sicht.y + Math.max(RAND, (sicht.hoehe - karte.hoehe) / 2),
    left: sicht.x + (sicht.breite - breite) / 2,
    width: breite,
  };
}

/** Haben sich zwei Rechtecke (gerundet) verändert? Spart unnötiges Neuzeichnen. */
export function gleich(a: Rechteck | null, b: Rechteck | null) {
  if (!a || !b) return a === b;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}
