/**
 * Kern des gemeinsamen Listenmusters (S7, T69): Suche, Filter aus dem Zusammenhang und
 * Tags wirken zusammen (UND); Gliederung mit fester Reihenfolge. Reine Funktionen, die
 * jede Stammdaten-Kategorie über ihre Beschreibung nutzt.
 */

/** Eine Zeilen-Spalte: Titel und Wert als reiner Text; `sortId` macht den Kopf anklickbar (T176). */
export type Spalte<T> = { titel: string; wert: (eintrag: T) => string; sortId?: string };

/** T176: ein Sortiermerkmal mit Vergleichswert; null = leer (steht immer am Ende). */
export type Sortierung<T> = { id: string; titel: string; wert: (eintrag: T) => number | null };

/** T176: gewählte Sortierung. `nach: 'name'` = Standard (gruppiert, Ordnung in der Gruppe). */
export type ListenSortierung = { nach: string; richtung: 'auf' | 'ab' };

/** Abgeleitete Statusangabe eines Eintrags (aus der Kategorie-Logik). */
export type StatusAngabe = { stand: 'ok' | 'hinweis' | 'fehler'; gruende: string[] };

/**
 * Beschreibung einer Stammdaten-Liste. Die Bausteine Suche, Gliederung, Zusammenhang und
 * Tags sind Kategorien-Funktionen; `gliederungsReihenfolge` gibt die feste Reihenfolge
 * der Gliederungsschlüssel vor (fehlt sie: Reihenfolge des ersten Auftretens).
 */
export type ListenBeschreibung<T> = {
  id: string;
  suchfelder: (eintrag: T) => readonly string[];
  gliederung?: (eintrag: T) => { schluessel: string; titel: string };
  gliederungsReihenfolge?: readonly string[];
  zusammenhang?: {
    /** Titel der Auswahl, z. B. „passt auf Arbeitsplatz“. */
    titel: string;
    passt: (eintrag: T, optionId: string) => boolean;
  };
  tags?: (eintrag: T) => readonly string[];
  spalten: readonly Spalte<T>[];
  status?: (eintrag: T) => StatusAngabe;
  /**
   * T173: Untergruppe innerhalb eines Abschnitts (z. B. Papiername): Einträge mit gleichem Wert
   * stehen unter einer Kopfzeile; die erste Spalte zeigt dann nur `kurz` (z. B. „135 g“).
   * Gruppen mit nur einem Eintrag bleiben normale Zeilen.
   */
  untergruppe?: (eintrag: T) => string;
  kurz?: (eintrag: T) => string;
  /** T176: Ordnung innerhalb einer Untergruppe (z. B. Grammatur → Fläche → Laufrichtung). */
  ordnung?: (a: T, b: T) => number;
  /** T176: Gliederung innerhalb einer Untergruppe (z. B. Grammatur); `kurz` nur beim Wechsel. */
  teilgruppe?: (eintrag: T) => string;
  /** T176: wählbare Sortierungen außer „Name“ (Standard). Andere lösen die Gruppen auf. */
  sortierungen?: readonly Sortierung<T>[];
};

const NAMEN = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * T176: Sortiert die Einträge. „name“ (oder unbekannt): nach Untergruppe alphabetisch, darin nach
 * `ordnung`; Richtung „ab“ dreht nur die Reihenfolge der Untergruppen. Sonst nach dem Wert der
 * Sortierung; leere Werte (null) immer am Ende, Gleichstand nach der Namensordnung. Stabil.
 */
export function listenSortieren<T>(
  eintraege: readonly T[],
  b: Pick<ListenBeschreibung<T>, 'untergruppe' | 'ordnung' | 'sortierungen'>,
  s: ListenSortierung = { nach: 'name', richtung: 'auf' },
): T[] {
  const nameVergleich = (x: T, y: T, gruppenFaktor: number): number => {
    if (b.untergruppe !== undefined) {
      const g = NAMEN.compare(b.untergruppe(x).trim(), b.untergruppe(y).trim());
      if (g !== 0) return g * gruppenFaktor;
    }
    return b.ordnung?.(x, y) ?? 0;
  };
  const merkmal = b.sortierungen?.find((x) => x.id === s.nach);
  const faktor = s.richtung === 'ab' ? -1 : 1;
  const mitIndex = eintraege.map((e, i) => ({ e, i }));
  mitIndex.sort((x, y) => {
    if (merkmal !== undefined) {
      const wx = merkmal.wert(x.e);
      const wy = merkmal.wert(y.e);
      if (wx === null && wy !== null) return 1;
      if (wx !== null && wy === null) return -1;
      if (wx !== null && wy !== null && wx !== wy) return (wx - wy) * faktor;
      const n = nameVergleich(x.e, y.e, 1);
      return n !== 0 ? n : x.i - y.i;
    }
    const n = nameVergleich(x.e, y.e, faktor);
    return n !== 0 ? n : x.i - y.i;
  });
  return mitIndex.map((x) => x.e);
}

/**
 * T176: true an jeder Zeile, mit der eine neue Teilgruppe (z. B. Grammatur) beginnt. Einträge ohne
 * Teilgruppe (leerer Wert) gelten immer als Beginn.
 */
export function teilgruppenWechsel<T>(
  eintraege: readonly T[],
  b: Pick<ListenBeschreibung<T>, 'teilgruppe'>,
): boolean[] {
  const t = b.teilgruppe;
  return eintraege.map((e, i) => {
    if (t === undefined || i === 0) return true;
    const wert = t(e);
    return wert === '' || wert !== t(eintraege[i - 1] as T);
  });
}

/** T173: Einträge eines Abschnitts in Untergruppen (Reihenfolge des ersten Auftretens). */
export function listenUntergruppen<T>(
  eintraege: readonly T[],
  b: Pick<ListenBeschreibung<T>, 'untergruppe'>,
): { titel: string | null; eintraege: T[] }[] {
  if (b.untergruppe === undefined) return [{ titel: null, eintraege: [...eintraege] }];
  const gruppen: { schluessel: string; titel: string; eintraege: T[] }[] = [];
  for (const e of eintraege) {
    const titel = b.untergruppe(e).trim();
    const schluessel = titel.toLowerCase();
    const g = gruppen.find((x) => x.schluessel === schluessel);
    if (g) g.eintraege.push(e);
    else gruppen.push({ schluessel, titel, eintraege: [e] });
  }
  return gruppen.map((g) => ({
    titel: g.eintraege.length > 1 ? g.titel : null,
    eintraege: g.eintraege,
  }));
}

/** Filterzustand der Liste: alle Bausteine gemeinsam (UND). */
export type ListenFilter = {
  /** Suchtext; jeder Eintrag wird über suchfelder durchsucht (ohne Groß-/Kleinschreibung). */
  suchbegriff: string;
  /** Gewählte Option des Zusammenhangs (z. B. Platz-ID) oder null = kein Filter. */
  zusammenhang: string | null;
  /** Gewählte Tag-IDs; der Eintrag muss sie alle haben. */
  tags: readonly string[];
};

type GliederungsBeschreibung<T> = Pick<
  ListenBeschreibung<T>,
  'gliederung' | 'gliederungsReihenfolge'
>;

/**
 * T176: Such-Normalform – klein, „70 × 100“/„70*100“/„70 x 100“ → „70x100“, „170 g“ → „170g“,
 * Leerraum zusammengezogen.
 */
export function suchNormalform(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x')
    .replace(/(\d)\s+g\b/g, '$1g')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prüft die Suchbegriffe über alle Suchfelder (ohne Groß-/Kleinschreibung). T176: Mehrere Wörter
 * müssen alle passen, jedes in irgendeinem Feld.
 */
function suchTreffer<T>(eintrag: T, b: ListenBeschreibung<T>, suchbegriff: string): boolean {
  const woerter = suchNormalform(suchbegriff)
    .split(' ')
    .filter((w) => w !== '');
  if (woerter.length === 0) return true;
  const felder = b.suchfelder(eintrag).map(suchNormalform);
  return woerter.every((w) => felder.some((feld) => feld.includes(w)));
}

/**
 * Die Einträge, auf die Suche, Zusammenhang und Tags gemeinsam zutreffen (UND), in
 * unveränderter Reihenfolge. Leere Filterbausteine passen alles. Mehrere gewählte Tags
 * müssen alle am Eintrag stehen (UND untereinander).
 */
export function listenTreffer<T>(
  eintraege: readonly T[],
  b: ListenBeschreibung<T>,
  filter: ListenFilter,
): T[] {
  return eintraege.filter((eintrag) => {
    if (!suchTreffer(eintrag, b, filter.suchbegriff)) return false;
    if (filter.zusammenhang !== null && !b.zusammenhang?.passt(eintrag, filter.zusammenhang)) {
      return false;
    }
    if (filter.tags.length > 0) {
      const hat = new Set(b.tags?.(eintrag) ?? []);
      if (!filter.tags.every((tag) => hat.has(tag))) return false;
    }
    return true;
  });
}

/** Ein Abschnitt der Gliederung: Schlüssel, Titel und seine Einträge (leere fehlen). */
export type ListenAbschnitt<T> = { schluessel: string; titel: string; eintraege: T[] };

/**
 * Gliedert die Einträge nach dem festen Merkmal. Mit `gliederungsReihenfolge` in dieser
 * Reihenfolge (unbekannte Schlüssel dahinter in der Reihenfolge des ersten Auftretens),
 * ohne Angabe: nach dem ersten Auftreten. Werte ohne Eintrag bleiben weg.
 */
export function listenAbschnitte<T>(
  eintraege: readonly T[],
  b: GliederungsBeschreibung<T>,
): ListenAbschnitt<T>[] {
  const gliederung = b.gliederung;
  if (gliederung === undefined) {
    return eintraege.length === 0 ? [] : [{ schluessel: '', titel: '', eintraege: [...eintraege] }];
  }
  const reihenfolge = b.gliederungsReihenfolge ?? [];
  const je = new Map<string, ListenAbschnitt<T>>();
  for (const eintrag of eintraege) {
    const wert = gliederung(eintrag);
    const abschnitt = je.get(wert.schluessel) ?? {
      schluessel: wert.schluessel,
      titel: wert.titel,
      eintraege: [],
    };
    abschnitt.eintraege.push(eintrag);
    je.set(wert.schluessel, abschnitt);
  }
  const geordnet = [
    ...reihenfolge.filter((schluessel) => je.has(schluessel)),
    ...[...je.keys()].filter((schluessel) => !reihenfolge.includes(schluessel)),
  ];
  const ergebnis: ListenAbschnitt<T>[] = [];
  for (const schluessel of geordnet) {
    const abschnitt = je.get(schluessel);
    if (abschnitt !== undefined) {
      ergebnis.push(abschnitt);
    }
  }
  return ergebnis;
}
