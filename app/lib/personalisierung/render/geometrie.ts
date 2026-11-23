/** Maße und Nutzenberechnung. Alles in mm, außer `MM`. */
export const MM = 72 / 25.4;
const EPS = 1e-6;

export interface Raster {
  spalten: number;
  zeilen: number;
  proBogen: number;
  /** Maße eines Nutzens (Endformat + Beschnitt rundum) */
  zelle: { breite: number; hoehe: number };
  /** Linke obere Ecke der Raster-Fläche auf dem Bogen (zentriert), mm, Ursprung oben links. */
  start: { x: number; y: number };
  /** Auslastung der bedruckbaren Fläche, 0–1 */
  auslastung: number;
}

export interface RasterEingabe {
  endformat: { breite: number; hoehe: number };
  beschnitt: number;
  bogen: { breite: number; hoehe: number };
  rand: { oben: number; unten: number; links: number; rechts: number };
  abstand: { spalten: number; zeilen: number };
}

/**
 * Wie viele Nutzen passen auf einen Bogen? n Nutzen brauchen n*w + (n-1)*abstand.
 * (Die alte retorix-Rechnung verglich den Rest mit der Höhe statt der Breite und zählte
 * dadurch Spalten, die nicht passen.)
 */
export function berechneNutzen(e: RasterEingabe): Raster {
  const w = e.endformat.breite + 2 * e.beschnitt;
  const h = e.endformat.hoehe + 2 * e.beschnitt;
  const nutzbarB = e.bogen.breite - e.rand.links - e.rand.rechts;
  const nutzbarH = e.bogen.hoehe - e.rand.oben - e.rand.unten;
  const zaehle = (flaeche: number, mass: number, abstand: number) =>
    flaeche + EPS < mass ? 0 : Math.floor((flaeche + abstand + EPS) / (mass + abstand));
  const spalten = zaehle(nutzbarB, w, e.abstand.spalten);
  const zeilen = zaehle(nutzbarH, h, e.abstand.zeilen);
  const inhaltB = spalten * w + Math.max(0, spalten - 1) * e.abstand.spalten;
  const inhaltH = zeilen * h + Math.max(0, zeilen - 1) * e.abstand.zeilen;
  return {
    spalten,
    zeilen,
    proBogen: spalten * zeilen,
    zelle: { breite: w, hoehe: h },
    start: { x: e.rand.links + (nutzbarB - inhaltB) / 2, y: e.rand.oben + (nutzbarH - inhaltH) / 2 },
    auslastung: nutzbarB > 0 && nutzbarH > 0 ? (inhaltB * inhaltH) / (e.bogen.breite * e.bogen.hoehe) : 0,
  };
}

/** Position (linke obere Ecke, mm) eines Nutzens; Index zeilenweise von oben links. */
export function zellenPosition(r: Raster, abstand: { spalten: number; zeilen: number }, index: number, gespiegelt: boolean) {
  const zeile = Math.floor(index / r.spalten);
  let spalte = index % r.spalten;
  if (gespiegelt) spalte = r.spalten - 1 - spalte;
  return {
    x: r.start.x + spalte * (r.zelle.breite + abstand.spalten),
    y: r.start.y + zeile * (r.zelle.hoehe + abstand.zeilen),
  };
}
