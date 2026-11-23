import type { Druck, Format } from './kalkulation-schema';
import type { FarbArt, Farbe, Farbwerk, GruppenKlick, Klickpreis } from './produktion-schema';

/** Eine Farbe auf einer Station in einem Durchgang. */
export type Belegung = { station: number; farbe: string };

/** Ein Durchgang durch die Maschine: welche Farbe auf welcher Station. */
export type Durchgang = { belegung: Belegung[] };

/** Durchgänge je bedruckter Seite (vorne, hinten). */
export type DruckPlan = {
  seiten: { seite: 'vorne' | 'hinten'; durchgaenge: Durchgang[] }[];
  /** Durchgänge zusammen (beide Seiten). */
  durchgaenge: number;
  /** Wie oft eine wechselbare Station eine neue Sonderfarbe bekommt. */
  wechsel: number;
};

export type PlanErgebnis = { ok: true; plan: DruckPlan } | { ok: false; meldung: string };

const GRUND: Record<'farbig' | 'schwarz', readonly FarbArt[]> = {
  farbig: ['cyan', 'magenta', 'gelb', 'schwarz'],
  schwarz: ['schwarz'],
};

const ART_NAME: Record<FarbArt, string> = {
  cyan: 'Cyan',
  magenta: 'Magenta',
  gelb: 'Gelb',
  schwarz: 'Schwarz',
  sonder: 'Sonderfarbe',
};

const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Farbe aus dem Pool nach Namen (ohne Groß-/Kleinschreibung). */
export function farbeImWerk(werk: Farbwerk, name: string): Farbe | undefined {
  return werk.farben.find((f) => gleich(f.name, name));
}

/** Kann die Station diese Farbe drucken? Fest: gleicher Name; wechselbar: jede Sonderfarbe. */
function passtAuf(werk: Farbwerk, station: number, farbe: Farbe): boolean {
  const s = werk.stationen[station];
  if (!s) return false;
  return s.farbe === undefined ? farbe.art === 'sonder' : gleich(s.farbe, farbe.name);
}

type Schicht = { farben: Farbe[] };

/** Schichten einer Seite in Druckreihenfolge: Sonderfarben unter, 4c/1c, Sonderfarben über. */
function schichtenDerSeite(
  werk: Farbwerk,
  seite: Druck['vorne'],
): { ok: true; schichten: Schicht[] } | { ok: false; meldung: string } {
  if ((seite.sonderfarben ?? 0) > 0) {
    return { ok: false, meldung: 'Sonderfarbe ohne Namen – im Druck die Sonderfarbe wählen' };
  }
  const grund: Farbe[] = [];
  for (const art of GRUND[seite.farbe]) {
    const f = werk.farben.find((x) => x.art === art);
    if (!f) return { ok: false, meldung: `Farbwerk hat kein ${ART_NAME[art]}` };
    grund.push(f);
  }
  const unter: Schicht[] = [];
  const ueber: Schicht[] = [];
  for (const s of seite.sonder ?? []) {
    const f = farbeImWerk(werk, s.name);
    if (!f) return { ok: false, meldung: `${s.name} ist nicht im Farbwerk der Maschine` };
    (s.lage === 'unter' ? unter : ueber).push({ farben: [f] });
  }
  return { ok: true, schichten: [...unter, { farben: grund }, ...ueber] };
}

/**
 * Durchgänge einer Seite: Die Schichten werden der Reihe nach auf die Stationen gelegt
 * (jede Station einmal je Durchgang, frühestmöglich). Was nicht mehr passt, kommt in den
 * nächsten Durchgang.
 */
function durchgaengeDerSeite(
  werk: Farbwerk,
  schichten: Schicht[],
): { ok: true; durchgaenge: Durchgang[] } | { ok: false; meldung: string } {
  const offen = schichten.map((s) => [...s.farben]);
  const durchgaenge: Durchgang[] = [];
  while (offen.length > 0) {
    const belegung: Belegung[] = [];
    for (let station = 0; station < werk.stationen.length && offen.length > 0; station++) {
      const schicht = offen[0];
      if (!schicht) break;
      const i = schicht.findIndex((f) => passtAuf(werk, station, f));
      if (i < 0) continue;
      const [farbe] = schicht.splice(i, 1);
      if (farbe) belegung.push({ station, farbe: farbe.name });
      if (schicht.length === 0) offen.shift();
    }
    if (belegung.length === 0) {
      const farbe = offen[0]?.[0]?.name ?? '';
      return { ok: false, meldung: `${farbe} passt auf keine Station der Maschine` };
    }
    durchgaenge.push({ belegung });
  }
  return { ok: true, durchgaenge };
}

/** Wechsel: jede neue Sonderfarbe auf einer wechselbaren Station (die erste zählt mit). */
function zaehleWechsel(werk: Farbwerk, durchgaenge: readonly Durchgang[]): number {
  const inhalt = new Map<number, string>();
  let wechsel = 0;
  for (const d of durchgaenge) {
    for (const b of d.belegung) {
      if (werk.stationen[b.station]?.farbe !== undefined) continue;
      const vorher = inhalt.get(b.station);
      if (vorher === undefined || !gleich(vorher, b.farbe)) wechsel++;
      inhalt.set(b.station, b.farbe);
    }
  }
  return wechsel;
}

/** Wechsel über mehrere Pläne nacheinander (z. B. Arten Druckbogen eines Teils). */
export function wechselFuer(werk: Farbwerk, plaene: readonly DruckPlan[]): number {
  return zaehleWechsel(
    werk,
    plaene.flatMap((p) => p.seiten.flatMap((s) => s.durchgaenge)),
  );
}

/** Plan für einen Druck: Durchgänge je Seite und Wechsel der Sonderfarbe. */
export function planeDruck(werk: Farbwerk, druck: Druck): PlanErgebnis {
  const seiten: DruckPlan['seiten'] = [];
  const liste: ['vorne' | 'hinten', Druck['vorne']][] = [['vorne', druck.vorne]];
  if (druck.hinten) liste.push(['hinten', druck.hinten]);
  for (const [name, seite] of liste) {
    const s = schichtenDerSeite(werk, seite);
    if (!s.ok) return { ok: false, meldung: `${name}: ${s.meldung}` };
    const d = durchgaengeDerSeite(werk, s.schichten);
    if (!d.ok) return { ok: false, meldung: `${name}: ${d.meldung}` };
    seiten.push({ seite: name, durchgaenge: d.durchgaenge });
  }
  const alle = seiten.flatMap((s) => s.durchgaenge);
  return {
    ok: true,
    plan: { seiten, durchgaenge: alle.length, wechsel: zaehleWechsel(werk, alle) },
  };
}

function passtIn(f: Format, bis: Format): boolean {
  return (
    (f.breiteUm <= bis.breiteUm && f.hoeheUm <= bis.hoeheUm) ||
    (f.breiteUm <= bis.hoeheUm && f.hoeheUm <= bis.breiteUm)
  );
}

/** Gewählte Gruppe mit ihrem Klickpreis für das Bogenformat (und der Stufe, die gilt). */
export type GruppenPreis = {
  name: string;
  zehntelcent: number;
  bisLaengeUm?: number;
  bisFormat?: Format;
};

/** Passt der Bogen in die Klickstufe? Ohne Format passt nur „jede Größe“. */
function passtInStufe(format: Format | undefined, k: GruppenKlick): boolean {
  if (k.bisLaengeUm === undefined && k.bisFormat === undefined) return true;
  if (format === undefined) return false;
  if (k.bisLaengeUm !== undefined && Math.max(format.breiteUm, format.hoeheUm) > k.bisLaengeUm) {
    return false;
  }
  return k.bisFormat === undefined || passtIn(format, k.bisFormat);
}

/** Größe der Stufe zum Sortieren: Länge, sonst längere Seite des Formats, sonst unbegrenzt. */
function stufenGroesse(k: GruppenKlick): number {
  if (k.bisLaengeUm !== undefined) return k.bisLaengeUm;
  if (k.bisFormat !== undefined) return Math.max(k.bisFormat.breiteUm, k.bisFormat.hoeheUm);
  return Number.POSITIVE_INFINITY;
}

export type GruppenWahl =
  | { ok: true; gruppen: GruppenPreis[]; ohneGruppe: string[] }
  | { ok: false; meldung: string };

/**
 * Günstigste Auswahl an Gruppen, die alle Farben eines Durchgangs enthält. Je Gruppe gilt der
 * Klickpreis der kleinsten passenden Größe (ohne Größe: jede). Bei gleichem Preis gewinnen
 * weniger Gruppen, dann die Reihenfolge. Farben, die in keiner Gruppe stehen, stehen in
 * `ohneGruppe` (sie kosten nur ihren Toner).
 */
export function guenstigsteGruppen(
  werk: Farbwerk,
  farben: readonly string[],
  format: Format | undefined,
): GruppenWahl {
  const gruppen = werk.gruppen ?? [];
  const nutzbar: (GruppenPreis & { farben: string[] })[] = [];
  for (const g of gruppen) {
    const passend = g.klicks.filter((k) => passtInStufe(format, k));
    const k = [...passend].sort((a, b) => stufenGroesse(a) - stufenGroesse(b))[0];
    if (!k) continue;
    const preis: GruppenPreis & { farben: string[] } = {
      name: g.name,
      zehntelcent: k.zehntelcent,
      farben: g.farben,
    };
    if (k.bisLaengeUm !== undefined) preis.bisLaengeUm = k.bisLaengeUm;
    if (k.bisFormat !== undefined) preis.bisFormat = k.bisFormat;
    nutzbar.push(preis);
  }
  const inGruppe = (f: string) => gruppen.some((g) => g.farben.some((x) => gleich(x, f)));
  const ohneGruppe = farben.filter((f) => !inGruppe(f));
  const noetig = farben.filter(inGruppe);
  for (const f of noetig) {
    if (!nutzbar.some((g) => g.farben.some((x) => gleich(x, f)))) {
      return {
        ok: false,
        meldung:
          format === undefined
            ? 'Bogenformat unbekannt (Material oder Teil an der Zeile wählen)'
            : `Kein Klickpreis für ${f} bei diesem Bogenformat`,
      };
    }
  }
  let beste: { maske: number; preis: number; zahl: number } | null = null;
  for (let maske = 0; maske < 1 << nutzbar.length; maske++) {
    const gewaehlt = nutzbar.filter((_, i) => (maske & (1 << i)) !== 0);
    const deckt = noetig.every((f) => gewaehlt.some((g) => g.farben.some((x) => gleich(x, f))));
    if (!deckt) continue;
    const preis = gewaehlt.reduce((s, g) => s + g.zehntelcent, 0);
    const zahl = gewaehlt.length;
    if (beste === null || preis < beste.preis || (preis === beste.preis && zahl < beste.zahl)) {
      beste = { maske, preis, zahl };
    }
  }
  const maske = beste?.maske ?? 0;
  return {
    ok: true,
    gruppen: nutzbar
      .filter((_, i) => (maske & (1 << i)) !== 0)
      .map((g) => {
        const preis: GruppenPreis = { name: g.name, zehntelcent: g.zehntelcent };
        if (g.bisLaengeUm !== undefined) preis.bisLaengeUm = g.bisLaengeUm;
        if (g.bisFormat !== undefined) preis.bisFormat = g.bisFormat;
        return preis;
      }),
    ohneGruppe,
  };
}

/**
 * Farbwerk aus den bisherigen Klickpreisen der Maschine: Cyan, Magenta, Gelb, Schwarz fest,
 * bei Klickpreisen für Sonderfarbe eine Farbe „Sonderfarbe“ auf einer wechselbaren Station
 * vorne. Gruppen „4c“ (farbig), „Schwarz“ (schwarz), „Sonderfarbe“ mit denselben Preisen; eine
 * Klickgröße wird zur Bogenlänge (längere Seite, z. B. A3 330 × 487 → bis 487 mm).
 * Toner an farbig/schwarz wird nicht übernommen (Hinweis).
 */
export function farbwerkAusKlickpreisen(klickpreise: readonly Klickpreis[]): {
  farbwerk: Farbwerk;
  hinweise: string[];
} {
  const hinweise: string[] = [];
  const nach = (farbe: Klickpreis['farbe']) =>
    klickpreise
      .filter((k) => k.farbe === farbe)
      .map((k) => {
        const klick: GruppenKlick = { zehntelcent: k.zehntelcent };
        if (k.bisFormat !== undefined) {
          klick.bisLaengeUm = Math.max(k.bisFormat.breiteUm, k.bisFormat.hoeheUm);
        }
        return klick;
      });
  for (const k of klickpreise) {
    if (k.toner !== undefined && k.farbe !== 'sonderfarbe') {
      hinweise.push(`Toner am Klickpreis ${k.farbe} nicht übernommen – an der Farbe eintragen`);
    }
  }
  const sonderToner = klickpreise.find((k) => k.farbe === 'sonderfarbe' && k.toner)?.toner;
  const hatSonder = klickpreise.some((k) => k.farbe === 'sonderfarbe');
  const farben: Farbe[] = [
    { name: 'Cyan', art: 'cyan' },
    { name: 'Magenta', art: 'magenta' },
    { name: 'Gelb', art: 'gelb' },
    { name: 'Schwarz', art: 'schwarz' },
  ];
  if (hatSonder) {
    const sonder: Farbe = { name: 'Sonderfarbe', art: 'sonder' };
    if (sonderToner) sonder.toner = sonderToner;
    farben.push(sonder);
  }
  const gruppen: NonNullable<Farbwerk['gruppen']> = [];
  const vier = nach('farbig');
  if (vier.length > 0) {
    gruppen.push({ name: '4c', farben: ['Cyan', 'Magenta', 'Gelb', 'Schwarz'], klicks: vier });
  }
  const schwarz = nach('schwarz');
  if (schwarz.length > 0) gruppen.push({ name: 'Schwarz', farben: ['Schwarz'], klicks: schwarz });
  const sonder = nach('sonderfarbe');
  if (sonder.length > 0) {
    gruppen.push({ name: 'Sonderfarbe', farben: ['Sonderfarbe'], klicks: sonder });
  }
  const farbwerk: Farbwerk = {
    farben,
    stationen: [
      ...(hatSonder ? [{}] : []),
      { farbe: 'Cyan' },
      { farbe: 'Magenta' },
      { farbe: 'Gelb' },
      { farbe: 'Schwarz' },
    ],
  };
  if (gruppen.length > 0) farbwerk.gruppen = gruppen;
  return { farbwerk, hinweise };
}
