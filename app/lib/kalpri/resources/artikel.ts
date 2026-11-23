import {
  pruefeArtikelbestand,
  type Artikel,
  type ArtikelTeil,
  type Artikelbestand,
  type DruckWert,
  type ArtikelMerkmal,
  type Quelle,
  type Wer,
} from './artikel-schema';
import type { Lager } from './lager-schema';
import type { Produktion } from './produktion-schema';
import { mengenEinheitText } from './material';
import type { Fehler, PruefErgebnis } from './pruefung';

// ---------------------------------------------------------------------------
// Datei, IDs, Anlegen/Ändern/Kopieren/Archivieren

/** Leere Datei ohne Artikel. */
export function leererArtikelbestand(): Artikelbestand {
  return { version: 1, artikel: [] };
}

/** "A-" + mindestens 4 Ziffern, eins höher als die höchste "A-####"-ID; leer → "A-0001". */
export function naechsteArtikelId(bestand: Artikelbestand): string {
  let hoechste = 0;
  for (const a of bestand.artikel) {
    const zahl = Number.parseInt(/^A-(\d+)$/.exec(a.id)?.[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) hoechste = zahl;
  }
  return `A-${String(hoechste + 1).padStart(4, '0')}`;
}

function pruefeMitListe(
  bestand: Artikelbestand,
  eintraege: unknown[],
  index: number,
): PruefErgebnis<Artikelbestand> {
  const pruefung = pruefeArtikelbestand({ ...bestand, artikel: eintraege });
  if (pruefung.ok) return pruefung;
  const praefix = `artikel.${index}.`;
  const eigene = pruefung.fehler
    .filter((f) => f.pfad.startsWith(praefix))
    .map((f): Fehler => ({ pfad: f.pfad.slice(praefix.length), meldung: f.meldung }));
  return { ok: false, fehler: eigene.length > 0 ? eigene : pruefung.fehler };
}

function idAus(eingabe: unknown): string {
  const roh = eingabe as { id?: unknown } | null;
  return typeof roh?.id === 'string' ? roh.id.trim() : '';
}

function nichtGefunden(id: string): PruefErgebnis<never> {
  return { ok: false, fehler: [{ pfad: 'id', meldung: `Artikel ${id} nicht gefunden` }] };
}

/** Hängt einen Artikel an; fehlende oder leere ID → naechsteArtikelId. Fehler ohne Präfix. */
export function artikelHinzufuegen(
  bestand: Artikelbestand,
  eingabe: unknown,
): PruefErgebnis<Artikelbestand> {
  const mitId =
    typeof eingabe === 'object' && eingabe !== null && idAus(eingabe) === ''
      ? { ...(eingabe as Record<string, unknown>), id: naechsteArtikelId(bestand) }
      : eingabe;
  const eintraege = [...bestand.artikel, mitId];
  return pruefeMitListe(bestand, eintraege, eintraege.length - 1);
}

/** Ersetzt den Artikel mit gleicher ID. Unbekannt → „Artikel <id> nicht gefunden“. */
export function artikelAendern(
  bestand: Artikelbestand,
  eingabe: unknown,
): PruefErgebnis<Artikelbestand> {
  const id = idAus(eingabe);
  const index = bestand.artikel.findIndex((a) => a.id === id);
  if (index < 0) return nichtGefunden(id);
  const eintraege: unknown[] = bestand.artikel.map((a, i) => (i === index ? eingabe : a));
  return pruefeMitListe(bestand, eintraege, index);
}

/**
 * Kopie zum weiteren Konkretisieren: neue ID, „entstandenAus“ = Vorlage, nicht archiviert,
 * Titel mit „(Kopie)“. Die Vorlage bleibt unverändert; spätere Änderungen an ihr wirken nicht
 * auf die Kopie.
 */
export function artikelKopieren(
  bestand: Artikelbestand,
  id: string,
): PruefErgebnis<{ bestand: Artikelbestand; id: string }> {
  const vorlage = bestand.artikel.find((a) => a.id === id);
  if (!vorlage) return nichtGefunden(id);
  const neueId = naechsteArtikelId(bestand);
  const kopie: Artikel = JSON.parse(JSON.stringify(vorlage)) as Artikel;
  delete kopie.archiviert;
  // T186: eine Kopie ist ein neuer Artikel – erst nach eigener Freigabe im Shop
  delete kopie.freigegeben;
  kopie.id = neueId;
  kopie.entstandenAus = id;
  kopie.titel = `${vorlage.titel} (Kopie)`.slice(0, 120);
  const ergebnis = artikelHinzufuegen(bestand, kopie);
  return ergebnis.ok ? { ok: true, wert: { bestand: ergebnis.wert, id: neueId } } : ergebnis;
}

/** Archivieren (aus Liste und Vorschlägen heraus, bleibt für alte Kalkulationen) oder zurück. */
export function artikelArchivieren(
  bestand: Artikelbestand,
  id: string,
  archiviert: boolean,
): PruefErgebnis<Artikelbestand> {
  const artikel = bestand.artikel.find((a) => a.id === id);
  if (!artikel) return nichtGefunden(id);
  const neu: Artikel = { ...artikel };
  if (archiviert) neu.archiviert = true;
  else delete neu.archiviert;
  return artikelAendern(bestand, neu);
}

function schluesselSortieren(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(schluesselSortieren);
  if (typeof wert === 'object' && wert !== null) {
    const ergebnis: Record<string, unknown> = {};
    for (const k of Object.keys(wert).sort()) {
      ergebnis[k] = schluesselSortieren((wert as Record<string, unknown>)[k]);
    }
    return ergebnis;
  }
  return wert;
}

/** JSON mit 2 Leerzeichen; Artikel nach ID sortiert, Teile in ihrer Reihenfolge, Schlüssel
 *  alphabetisch. */
export function artikelbestandAlsJson(bestand: Artikelbestand): string {
  const artikel = [...bestand.artikel].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(schluesselSortieren({ ...bestand, artikel }), null, 2);
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }. */
export function artikelbestandAusJson(text: string): PruefErgebnis<Artikelbestand> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeArtikelbestand(roh);
}

// ---------------------------------------------------------------------------
// Texte

function zahlText(wert: number): string {
  return String(Math.round(wert * 10) / 10).replace('.', ',');
}

/** Format in mm, z. B. „148 × 210 mm“. */
export function formatText(f: { breiteUm: number; hoeheUm: number }): string {
  return `${zahlText(f.breiteUm / 1000)} × ${zahlText(f.hoeheUm / 1000)} mm`;
}

function seiteZahl(
  s: { farbe: 'farbig' | 'schwarz'; sonderfarben?: number | undefined } | undefined,
): string {
  if (!s) return '0';
  const grund = s.farbe === 'farbig' ? '4' : '1';
  return (s.sonderfarben ?? 0) > 0 ? `${grund}+${s.sonderfarben}` : grund;
}

/** Farbigkeit als Kurzform: „4/4“, „4/0“, „1/1“, „4+1/0“; nicht bedruckt → „unbedruckt“. */
export function druckText(d: DruckWert): string {
  if (d === 'ohne') return 'unbedruckt';
  return `${seiteZahl(d.vorne)}/${seiteZahl(d.hinten)}`;
}

/** Woraus? als Text; Lagermaterial und Artikel mit Namen, wenn bekannt. */
export function quelleText(
  q: Quelle,
  lager?: Pick<Lager, 'materialien'>,
  bestand?: Pick<Artikelbestand, 'artikel'>,
): string {
  if (q.art === 'sorte') return `${q.sorte} ${zahlText(q.grammatur)} g`;
  if (q.art === 'beschrieben') return q.text;
  if (q.art === 'material') {
    const m = lager?.materialien.find((x) => x.id === q.materialId);
    if (!m) return q.materialId;
    const g = m.grammatur === undefined ? '' : ` ${zahlText(m.grammatur)} g`;
    const cm = (u: number) => zahlText(u / 10_000);
    const format =
      m.form === 'Menge'
        ? `in ${mengenEinheitText(m.einheit)}`
        : m.form === 'Rolle'
          ? `${cm(m.breiteUm)} cm × ${zahlText(m.laengeM)} m`
          : `${cm(m.breiteUm)} × ${cm(m.hoeheUm)} cm`;
    return `${m.sorte}${g}, ${format}`;
  }
  const a = bestand?.artikel.find((x) => x.id === q.artikelId);
  return a ? `${a.titel} (${a.id})` : q.artikelId;
}

export const WER_TEXT: Record<Wer, string> = {
  haus: 'im Haus',
  lieferant: 'vom Lieferanten',
  lager: 'aus dem Lager',
};

type Eig<T> =
  | { zustand: 'fest'; wert: T }
  | { zustand: 'waehlbar'; werte: T[] }
  | { zustand: 'offen' };

/** Eine Eigenschaft als Text: fest → Wert; wählbar → „wählbar (A · B)“; offen → „offen“;
 *  mit `name` vorangestellt, wenn nicht festgelegt („Material offen“). */
function eigText<T>(e: Eig<T>, text: (wert: T) => string, name?: string): string {
  if (e.zustand === 'fest') return text(e.wert);
  const vorne = name === undefined ? '' : `${name} `;
  if (e.zustand === 'waehlbar') return `${vorne}wählbar (${e.werte.map(text).join(' · ')})`;
  return `${vorne}offen`;
}

/** Seitenzahl als Text: „32 Seiten“, „wählbar (8–64, durch 4)“, „Seiten offen“. */
export function seitenText(s: ArtikelTeil['seiten']): string {
  if (!s || s.zustand === 'offen') return 'Seiten offen';
  if (s.zustand === 'fest') return `${s.wert} ${s.wert === 1 ? 'Seite' : 'Seiten'}`;
  const teile: string[] = [];
  if (s.werte) teile.push(s.werte.join(' · '));
  if (s.bereich) {
    const schritt =
      s.bereich.schritt && s.bereich.schritt > 1 ? `, durch ${s.bereich.schritt}` : '';
    teile.push(`${s.bereich.von}–${s.bereich.bis}${schritt}`);
  }
  return `Seiten wählbar (${teile.join(' · ')})`;
}

function merkmalText(m: ArtikelMerkmal): string {
  return `${m.name}: ${eigText(m.wert, (w) => w)}`;
}

/** Ob das Teil sicher nicht bedruckt wird (dann zählen Seiten nicht). */
function unbedruckt(t: ArtikelTeil): boolean {
  return t.druck.zustand === 'fest' && t.druck.wert === 'ohne';
}

/**
 * Beschreibung aus Teilen und Merkmalen, z. B. „Broschüre A5 · Format 148 × 210 mm · Umschlag:
 * 4 Seiten, 4/4 auf GardaMatt 300 g · Inhalt: 32 Seiten, 4/4 auf GardaMatt 135 g ·
 * Bindung: Rückstich“. Nicht Festgelegtes erscheint als „Material wählbar (…)“,
 * „Farbigkeit offen“ usw.
 */
export function artikelBeschreibung(
  a: Artikel,
  lager?: Pick<Lager, 'materialien'>,
  bestand?: Pick<Artikelbestand, 'artikel'>,
): string {
  const teile: string[] = [a.titel, `Format ${eigText(a.endformat, formatText)}`];
  for (const t of a.teile) {
    const angaben: string[] = [];
    if (!unbedruckt(t)) angaben.push(seitenText(t.seiten));
    const druck = eigText(t.druck, druckText, 'Farbigkeit');
    const woraus = eigText(t.woraus, (q) => quelleText(q, lager, bestand), 'Material');
    // „4/4 auf GardaMatt 300 g“ nur, wenn beides feststeht; sonst getrennt
    if (t.druck.zustand === 'fest' && t.woraus.zustand === 'fest') {
      angaben.push(`${druck} auf ${woraus}`);
    } else {
      angaben.push(druck, woraus);
    }
    if (!(t.wer.zustand === 'fest' && t.wer.wert === 'haus')) {
      angaben.push(eigText(t.wer, (w) => WER_TEXT[w], 'Wer macht es?'));
    }
    for (const m of t.merkmale ?? []) angaben.push(merkmalText(m));
    const menge = t.jeProdukt > 1 ? `${t.jeProdukt} × ` : '';
    teile.push(`${menge}${t.name}: ${angaben.join(', ')}`);
  }
  for (const m of a.merkmale ?? []) teile.push(merkmalText(m));
  return teile.join(' · ');
}

// ---------------------------------------------------------------------------
// Stand (Konkretisieren)

export type ArtikelStand = {
  festgelegt: number;
  waehlbar: number;
  offen: number;
  /** Was die Kalkulation noch fragt (wählbar oder offen), z. B. „Inhalt: Seiten“, „Bindung“. */
  fragen: string[];
};

/**
 * Zählt die Eigenschaften nach Zustand: Endformat; je Teil Woraus, Bedruckt, Seiten (nicht bei
 * unbedruckten Teilen), Wer; Merkmale des Artikels und der Teile.
 */
export function artikelStand(a: Artikel): ArtikelStand {
  const stand: ArtikelStand = { festgelegt: 0, waehlbar: 0, offen: 0, fragen: [] };
  const zaehle = (zustand: 'fest' | 'waehlbar' | 'offen', frage: string) => {
    if (zustand === 'fest') stand.festgelegt += 1;
    else {
      if (zustand === 'waehlbar') stand.waehlbar += 1;
      else stand.offen += 1;
      stand.fragen.push(frage);
    }
  };
  zaehle(a.endformat.zustand, 'Endformat');
  for (const t of a.teile) {
    zaehle(t.woraus.zustand, `${t.name}: Papier/Material`);
    zaehle(t.druck.zustand, `${t.name}: Farbigkeit`);
    if (!unbedruckt(t)) zaehle(t.seiten?.zustand ?? 'offen', `${t.name}: Seiten`);
    zaehle(t.wer.zustand, `${t.name}: Wer macht es?`);
    for (const m of t.merkmale ?? []) zaehle(m.wert.zustand, `${t.name}: ${m.name}`);
  }
  for (const m of a.merkmale ?? []) zaehle(m.wert.zustand, m.name);
  return stand;
}

/** „Stand: 5 festgelegt · 3 wählbar · 1 offen“ bzw. „Stand: alles festgelegt“. */
export function standText(s: ArtikelStand): string {
  if (s.waehlbar === 0 && s.offen === 0) return 'Stand: alles festgelegt';
  return `Stand: ${s.festgelegt} festgelegt · ${s.waehlbar} wählbar · ${s.offen} offen`;
}

// ---------------------------------------------------------------------------
// Suche, Vorschläge, Sorten

/**
 * Artikel zur Suche: alle Wörter (ohne Groß-/Kleinschreibung, auch als Wortteil) müssen in
 * Nummer, Titel, Kunde, Beschreibung, Teilnamen oder Merkmalen (Name und Werte) vorkommen.
 * Archivierte nur mit `archivierte: true`. Nach Nummer sortiert.
 */
export function sucheArtikel(
  bestand: Artikelbestand,
  suche: string,
  optionen: { archivierte?: boolean } = {},
): Artikel[] {
  const woerter = suche
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  const merkmalWoerter = (m: ArtikelMerkmal) => [
    m.name,
    ...(m.wert.zustand === 'fest' ? [m.wert.wert] : []),
    ...(m.wert.zustand === 'waehlbar' ? m.wert.werte : []),
  ];
  return bestand.artikel
    .filter((a) => (optionen.archivierte === true) === (a.archiviert === true))
    .filter((a) => {
      const text = [
        a.id,
        a.titel,
        a.kunde ?? '',
        a.beschreibung ?? '',
        ...a.teile.map((t) => t.name),
        ...(a.merkmale ?? []).flatMap(merkmalWoerter),
        ...a.teile.flatMap((t) => (t.merkmale ?? []).flatMap(merkmalWoerter)),
      ]
        .join(' ')
        .toLowerCase();
      return woerter.every((w) => text.includes(w));
    })
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/**
 * Vorschläge für Merkmale aus allen nicht archivierten Artikeln: Namen und je Name die schon
 * benutzten Werte, ohne Doppelte (Groß-/Kleinschreibung egal, erste Schreibweise bleibt),
 * alphabetisch.
 */
export function merkmalVorschlaege(
  bestand: Artikelbestand,
  /** T112: Merkmale und Werte aus dem Katalog („Im Arbeitsweg“) kommen dazu. */
  produktion?: Pick<Produktion, 'arbeitsschritte'>,
): {
  namen: string[];
  werte: Record<string, string[]>;
} {
  const namen = new Map<string, string>();
  const werte = new Map<string, Map<string, string>>();
  const merke = (m: ArtikelMerkmal) => {
    const schluessel = m.name.trim().toLowerCase();
    if (!namen.has(schluessel)) namen.set(schluessel, m.name.trim());
    const liste = werte.get(schluessel) ?? new Map<string, string>();
    const alle =
      m.wert.zustand === 'fest' ? [m.wert.wert] : m.wert.zustand === 'waehlbar' ? m.wert.werte : [];
    for (const w of alle) {
      const k = w.trim().toLowerCase();
      if (!liste.has(k)) liste.set(k, w.trim());
    }
    werte.set(schluessel, liste);
  };
  for (const s of produktion?.arbeitsschritte ?? []) {
    if (s.imWeg?.art !== 'merkmal') continue;
    const w = s.imWeg.werte ?? [];
    merke({
      name: s.imWeg.name,
      wert: w.length > 0 ? { zustand: 'waehlbar', werte: w } : { zustand: 'offen' },
    } as ArtikelMerkmal);
  }
  for (const a of bestand.artikel) {
    if (a.archiviert === true) continue;
    for (const m of a.merkmale ?? []) merke(m);
    for (const t of a.teile) for (const m of t.merkmale ?? []) merke(m);
  }
  const sortiert = (xs: Iterable<string>) => [...xs].sort((x, y) => x.localeCompare(y, 'de'));
  const ergebnis: Record<string, string[]> = {};
  for (const [schluessel, name] of namen) {
    ergebnis[name] = sortiert((werte.get(schluessel) ?? new Map()).values());
  }
  return { namen: sortiert(namen.values()), werte: ergebnis };
}

export type Sorte = { sorte: string; grammatur: number; materialIds: string[] };

/**
 * Sorten im Lager: Bogen mit gleicher Sorte und Grammatur (Sorte ohne Groß-/Kleinschreibung)
 * zusammengefasst, mit den Lagermaterialien (Formaten) dazu; nach Sorte und Grammatur sortiert.
 */
export function sortenImLager(lager: Pick<Lager, 'materialien'>): Sorte[] {
  const gruppen = new Map<string, Sorte>();
  for (const m of lager.materialien) {
    if (m.form !== 'Bogen' || m.grammatur === undefined) continue;
    const schluessel = `${m.sorte.trim().toLowerCase()}|${m.grammatur}`;
    const g = gruppen.get(schluessel) ?? {
      sorte: m.sorte.trim(),
      grammatur: m.grammatur,
      materialIds: [],
    };
    g.materialIds.push(m.id);
    gruppen.set(schluessel, g);
  }
  return [...gruppen.values()].sort(
    (a, b) => a.sorte.localeCompare(b.sorte, 'de') || a.grammatur - b.grammatur,
  );
}
