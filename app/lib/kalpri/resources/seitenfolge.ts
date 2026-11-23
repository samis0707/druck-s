import type { Druck, Seitenfolge, Sonderfarbe, Teil } from './kalkulation-schema';

// ---------------------------------------------------------------------------
// Farben je Seite → Farben je Bogenseite (Nutzer 28.10.)
//
// Die Seiten eines Teils liegen nach einer Seitenfolge auf den Nutzen (offene Bogen) des
// Produkts. Jeder Nutzen hat eine Vorder- und eine Rückseite. Eine Bogenseite ist 4c, wenn eine
// ihrer Seiten 4c ist, sonst 1c; sie hat eine Sonderfarbe, wenn eine ihrer Seiten sie hat.
// Annahme für mehrere Nutzen auf dem Druckbogen: gleiche Form mehrfach (Doppelnutzen) – jeder
// Druckbogen trägt Kopien desselben Nutzens; die Druckbogen teilen sich gleich auf die Nutzen auf.

/** Seiten eines Nutzens (offener Bogen) des Produkts, vorne und hinten. */
export type NutzenSeiten = { vorne: number[]; hinten: number[] };

/** Felder des offenen Formats (Seiten je Bogenseite): offenes Format ÷ Endformat, mindestens 1. */
export function felderVon(teil: Pick<Teil, 'endformat' | 'offenesFormat'>): number {
  const o = teil.offenesFormat;
  if (!o) return 1;
  const f = (o.breiteUm * o.hoeheUm) / (teil.endformat.breiteUm * teil.endformat.hoeheUm);
  return Math.max(1, Math.round(f));
}

/** Seitenfolge des Teils: angegeben, sonst 2 Felder (Doppelseite) Rückstich, sonst Einzelblatt. */
export function seitenfolgeVon(teil: Teil): Seitenfolge {
  if (teil.seitenfolge !== undefined) return teil.seitenfolge;
  return felderVon(teil) === 2 ? 'rueckstich' : 'einzelblatt';
}

/** Seitenzahl des Teils: Nutzen je Produkt × Felder × Seiten (2 bei Schön- und Widerdruck). */
export function seitenzahlVon(teil: Teil, beidseitig: boolean): number {
  return teil.jeProdukt * felderVon(teil) * (beidseitig ? 2 : 1);
}

const von = (start: number, anzahl: number) => Array.from({ length: anzahl }, (_, i) => start + i);

/**
 * Seiten je Nutzen. Rückstich (ineinander, 4 Seiten je Nutzen): Nutzen k (außen = 0) vorne
 * P−2k und 2k+1, hinten 2k+2 und P−2k−1. Zusammengetragen (gefalzte Doppelbogen
 * hintereinander): vorne 4k+4 und 4k+1, hinten 4k+2 und 4k+3. Einzelblatt: die Seiten der
 * Reihe nach, erst vorne, dann hinten. Rückstich und Zusammentragen gehen nur mit 2 Feldern;
 * sonst gilt Einzelblatt (Hinweis).
 */
export function seitenJeNutzen(
  teil: Teil,
  beidseitig: boolean,
): { nutzen: NutzenSeiten[]; hinweise: string[] } {
  const felder = felderVon(teil);
  let folge = seitenfolgeVon(teil);
  const hinweise: string[] = [];
  if (folge !== 'einzelblatt' && (felder !== 2 || !beidseitig)) {
    hinweise.push(
      'Rückstich und Zusammentragen brauchen Doppelseiten, beidseitig – Seiten der Reihe nach',
    );
    folge = 'einzelblatt';
  }
  const p = seitenzahlVon(teil, beidseitig);
  const nutzen: NutzenSeiten[] = [];
  for (let k = 0; k < teil.jeProdukt; k++) {
    if (folge === 'rueckstich') {
      nutzen.push({ vorne: [p - 2 * k, 2 * k + 1], hinten: [2 * k + 2, p - 2 * k - 1] });
    } else if (folge === 'zusammengetragen') {
      nutzen.push({ vorne: [4 * k + 4, 4 * k + 1], hinten: [4 * k + 2, 4 * k + 3] });
    } else {
      const je = felder * (beidseitig ? 2 : 1);
      nutzen.push({
        vorne: von(k * je + 1, felder),
        hinten: beidseitig ? von(k * je + felder + 1, felder) : [],
      });
    }
  }
  return { nutzen, hinweise };
}

/** Eine Art Druckbogen: welche Nutzen (1 = erster) so gedruckt werden. */
export type BogenArt = { nutzen: number[]; druck: Druck };

const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Farben einer Bogenseite aus den Farben ihrer Seiten. */
function seiteDruck(
  seite: Druck['vorne'],
  seiten: readonly number[],
  einfarbig: ReadonlySet<number>,
  sonderSeiten: ReadonlyMap<string, ReadonlySet<number>>,
): Druck['vorne'] {
  const farbig = seite.farbe === 'farbig' && seiten.some((s) => !einfarbig.has(s));
  const sonder: Sonderfarbe[] = (seite.sonder ?? []).filter((x) => {
    const nur = [...sonderSeiten].find(([name]) => gleich(name, x.name))?.[1];
    return nur === undefined || seiten.some((s) => nur.has(s));
  });
  const neu: Druck['vorne'] = { ...seite, farbe: farbig ? 'farbig' : 'schwarz' };
  if (sonder.length > 0) neu.sonder = sonder;
  else delete neu.sonder;
  return neu;
}

const druckSchluessel = (d: Druck) => JSON.stringify(d);

/**
 * Bogenarten eines Teils für einen Druck: ohne Seitenfarben eine Art (alle Nutzen wie der
 * Druck). Mit Seitenfarben je Nutzen die Farben seiner Bogenseiten; gleiche werden
 * zusammengefasst (Reihenfolge des ersten Nutzens). Meldet Seiten, die es nicht gibt, und
 * Farben, die der Druck nicht hat.
 */
export function bogenArten(teil: Teil, druck: Druck): { arten: BogenArt[]; hinweise: string[] } {
  const alle = Array.from({ length: teil.jeProdukt }, (_, i) => i + 1);
  const eintraege = teil.seitenFarben ?? [];
  if (eintraege.length === 0) return { arten: [{ nutzen: alle, druck }], hinweise: [] };
  const beidseitig = druck.hinten !== undefined;
  const { nutzen, hinweise } = seitenJeNutzen(teil, beidseitig);
  const p = seitenzahlVon(teil, beidseitig);
  const einfarbig = new Set<number>();
  const sonderSeiten = new Map<string, Set<number>>();
  const sonderDruck = [...(druck.vorne.sonder ?? []), ...(druck.hinten?.sonder ?? [])];
  for (const e of eintraege) {
    const zuViel = e.seiten.filter((s) => s > p);
    if (zuViel.length > 0) {
      hinweise.push(`${e.farbe}: Seite ${zuViel.join(', ')} gibt es nicht (${p} Seiten)`);
    }
    if (gleich(e.farbe, '1c')) {
      e.seiten.forEach((s) => einfarbig.add(s));
    } else if (sonderDruck.some((x) => gleich(x.name, e.farbe))) {
      const menge = sonderSeiten.get(e.farbe) ?? new Set<number>();
      e.seiten.forEach((s) => menge.add(s));
      sonderSeiten.set(e.farbe, menge);
    } else {
      hinweise.push(`${e.farbe} ist keine Farbe dieses Drucks – Seitenangabe nicht gerechnet`);
    }
  }
  const arten: BogenArt[] = [];
  nutzen.forEach((n, i) => {
    const d: Druck = { vorne: seiteDruck(druck.vorne, n.vorne, einfarbig, sonderSeiten) };
    if (druck.hinten) d.hinten = seiteDruck(druck.hinten, n.hinten, einfarbig, sonderSeiten);
    const da = arten.find((a) => druckSchluessel(a.druck) === druckSchluessel(d));
    if (da) da.nutzen.push(i + 1);
    else arten.push({ nutzen: [i + 1], druck: d });
  });
  return { arten, hinweise };
}

/** Eine Bogenseite als Text: „4c“, „1c“, „4c + Weiß“. */
export function seiteText(s: Druck['vorne']): string {
  return [s.farbe === 'farbig' ? '4c' : '1c', ...(s.sonder ?? []).map((x) => x.name)].join(' + ');
}

/** Ein Druck als Text: „4c + Weiß / 4c“, einseitig „4c“. */
export function bogenDruckText(d: Druck): string {
  return d.hinten ? `${seiteText(d.vorne)} / ${seiteText(d.hinten)}` : seiteText(d.vorne);
}

/** Bogenarten als Text: „1 Bogen 4c + Weiß / 4c · 3 Bogen 4c / 4c“ (Nutzen je Produkt). */
export function bogenArtenText(arten: readonly BogenArt[]): string {
  return arten.map((a) => `${a.nutzen.length} Bogen ${bogenDruckText(a.druck)}`).join(' · ');
}

/**
 * Druckbogen je Bogenart: die Druckbogen gleich auf die Nutzen verteilt (Doppelnutzen), der
 * Rest einzeln auf die ersten Arten. Summe = gesamt.
 */
export function bogenJeArt(
  arten: readonly BogenArt[],
  gesamt: number,
  jeProdukt: number,
): number[] {
  const roh = arten.map((a) => (gesamt * a.nutzen.length) / jeProdukt);
  const ganz = roh.map((r) => Math.floor(r));
  let rest = gesamt - ganz.reduce((s, x) => s + x, 0);
  for (let i = 0; rest > 0 && i < ganz.length; i++, rest--) ganz[i] = (ganz[i] ?? 0) + 1;
  return ganz;
}
