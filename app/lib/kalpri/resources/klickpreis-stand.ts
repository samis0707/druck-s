/**
 * T164: Klickpreise mit „gültig ab“. Ein neuer Klickpreis wird angehängt, der alte bleibt (Historie);
 * je Farbe und Größe (bzw. je Farbgruppe und Größe) gilt am Stichtag der neueste Eintrag mit
 * gueltigAb ≤ Stichtag. Ein Eintrag ohne Datum gilt seit jeher.
 *
 * `produktionZumStichtag` liefert die Produktion mit nur den an diesem Tag geltenden Klickpreisen –
 * der Rechenkern danach bleibt unverändert.
 */
import type {
  Arbeitsplatz,
  Farbgruppe,
  GruppenKlick,
  Klickpreis,
  Produktion,
} from './produktion-schema';

type MitDatum = { gueltigAb?: string | undefined };

/**
 * Je Schlüssel der am Stichtag geltende Eintrag (gleiches Datum: der spätere in der Liste).
 * Ohne Stichtag: je Schlüssel der neueste. Reihenfolge wie das erste Vorkommen des Schlüssels.
 */
export function geltendeEintraege<T extends MitDatum>(
  liste: readonly T[],
  schluessel: (t: T) => string,
  stichtag?: string,
): T[] {
  const reihenfolge: string[] = [];
  const beste = new Map<string, T>();
  for (const t of liste) {
    const s = schluessel(t);
    if (!reihenfolge.includes(s)) reihenfolge.push(s);
    const ab = t.gueltigAb ?? '';
    if (stichtag !== undefined && ab > stichtag) continue;
    const bisher = beste.get(s);
    if (bisher === undefined || ab >= (bisher.gueltigAb ?? '')) beste.set(s, t);
  }
  return reihenfolge.flatMap((s) => {
    const t = beste.get(s);
    return t === undefined ? [] : [t];
  });
}

const format = (f: { breiteUm: number; hoeheUm: number } | undefined) =>
  f === undefined ? '' : `${f.breiteUm}x${f.hoeheUm}`;

export const klickSchluessel = (k: Klickpreis): string => `${k.farbe}|${format(k.bisFormat)}`;
export const gruppenKlickSchluessel = (k: GruppenKlick): string =>
  `${k.bisLaengeUm ?? ''}|${format(k.bisFormat)}`;

function gruppeZumStichtag(g: Farbgruppe, stichtag?: string): Farbgruppe {
  if (!g.klicks.some((k) => k.gueltigAb !== undefined)) return g;
  return { ...g, klicks: geltendeEintraege(g.klicks, gruppenKlickSchluessel, stichtag) };
}

function hatDatum(liste: readonly MitDatum[] | undefined): boolean {
  return (liste ?? []).some((k) => k.gueltigAb !== undefined);
}

/** Arbeitsplatz mit den am Stichtag geltenden Klickpreisen (unverändert, wenn keiner datiert ist). */
export function platzZumStichtag(platz: Arbeitsplatz, stichtag?: string): Arbeitsplatz {
  const datiert =
    hatDatum(platz.klickpreise) ||
    platz.schritte.some((s) => hatDatum(s.klickpreise)) ||
    (platz.farbwerk?.gruppen ?? []).some((g) => hatDatum(g.klicks));
  if (!datiert) return platz;
  const neu: Arbeitsplatz = { ...platz };
  if (platz.klickpreise !== undefined)
    neu.klickpreise = geltendeEintraege(platz.klickpreise, klickSchluessel, stichtag);
  neu.schritte = platz.schritte.map((s) =>
    s.klickpreise === undefined || !hatDatum(s.klickpreise)
      ? s
      : { ...s, klickpreise: geltendeEintraege(s.klickpreise, klickSchluessel, stichtag) },
  );
  if (platz.farbwerk?.gruppen !== undefined) {
    neu.farbwerk = {
      ...platz.farbwerk,
      gruppen: platz.farbwerk.gruppen.map((g) => gruppeZumStichtag(g, stichtag)),
    };
  }
  return neu;
}

/** Produktion mit den am Stichtag geltenden Klickpreisen (gleiches Objekt, wenn nichts datiert ist). */
export function produktionZumStichtag(produktion: Produktion, stichtag?: string): Produktion {
  if (produktion.arbeitsplaetze === undefined) return produktion;
  let geaendert = false;
  const plaetze = produktion.arbeitsplaetze.map((p) => {
    const n = platzZumStichtag(p, stichtag);
    if (n !== p) geaendert = true;
    return n;
  });
  return geaendert ? { ...produktion, arbeitsplaetze: plaetze } : produktion;
}

/** Die am Stichtag geltenden Einträge und der Rest (Historie und künftige), Reihenfolge wie Liste. */
export function geltendUndRest<T extends MitDatum>(
  liste: readonly T[],
  schluessel: (t: T) => string,
  stichtag: string,
): { geltend: T[]; rest: T[] } {
  const geltend = geltendeEintraege(liste, schluessel, stichtag);
  return { geltend, rest: liste.filter((t) => !geltend.includes(t)) };
}

/**
 * Nach dem Bearbeiten der heute geltenden Klickpreise: Historie und künftige Einträge des alten
 * Platzes wieder dazu (Maschine und Farbwerk-Gruppen gleichen Namens). Ein Farbwerk ersetzt die
 * Klickpreise der Maschine – dann bleibt deren Historie weg.
 */
export function klickHistorieBehalten(
  eingabe: Record<string, unknown>,
  alt: Arbeitsplatz,
  stichtag: string,
): Record<string, unknown> {
  const neu = { ...eingabe };
  const restMaschine = geltendUndRest(alt.klickpreise ?? [], klickSchluessel, stichtag).rest;
  if (Array.isArray(neu['klickpreise']) && restMaschine.length > 0)
    neu['klickpreise'] = [...restMaschine, ...(neu['klickpreise'] as unknown[])];
  const werk = neu['farbwerk'] as
    | { gruppen?: { name?: unknown; klicks?: unknown[] }[] }
    | undefined;
  if (werk?.gruppen !== undefined && alt.farbwerk?.gruppen !== undefined) {
    const gruppen = werk.gruppen.map((g) => {
      const vorher = alt.farbwerk?.gruppen?.find(
        (a) => typeof g.name === 'string' && a.name.toLowerCase() === g.name.toLowerCase(),
      );
      if (vorher === undefined) return g;
      const rest = geltendUndRest(vorher.klicks, gruppenKlickSchluessel, stichtag).rest;
      return rest.length === 0 ? g : { ...g, klicks: [...rest, ...(g.klicks ?? [])] };
    });
    neu['farbwerk'] = { ...werk, gruppen };
  }
  return neu;
}

const mitProzent = (zehntelcent: number, prozent: number) =>
  Math.round((zehntelcent * (100 + prozent)) / 100);

/** Ein am Tag geltender Klickpreis mit eindeutigem Schlüssel über Maschine, Schritte und Gruppen. */
export type KlickpreisAmTag = { schluessel: string; name: string; zehntelcent: number };

const mmText = (um: number) => String(Math.round(um / 100) / 10).replace('.', ',');
const groesseText = (f: { breiteUm: number; hoeheUm: number } | undefined) =>
  f === undefined ? '' : ` bis ${mmText(f.breiteUm)} × ${mmText(f.hoeheUm)}`;
const klickName = (k: Klickpreis) => `${k.farbe}${groesseText(k.bisFormat)}`;
const gruppenKlickName = (g: Farbgruppe, k: GruppenKlick) =>
  k.bisLaengeUm !== undefined
    ? `${g.name} bis ${mmText(k.bisLaengeUm)} mm`
    : `${g.name}${groesseText(k.bisFormat)}`;

/** Die Klickpreise, die vor dem Tag `ab` gelten (Grundlage für eine Änderung ab diesem Tag). */
export function klickpreiseVor(platz: Arbeitsplatz, ab: string): KlickpreisAmTag[] {
  const vor = <T extends MitDatum>(liste: readonly T[], sl: (t: T) => string) =>
    geltendeEintraege(
      liste.filter((t) => t.gueltigAb !== ab),
      sl,
      ab,
    );
  const liste: KlickpreisAmTag[] = [];
  for (const k of vor(platz.klickpreise ?? [], klickSchluessel))
    liste.push({
      schluessel: `m|${klickSchluessel(k)}`,
      name: klickName(k),
      zehntelcent: k.zehntelcent,
    });
  for (const s of platz.schritte)
    for (const k of vor(s.klickpreise ?? [], klickSchluessel))
      liste.push({
        schluessel: `s|${s.schrittId}|${klickSchluessel(k)}`,
        name: `${klickName(k)} (${s.schrittId})`,
        zehntelcent: k.zehntelcent,
      });
  for (const g of platz.farbwerk?.gruppen ?? [])
    for (const k of vor(g.klicks, gruppenKlickSchluessel))
      liste.push({
        schluessel: `g|${g.name}|${gruppenKlickSchluessel(k)}`,
        name: gruppenKlickName(g, k),
        zehntelcent: k.zehntelcent,
      });
  return liste;
}

/**
 * Klickpreise ändern sich ab `ab`: je Farbe/Gruppe und Größe wird der vorher geltende Preis
 * kopiert, geändert und mit gueltigAb angehängt. `neu` ist ein Prozentsatz (z. B. 3,5) oder je
 * Schlüssel (siehe klickpreiseVor) der neue Preis in Zehntelcent; ohne Eintrag bleibt der Preis.
 * Gibt es genau an diesem Tag schon einen Eintrag, wird er ersetzt (Grundlage bleibt der Preis
 * davor). Toner am Klickpreis wird mit kopiert. Ergebnis: Eingabe für arbeitsplatzAendern.
 */
export function klickpreiseAendernAb(
  platz: Arbeitsplatz,
  neu: number | ReadonlyMap<string, number>,
  ab: string,
): Record<string, unknown> {
  const fortschreiben = <T extends MitDatum & { zehntelcent: number }>(
    liste: readonly T[],
    schluessel: (t: T) => string,
    praefix: string,
  ): T[] => {
    const ohneAmTag = liste.filter((t) => t.gueltigAb !== ab);
    const geltend = geltendeEintraege(ohneAmTag, schluessel, ab);
    const neue = geltend.map((t) => ({
      ...t,
      zehntelcent:
        typeof neu === 'number'
          ? mitProzent(t.zehntelcent, neu)
          : (neu.get(`${praefix}${schluessel(t)}`) ?? t.zehntelcent),
      gueltigAb: ab,
    }));
    return [...ohneAmTag, ...neue];
  };
  const eingabe: Record<string, unknown> = { ...platz };
  if ((platz.klickpreise ?? []).length > 0)
    eingabe['klickpreise'] = fortschreiben(platz.klickpreise ?? [], klickSchluessel, 'm|');
  eingabe['schritte'] = platz.schritte.map((s) =>
    (s.klickpreise ?? []).length === 0
      ? s
      : {
          ...s,
          klickpreise: fortschreiben(s.klickpreise ?? [], klickSchluessel, `s|${s.schrittId}|`),
        },
  );
  if (platz.farbwerk?.gruppen !== undefined) {
    eingabe['farbwerk'] = {
      ...platz.farbwerk,
      gruppen: platz.farbwerk.gruppen.map((g) => ({
        ...g,
        klicks: fortschreiben(g.klicks, gruppenKlickSchluessel, `g|${g.name}|`),
      })),
    };
  }
  return eingabe;
}

export type KlickVerlauf = {
  /** z. B. „farbig bis 210 × 297“, „4c bis 487 mm“, „Schwarz“. */
  name: string;
  stufen: { gueltigAb: string | null; zehntelcent: number; aenderungProzent: number | null }[];
};

/** Verlauf je Farbe/Gruppe und Größe – nur Reihen mit mehr als einem Eintrag. */
export function klickVerlauf(platz: Arbeitsplatz): KlickVerlauf[] {
  const reihen: KlickVerlauf[] = [];
  const sammeln = <T extends MitDatum & { zehntelcent: number }>(
    liste: readonly T[],
    schluessel: (t: T) => string,
    name: (t: T) => string,
  ) => {
    const nach = new Map<string, T[]>();
    for (const t of liste) nach.set(schluessel(t), [...(nach.get(schluessel(t)) ?? []), t]);
    for (const eintraege of nach.values()) {
      if (eintraege.length < 2) continue;
      const sortiert = [...eintraege].sort((a, b) =>
        (a.gueltigAb ?? '').localeCompare(b.gueltigAb ?? ''),
      );
      reihen.push({
        name: name(sortiert[0]!),
        stufen: sortiert.map((t, i) => {
          const vor = sortiert[i - 1];
          return {
            gueltigAb: t.gueltigAb ?? null,
            zehntelcent: t.zehntelcent,
            aenderungProzent:
              vor === undefined || vor.zehntelcent === 0
                ? null
                : Math.round(((t.zehntelcent - vor.zehntelcent) / vor.zehntelcent) * 1000) / 10,
          };
        }),
      });
    }
  };
  sammeln(platz.klickpreise ?? [], klickSchluessel, klickName);
  for (const g of platz.farbwerk?.gruppen ?? []) {
    sammeln(g.klicks, gruppenKlickSchluessel, (k) => gruppenKlickName(g, k));
  }
  return reihen;
}
