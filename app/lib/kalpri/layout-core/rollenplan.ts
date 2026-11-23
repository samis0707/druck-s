import type { Flaeche, Lage } from './ausschiessplan';
import type { Rechteck } from './geometrie';

/**
 * Ausschießplan für Rollen (Großformat) im Zustand „Schema“ (T92): Nutzen nebeneinander über
 * die Rollenbreite, ein Abschnitt so lang wie ein Nutzen. Einzige Quelle für Abschnitte,
 * Laufmeter und Quadratmeter; der Papierweg liest nur daraus.
 */

/** Eingaben für einen Rollenplan. */
export type RollenPlanEingabe = {
  rollenbreiteUm: number;
  /** Offenes Format bzw. Endformat eines Nutzens. */
  nutzenFormat: Flaeche;
  beschnittUm: number;
  /** Nicht bedruckbarer Rand links und rechts. */
  randUm: number;
  /** Abstand zwischen den Nutzen, quer und längs (T105, z. B. 10 mm); Standard 0. */
  abstandUm?: number | undefined;
  /** Nutzen nebeneinander von Hand (statt berechnet). */
  nutzenVonHand?: number | undefined;
  /** Gebrauchte Nutzen: Auflage × je Produkt. */
  exemplare: number;
  zuschussFest?: number | undefined;
  zuschussProzent?: number | undefined;
};

/** Rollenplan (Zustand „Schema“): Mengengerüst eines Teils auf der Rolle für eine Auflage. */
export type RollenPlan = {
  zustand: 'schema';
  art: 'rolle';
  rollenbreiteUm: number;
  /** Rollenbreite − 2 × Rand. */
  nutzbarUm: number;
  /** Abschnitt: Rollenbreite × Länge eines Nutzens (mit Beschnitt); null, wenn nichts passt. */
  abschnittFormat: Flaeche | null;
  nutzenJeAbschnitt: number | null;
  nutzenHerkunft: 'berechnet' | 'hand' | null;
  /** Nutzen nebeneinander (Spalten × 1 Zeile). */
  nutzenLage: Lage | null;
  /** Endformate der Nutzen auf dem Abschnitt (nur berechnet), ab linker Rollenkante. */
  nutzenPositionen: Rechteck[];
  /** true: Der Nutzen passt in keiner Lage auf die Rolle. */
  passtNicht: boolean;
  abschnitteNetto: number | null;
  zuschuss: number;
  /** Abschnitte inkl. Zuschuss. */
  abschnitte: number | null;
  /** Laufmeter, auf 3 Nachkommastellen. */
  laufmeter: number | null;
  /** Quadratmeter, auf 3 Nachkommastellen. */
  quadratmeter: number | null;
  /** Anteil der Nutzen an der Abschnittsfläche in ganzen Prozent. */
  papierGenutztProzent: number | null;
};

/**
 * Rollenplan (T92):
 * 1. Nutzen nebeneinander: von Hand oder beide Lagen probiert, gewählt wird die Lage mit der
 *    kürzesten Länge je Nutzen (Nutzen + 2 × Beschnitt, Rollenbreite − 2 × Rand); mit Abstand
 *    (T105): quer = (nutzbar + Abstand) ÷ (Nutzen + Abstand), Abschnitt = Länge + Abstand
 * 2. Abschnitte = aufrunden(Exemplare ÷ Nutzen) + aufrunden(netto × % ÷ 100) + fest
 * 3. Laufmeter = Abschnitte × Abschnittslänge, Quadratmeter = Laufmeter × Rollenbreite
 */
export function berechneRollenPlan(e: RollenPlanEingabe): RollenPlan {
  const nf = e.nutzenFormat;
  const b = e.beschnittUm;
  const nutzbar = e.rollenbreiteUm - 2 * e.randUm;
  const nb = nf.breiteUm + 2 * b;
  const nh = nf.hoeheUm + 2 * b;
  const a = e.abstandUm ?? 0;
  const p: RollenPlan = {
    zustand: 'schema',
    art: 'rolle',
    rollenbreiteUm: e.rollenbreiteUm,
    nutzbarUm: nutzbar,
    abschnittFormat: null,
    nutzenJeAbschnitt: null,
    nutzenHerkunft: null,
    nutzenLage: null,
    nutzenPositionen: [],
    passtNicht: false,
    abschnitteNetto: null,
    zuschuss: 0,
    abschnitte: null,
    laufmeter: null,
    quadratmeter: null,
    papierGenutztProzent: null,
  };

  // 1. Nutzen nebeneinander
  let wahl: { quer: number; breite: number; laenge: number; gedreht: boolean } | null = null;
  if (e.nutzenVonHand !== undefined) {
    wahl = { quer: e.nutzenVonHand, breite: nb, laenge: nh + a, gedreht: false };
    p.nutzenHerkunft = 'hand';
  } else {
    for (const [breite, laenge, gedreht] of [
      [nb, nh, false],
      [nh, nb, true],
    ] as const) {
      const quer = Math.floor((nutzbar + a) / (breite + a));
      if (quer < 1) continue;
      if (wahl === null || (laenge + a) / quer < wahl.laenge / wahl.quer) {
        wahl = { quer, breite, laenge: laenge + a, gedreht };
      }
    }
    if (wahl !== null) p.nutzenHerkunft = 'berechnet';
  }
  if (wahl === null) {
    p.passtNicht = true;
    return p;
  }
  p.abschnittFormat = { breiteUm: e.rollenbreiteUm, hoeheUm: wahl.laenge };
  p.nutzenJeAbschnitt = wahl.quer;
  p.nutzenLage = { spalten: wahl.quer, zeilen: 1, gedreht: wahl.gedreht, anzahl: wahl.quer };
  if (p.nutzenHerkunft === 'berechnet') {
    const ew = wahl.gedreht ? nf.hoeheUm : nf.breiteUm;
    const eh = wahl.gedreht ? nf.breiteUm : nf.hoeheUm;
    for (let i = 0; i < wahl.quer; i++) {
      p.nutzenPositionen.push({
        xUm: e.randUm + i * (wahl.breite + a) + b,
        yUm: b,
        breiteUm: ew,
        hoeheUm: eh,
      });
    }
  }

  // 2. Abschnitte + Zuschuss
  const netto = Math.ceil(e.exemplare / wahl.quer);
  const prozent = e.zuschussProzent ?? 0;
  const fest = e.zuschussFest ?? 0;
  // kleine Gleitkomma-Reste nicht aufrunden
  const zuschuss = Math.ceil(Math.round(((netto * prozent) / 100) * 1e6) / 1e6) + fest;
  p.abschnitteNetto = netto;
  p.zuschuss = zuschuss;
  p.abschnitte = netto + zuschuss;

  // 3. Laufmeter, Quadratmeter, genutztes Material
  p.laufmeter = Math.round((p.abschnitte * wahl.laenge) / 1000) / 1000;
  p.quadratmeter = Math.round(p.laufmeter * (e.rollenbreiteUm / 1_000_000) * 1000) / 1000;
  p.papierGenutztProzent = Math.round(
    (100 * wahl.quer * nf.breiteUm * nf.hoeheUm) / (e.rollenbreiteUm * wahl.laenge),
  );
  return p;
}
