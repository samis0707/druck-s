import { produktionZumStichtag } from './klickpreis-stand';
import {
  GANZZAHLIGE_EINHEITEN,
  einheitAnzeige,
  formatDauer,
  formatEuro,
  ms,
  rundeKaufmaennisch,
  zehntelcent,
  type Einheit,
  type Geld,
} from '@druck/units';
import type { AusschiessVorlagen } from '@druck/layout-core';
import { greifendeAuspraegungen, merkmaleAusMaterial, type Merkmale } from './auspraegungen';
import { formatEuro3 } from './fremdarbeit';
import {
  pruefeKalkulationen,
  type Druck,
  type Format,
  type Kalkulation,
  type Kalkulationen,
  type Mengenquelle,
  type PapierwegWert,
  type Teil,
  type Zeile,
  type ZeilenArt,
} from './kalkulation-schema';
import type { Lager } from './lager-schema';
import { materialEinheitText, type Material } from './material';
import {
  druckbogenVorschlag,
  formatBogen,
  passtInFormat,
  rechnePapierweg,
  istStueckTeil,
  type DruckAngaben,
  type PapierwegErgebnis,
} from './papierweg';
import type { Preis } from './preis-schema';
import { besterRollenVorschlag, passendeRollen, type RollenVorschlag } from './rollen-vorschlag';
import { aktuellePreise, preisVergleichswerte } from './preise';
import { rechenweg, rechneProbe, type ProbeEingabe, type ProbeErgebnis } from './probe';
import {
  farbeImWerk,
  guenstigsteGruppen,
  planeDruck,
  wechselFuer,
  type DruckPlan,
  type GruppenPreis,
} from './farbwerk';
import { bogenArten, bogenDruckText, bogenJeArt } from './seitenfolge';
import { maschinenVerbrauch, verbrauchFuerSchritt } from './maschinen-verbrauch';
import { verbrauchAufschlag } from './aufschlaege';
import type {
  Arbeitsplatz,
  Farbwerk,
  KlickFarbe,
  Klickpreis,
  PlatzSchritt,
  Produktion,
  Toner,
  Verbrauch,
} from './produktion-schema';
import type { Fehler, PruefErgebnis } from './pruefung';

// ---------------------------------------------------------------------------
// Datei, IDs, Anlegen/Ändern/Entfernen

/** Leere Datei ohne Kalkulationen. */
export function leereKalkulationen(): Kalkulationen {
  return { version: 1, kalkulationen: [] };
}

function naechsteNummer(ids: readonly string[], muster: RegExp): number {
  let hoechste = 0;
  for (const id of ids) {
    const zahl = Number.parseInt(muster.exec(id)?.[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) hoechste = zahl;
  }
  return hoechste + 1;
}

/** "K-" + mindestens 4 Ziffern, eins höher als die höchste "K-####"-ID; leer → "K-0001". */
export function naechsteKalkulationId(daten: Kalkulationen): string {
  const n = naechsteNummer(
    daten.kalkulationen.map((k) => k.id),
    /^K-(\d+)$/,
  );
  return `K-${String(n).padStart(4, '0')}`;
}

/** "Z" + Zahl, eins höher als die höchste "Z#"-ID der Kalkulation; leer → "Z1". */
export function naechsteZeilenId(k: Pick<Kalkulation, 'zeilen'>): string {
  return `Z${naechsteNummer(
    k.zeilen.map((z) => z.id),
    /^Z(\d+)$/,
  )}`;
}

function pruefeMitListe(
  daten: Kalkulationen,
  eintraege: unknown[],
  index: number,
): PruefErgebnis<Kalkulationen> {
  const pruefung = pruefeKalkulationen({ ...daten, kalkulationen: eintraege });
  if (pruefung.ok) return pruefung;
  const praefix = `kalkulationen.${index}.`;
  const eigene = pruefung.fehler
    .filter((f) => f.pfad.startsWith(praefix))
    .map((f): Fehler => ({ pfad: f.pfad.slice(praefix.length), meldung: f.meldung }));
  return { ok: false, fehler: eigene.length > 0 ? eigene : pruefung.fehler };
}

function idAus(eingabe: unknown): string {
  const roh = eingabe as { id?: unknown } | null;
  return typeof roh?.id === 'string' ? roh.id.trim() : '';
}

/** Hängt eine Kalkulation an; fehlende oder leere ID → naechsteKalkulationId. Fehler der
 *  Kalkulation ohne Präfix (z. B. "zeilen.0.menge.mengen"). */
export function kalkulationHinzufuegen(
  daten: Kalkulationen,
  eingabe: unknown,
): PruefErgebnis<Kalkulationen> {
  const mitId =
    typeof eingabe === 'object' && eingabe !== null && idAus(eingabe) === ''
      ? { ...(eingabe as Record<string, unknown>), id: naechsteKalkulationId(daten) }
      : eingabe;
  const eintraege = [...daten.kalkulationen, mitId];
  return pruefeMitListe(daten, eintraege, eintraege.length - 1);
}

/** Ersetzt die Kalkulation mit gleicher ID. Unbekannt → „Kalkulation <id> nicht gefunden“. */
export function kalkulationAendern(
  daten: Kalkulationen,
  eingabe: unknown,
): PruefErgebnis<Kalkulationen> {
  const id = idAus(eingabe);
  const index = daten.kalkulationen.findIndex((k) => k.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Kalkulation ${id} nicht gefunden` }] };
  }
  const eintraege: unknown[] = daten.kalkulationen.map((k, i) => (i === index ? eingabe : k));
  return pruefeMitListe(daten, eintraege, index);
}

/** Entfernt die Kalkulation. Unbekannt → „Kalkulation <id> nicht gefunden“. */
export function kalkulationEntfernen(
  daten: Kalkulationen,
  id: string,
): PruefErgebnis<Kalkulationen> {
  if (!daten.kalkulationen.some((k) => k.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Kalkulation ${id} nicht gefunden` }] };
  }
  return {
    ok: true,
    wert: { ...daten, kalkulationen: daten.kalkulationen.filter((k) => k.id !== id) },
  };
}

function vergleichen(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

/** JSON mit 2 Leerzeichen; Kalkulationen nach ID sortiert (Zeilen behalten ihre Reihenfolge),
 *  Schlüssel alphabetisch. */
export function kalkulationenAlsJson(daten: Kalkulationen): string {
  const kalkulationen = [...daten.kalkulationen].sort((a, b) => vergleichen(a.id, b.id));
  return JSON.stringify(schluesselSortieren({ ...daten, kalkulationen }), null, 2);
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }. */
export function kalkulationenAusJson(text: string): PruefErgebnis<Kalkulationen> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeKalkulationen(roh);
}

// ---------------------------------------------------------------------------
// Rechnen

/** Klicks einer Klickart (z. B. „4c“, „1c“, „Weiß“): Anzahl und Kosten. */
export type KlickartPosten = { name: string; anzahl: number; kosten: Geld };

/** Klicks eines Druck-Arbeitsgangs: zusammen, je Klickart und Toner. */
export type Klicks = {
  anzahl: number;
  kosten: Geld;
  toner: Geld | null;
  jeKlickart: KlickartPosten[];
};

/**
 * Werte, mit denen eine Zeile gerechnet wurde (T98, für die Rechenweg-Tabelle): beim Arbeitsgang
 * Leistung je Stunde, Rüsten, Vollkosten-Satz, je mit „von Hand“; beim Material (Bogen/Stück)
 * der Preis je 1.000. Nur gesetzt, wenn die Zeile so weit gerechnet hat.
 */
export type ZeilenWerte =
  | {
      art: 'arbeitsgang';
      jeStunde: number;
      leistungVonHand: boolean;
      ruestenMs: number;
      ruestenVonHand: boolean;
      satzVoll: Geld | null;
      satzVonHand: boolean;
      /** Läuft im selben Durchlauf mit diesem Schritt (keine eigene Laufzeit; T99). */
      laeuftMit?: string;
      /** T156: Wartezeit danach in ms (kostet nichts, nur Durchlaufzeit). */
      wartezeitMs?: number;
    }
  | { art: 'material'; je1000: Geld; vonHand: boolean };

export type ZeilenErgebnis = {
  zeileId: string;
  art: ZeilenArt;
  /** Anzeige, z. B. „Digitalkarton (L4)“, „Digitaldruck Toner – Digitaldruck“. */
  titel: string;
  /** Menge der Zeile (bei Arbeitsgängen die gute Menge ohne Zuschuss); null = nicht bestimmbar. */
  menge: number | null;
  /** T149: einmalige Werkzeugkosten (Stanzform), in den Kosten der Zeile enthalten. */
  werkzeugZehntelcent?: number;
  einheit: string;
  /** Bei Arbeitsgängen: Menge inklusive Zuschuss. */
  mengeGesamt: number | null;
  /** Bei Material: einkalkulierte (abgerechnete) Menge nach Rundung; sonst null. */
  mengeAbgerechnet: number | null;
  zeitMs: number;
  kostenVoll: Geld | null;
  kostenTeil: Geld | null;
  /** Beitrag zum Verkauf (Kosten + Aufschlag); null, wenn die Kosten fehlen. */
  verkauf: Geld | null;
  /** Vollkosten + Aufschläge dieser Zeile (Lieferant, Material, eigener), ohne Gewinnaufschlag
   *  – das, was z. B. an Paginanet als Einkaufspreis geht. */
  kostenMitZeilenaufschlag: Geld | null;
  /** Druck: Klicks (bedruckte Seiten inkl. Zuschuss, Sonderfarben je eigener Klick); toner =
   *  Toner extra nach Fläche und Deckung (null: im Klick enthalten). */
  klicks: Klicks | null;
  rechenweg: string[];
  hinweise: string[];
  /** Arbeitsgang: Gründe, warum die Maschine nicht geeignet ist (Sonderfall, Grenzen; T84).
   *  Nur gesetzt, wenn es Gründe gibt. Die Zeile rechnet trotzdem. */
  ungeeignet?: string[];
  /** Gerechnete Werte für die Rechenweg-Tabelle (T98); nur gesetzt, wenn vorhanden. */
  werte?: ZeilenWerte;
};

export type AuflagenErgebnis = {
  auflage: number;
  zeilen: ZeilenErgebnis[];
  zeitMs: number;
  summeVoll: Geld;
  summeTeil: Geld;
  /** false, wenn mindestens eine Zeile keine Vollkosten hat. */
  vollstaendig: boolean;
  /** false, wenn mindestens eine Zeile keine Teilkosten hat. */
  teilVollstaendig: boolean;
  verkauf: Geld;
  /** Summe der Kosten mit Zeilenaufschlägen, ohne Gewinnaufschlag (für Paginanet). */
  kostenMitZeilenaufschlag: Geld;
  jeStueck: Geld;
  je100: Geld;
  je1000: Geld;
  /** Verkauf − Teilkosten. */
  deckungsbeitrag: Geld;
  /** Papierwege der Teile nach der Rückwärtskalkulation. */
  papierwege: TeilKette[];
  /** Klicks des Auftrags je Klickart (alle Druckzeilen). */
  klicksJeKlickart: KlickartPosten[];
};

export type KalkulationsErgebnis = {
  einheit: Einheit;
  gewinnProzent: number;
  auflagen: AuflagenErgebnis[];
};

const ganzzahlig = (e: string) => (GANZZAHLIGE_EINHEITEN as readonly string[]).includes(e);

function anzahl(wert: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(wert);
}

/** T167: kleine Verbrauchsmengen lesbar – Bruch „1/50.000“ statt „0“, sonst bis 6 Stellen. */
function kleineMenge(wert: number): string {
  if (wert > 0 && wert < 1) {
    const kehr = 1 / wert;
    const ganz = Math.round(kehr);
    if (ganz >= 2 && Math.abs(kehr - ganz) < 1e-6 * ganz)
      return `1/${new Intl.NumberFormat('de-DE').format(ganz)}`;
  }
  return new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 4 }).format(wert);
}

/** Wert einer Liste je Auflage: ein Wert gilt für alle, sonst der Wert an Stelle i. */
function jeAuflage<T>(liste: readonly T[], i: number): T | undefined {
  return liste.length === 1 ? liste[0] : liste[i];
}

/**
 * Menge aus der Mengenquelle für Auflage Nr. i. auflage: Auflage × faktor ÷ teiler + fest,
 * bei ganzzahliger Einheit aufgerundet, sonst auf 0,01 aufgerundet.
 */
export function mengeAusQuelle(
  quelle: Mengenquelle,
  auflagen: readonly number[],
  i: number,
  einheit: string,
): number | null {
  if (quelle.art === 'hand') return jeAuflage(quelle.mengen, i) ?? null;
  if (quelle.art === 'auftrag') return i < auflagen.length ? 1 : null;
  // Papierweg und Produkt brauchen die Rückwärtskalkulation der Kalkulation
  if (quelle.art === 'papierweg' || quelle.art === 'produkt') return null;
  const auflage = auflagen[i];
  if (auflage === undefined) return null;
  const roh = (auflage * (quelle.faktor ?? 1)) / (quelle.teiler ?? 1);
  // kleine Gleitkomma-Reste (z. B. 50,0000001) nicht aufrunden
  const glatt = Math.round(roh * 1e6) / 1e6;
  const gerundet = ganzzahlig(einheit) ? Math.ceil(glatt) : Math.ceil(glatt * 100) / 100;
  return gerundet + (quelle.fest ?? 0);
}

/** Betrag × (1 + Prozent), Prozent über Hundertstel ganzzahlig, kaufmännisch gerundet. */
function mitAufschlag(g: Geld, prozent: number): Geld {
  return zehntelcent(
    g.zehntelcent + rundeKaufmaennisch((g.zehntelcent * Math.round(prozent * 100)) / 10_000),
  );
}

/**
 * Verkauf einer Zeile mit eigenem Aufschlag (% und/oder fest): Kosten mit Zeilenaufschlag und
 * – wenn gewinnZusaetzlich (Standard) – zusätzlich der Gewinnaufschlag der Kalkulation.
 * Ohne eigenen Aufschlag: Kosten + Gewinnaufschlag.
 */
function zeilenVerkauf(
  kosten: Geld,
  prozent: number | undefined,
  festZehntelcent: number | undefined,
  gewinnZusaetzlich: boolean | undefined,
  gewinn: number,
): { mit: Geld; verkauf: Geld; eigener: boolean; zusaetzlich: boolean } {
  const eigener = prozent !== undefined || festZehntelcent !== undefined;
  if (!eigener) {
    return { mit: kosten, verkauf: mitAufschlag(kosten, gewinn), eigener, zusaetzlich: true };
  }
  const mit = zehntelcent(mitAufschlag(kosten, prozent ?? 0).zehntelcent + (festZehntelcent ?? 0));
  const zusaetzlich = gewinnZusaetzlich ?? true;
  return { mit, verkauf: zusaetzlich ? mitAufschlag(mit, gewinn) : mit, eigener, zusaetzlich };
}

/** Rechenweg-Zeile zum Gewinnaufschlag nach einem eigenen Aufschlag. */
function gewinnText(z: ReturnType<typeof zeilenVerkauf>, gewinn: number): string | null {
  if (!z.eigener) return null;
  return z.zusaetzlich
    ? `+ Gewinnaufschlag ${anzahl(gewinn)} %: ${formatEuro(z.mit)} → ${formatEuro(z.verkauf)}`
    : 'Aufschlag ersetzt den Gewinnaufschlag';
}

function leer(zeile: Zeile, titel: string, einheit: string): ZeilenErgebnis {
  return {
    zeileId: zeile.id,
    art: zeile.art,
    titel: zeile.bezeichnung ?? titel,
    menge: null,
    einheit,
    mengeGesamt: null,
    mengeAbgerechnet: null,
    zeitMs: 0,
    kostenVoll: null,
    kostenTeil: null,
    verkauf: null,
    kostenMitZeilenaufschlag: null,
    klicks: null,
    rechenweg: [],
    hinweise: [],
  };
}

type Umgebung = {
  k: Kalkulation;
  produktion: Produktion;
  lager: Lager;
  vorlagen: AusschiessVorlagen | undefined;
  stichtag: string;
  gewinn: number;
};

function materialName(m: Material): string {
  const g = m.grammatur === undefined ? '' : ` ${m.grammatur} g`;
  return `${m.sorte}${g} (${m.id})`;
}

/** Menge einer Zeile aus der Rückwärtskalkulation des Papierwegs (je Auflage). */
type KettenMenge = {
  menge: number | null;
  stapel?: number;
  /** Format, das der Schritt verarbeitet (Druckbogen, Rohbogen oder Endformat). */
  format?: Format;
  nutzen?: number;
  text: string;
  hinweise: string[];
};

/** Papierweg eines Teils für eine Auflage nach der Rückwärtskalkulation. */
export type TeilKette = {
  teilId: string;
  /** Papierweg brutto (Zuschuss = Summe der Zuschüsse aller Schritte, in Druckbogen). */
  papierweg: PapierwegErgebnis;
  /** Zuschuss je Zeile in Druckbogen (vom letzten zum ersten Schritt gerechnet). */
  zuschuesse: { zeileId: string; druckbogen: number }[];
  /** Nutzen, die das Teil für das Produkt liefern muss (Exemplare brutto × je Produkt). */
  nutzenNetto: number;
};

type Kette = {
  /** Exemplare brutto vor dem ersten Produkt-Schritt (Auflage + deren Zuschüsse). */
  produktBrutto: number;
  teile: TeilKette[];
  mengen: Map<string, KettenMenge>;
};

const WERT_TEXT: Record<PapierwegWert, string> = {
  nutzen: 'Nutzen',
  druckbogen: 'Druckbogen',
  rohbogen: 'Rohbogen',
  vorschneiden: 'Schnitte Vorschneiden',
  endschnitt: 'Schnitte Endschnitt',
  stapel: 'Stapel',
};

/** Probe-Eingabe eines Arbeitsgangs (gemeinsam für Rückwärtskalkulation und Rechnung). */
function probeEingabeFuer(
  zeile: Extract<Zeile, { art: 'arbeitsgang' }>,
  i: number,
  u: Umgebung,
  menge: number,
  stapel: number | undefined,
  hinweise: string[],
  aus?: Pick<KettenMenge, 'format' | 'nutzen'>,
): ProbeEingabe {
  const merkmale: Merkmale = {};
  const teilMaterial =
    zeile.menge.art === 'papierweg'
      ? (u.k.teile ?? []).find((t) => t.id === (zeile.menge as { teilId: string }).teilId)
          ?.materialId
      : undefined;
  const materialId = zeile.materialId ?? teilMaterial;
  if (materialId !== undefined) {
    const m = u.lager.materialien.find((x) => x.id === materialId);
    if (m) Object.assign(merkmale, merkmaleAusMaterial(m));
    else if (zeile.materialId !== undefined) hinweise.push(`Material ${materialId} nicht im Lager`);
  }
  // Papierweg: das verarbeitete Format statt des Lagerformats, Nutzen aus dem Papierweg
  if (aus?.format) {
    merkmale.bogenbreiteUm = aus.format.breiteUm;
    merkmale.bogenhoeheUm = aus.format.hoeheUm;
  }
  if (aus?.nutzen !== undefined) merkmale.nutzen = aus.nutzen;
  if (zeile.druck !== undefined) merkmale.farben = zeile.druck.vorne.farbe === 'farbig' ? 4 : 1;
  if (zeile.faecher !== undefined) merkmale.faecher = zeile.faecher;
  else if (zeile.art === 'arbeitsgang' && zeile.menge.art === 'produkt') {
    // T144: belegte Stationen = Blatt je Exemplar – Einflüsse können danach fragen
    const blatt = (u.k.teile ?? []).reduce((summe, t) => summe + t.jeProdukt, 0);
    if (blatt > 0) merkmale.faecher = blatt;
  }
  if (zeile.farben !== undefined) merkmale.farben = zeile.farben;
  if (zeile.nutzen !== undefined) merkmale.nutzen = zeile.nutzen;
  if (zeile.einstellungen !== undefined) merkmale.einstellungen = zeile.einstellungen;
  merkmale.menge = menge;

  const eingabe: ProbeEingabe = {
    platzId: zeile.platzId,
    schrittId: zeile.schrittId,
    menge,
    merkmale,
  };
  if (zeile.druck?.hinten !== undefined) eingabe.durchgaenge = 2;
  if (zeile.profil !== undefined) eingabe.profil = zeile.profil;
  if (zeile.verbrauchWahl !== undefined) eingabe.verbrauchWahl = zeile.verbrauchWahl;
  if (zeile.stanzformId !== undefined) {
    const form = (u.lager.stanzformen ?? []).find((f) => f.id === zeile.stanzformId);
    if (!form) hinweise.push(`Stanzform ${zeile.stanzformId} nicht im Lager`);
    else if (form.leistungsaenderung) eingabe.werkzeug = form.leistungsaenderung;
  }
  // Stapel von Hand/aus der Auflage; aus Papierweg/Produkt kommt er aus der Rückwärtskalkulation
  const stapelVonHand =
    zeile.stapel === undefined ? null : mengeAusQuelle(zeile.stapel, u.k.auflagen, i, 'Stapel');
  if (stapelVonHand !== null) {
    eingabe.mengen = { Stapel: stapelVonHand };
  } else if (stapel !== undefined) {
    eingabe.mengen = { Stapel: stapel };
  }
  if (zeile.aenderung !== undefined) eingabe.arbeitsgang = zeile.aenderung;
  if (zeile.handwerte !== undefined) {
    const h: NonNullable<ProbeEingabe['handwerte']> = {};
    if (zeile.handwerte.leistungJeStunde !== undefined) {
      h.leistungJeStunde = zeile.handwerte.leistungJeStunde;
    }
    if (zeile.handwerte.ruestenMs !== undefined) h.ruestenMs = zeile.handwerte.ruestenMs;
    if (zeile.handwerte.zuschuss !== undefined) h.zuschuss = zeile.handwerte.zuschuss;
    if (zeile.handwerte.stundensatzZehntelcent !== undefined) {
      h.stundensatzZehntelcent = zeile.handwerte.stundensatzZehntelcent;
    }
    eingabe.handwerte = h;
  }
  return eingabe;
}

/** T156: Dauer lesbar, z. B. „30 min“, „2 h“, „1 h 30 min“. */
function dauerAnzeige(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/**
 * T149: einmalige Werkzeugkosten der Zeile in Zehntelcent; null = keine. Vorhandene Stanzform:
 * ihr Anschaffungspreis, solange sie nicht „bezahlt“ ist; neue Form: der Preis an der Zeile.
 * „berechnen“ an der Zeile geht der Vorgabe vor.
 */
function werkzeugKosten(
  zeile: Extract<Zeile, { art: 'arbeitsgang' }>,
  u: Umgebung,
  e: ZeilenErgebnis,
): number | null {
  const wahl = zeile.werkzeug;
  if (zeile.stanzformId !== undefined) {
    const form = (u.lager.stanzformen ?? []).find((f) => f.id === zeile.stanzformId);
    if (!form) return null;
    const preis = form.anschaffungZehntelcent;
    const berechnen = wahl?.berechnen ?? (form.bezahlt !== true && preis !== undefined);
    if (!berechnen) {
      e.rechenweg.push(`Stanzform ${form.id} vorhanden – keine Werkzeugkosten`);
      return null;
    }
    if (preis === undefined) {
      e.hinweise.push(`Stanzform ${form.id}: kein Anschaffungspreis – Werkzeug rechnet nicht`);
      return null;
    }
    e.rechenweg.push(`Werkzeug einmalig: Stanzform ${form.id} ${formatEuro(zehntelcent(preis))}`);
    return preis;
  }
  if (wahl?.neuZehntelcent === undefined || wahl.berechnen === false) return null;
  e.rechenweg.push(
    `Werkzeug einmalig: neue Stanzform ${formatEuro(zehntelcent(wahl.neuZehntelcent))}`,
  );
  return wahl.neuZehntelcent;
}

/** Grenzen des Schritts am Platz, sonst des Platzes. */
function grenzeVon(
  u: Umgebung,
  platzId: string,
  schrittId: string,
  feld:
    | 'einlegehoeheUm'
    | 'randUm'
    | 'abstandUm'
    | 'nutzenMax'
    | 'stationen'
    | 'stueckJeDurchgang'
    | 'faecher',
  zeile?: Extract<Zeile, { art: 'arbeitsgang' }>,
): number | undefined {
  const platz = (u.produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  const amPlatz = platz?.schritte?.find((s) => s.schrittId === schrittId);
  // T158: ein Einfluss kann die Fassung ändern (z. B. „über 250 g nur 10 Stationen“)
  if (
    zeile !== undefined &&
    platz !== undefined &&
    (feld === 'einlegehoeheUm' || feld === 'stationen' || feld === 'stueckJeDurchgang')
  ) {
    const greifen = greifendeAuspraegungen(platz, schrittId, merkmaleFuerFassung(u, zeile));
    for (let n = greifen.length - 1; n >= 0; n--) {
      const wert = greifen[n]?.wirkung.fassung?.[feld];
      if (wert !== undefined) return wert;
    }
  }
  return amPlatz?.grenzen?.[feld] ?? platz?.grenzen?.[feld];
}

/** T158: Merkmale, die vor der Mengenrechnung feststehen (Material, belegte Stationen). */
function merkmaleFuerFassung(u: Umgebung, zeile: Extract<Zeile, { art: 'arbeitsgang' }>): Merkmale {
  const m: Merkmale = {};
  const teilId = zeile.menge.art === 'papierweg' ? zeile.menge.teilId : undefined;
  const materialId = zeile.materialId ?? (u.k.teile ?? []).find((t) => t.id === teilId)?.materialId;
  const material = u.lager.materialien.find((x) => x.id === materialId);
  if (material) Object.assign(m, merkmaleAusMaterial(material));
  if (zeile.menge.art === 'produkt') {
    const blatt = (u.k.teile ?? []).reduce((summe, t) => summe + t.jeProdukt, 0);
    if (blatt > 0) m.faecher = blatt;
    // Material der Teile (z. B. Grammatur beim Zusammentragen): das schwerste zählt
    const schwer = (u.k.teile ?? [])
      .map((t) => u.lager.materialien.find((x) => x.id === t.materialId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined)
      .sort((a, b) => (b.grammatur ?? 0) - (a.grammatur ?? 0))[0];
    if (schwer && !material) Object.assign(m, merkmaleAusMaterial(schwer), { faecher: m.faecher });
  }
  return m;
}

/**
 * Rollen-Vorschlag (T105): alle passenden Rollen derselben Sorte durchrechnen (gleicher
 * Papierweg), Kosten aus dem günstigsten Preis je m². Ist eine andere Rolle günstiger (ohne
 * Preise: weniger m²), kommt ein Hinweis.
 */
function rollenVorschlagSetzen(
  e: PapierwegErgebnis,
  teil: Teil,
  rolle: Extract<Material, { form: 'Rolle' }>,
  auflage: number,
  angaben: DruckAngaben,
  u: Umgebung,
  breite: { minUm: number | undefined; maxUm: number | undefined },
): void {
  const liste: RollenVorschlag[] = passendeRollen(
    u.lager.materialien,
    rolle,
    breite.minUm,
    breite.maxUm,
  ).map((m) => {
    const w = m.id === rolle.id ? e : rechnePapierweg(teil, m, auflage, angaben);
    const plan = w.rollenPlan;
    const m2 = plan?.quadratmeter ?? null;
    const jeM2 = aktuellePreise(u.lager, m.id, u.stichtag)
      .map((p) => preisVergleichswerte(m, p).jeM2?.zehntelcent)
      .filter((x): x is number => x !== undefined)
      .sort((a, b) => a - b)[0];
    return {
      materialId: m.id,
      breiteUm: m.breiteUm,
      nutzenQuer: plan?.nutzenJeAbschnitt ?? null,
      gedreht: plan?.nutzenLage?.gedreht ?? false,
      laufmeter: plan?.laufmeter ?? null,
      quadratmeter: m2,
      genutztProzent: plan?.papierGenutztProzent ?? null,
      kosten: m2 === null || jeM2 === undefined ? null : zehntelcent(Math.round(m2 * jeM2)),
      aktuell: m.id === rolle.id,
    };
  });
  if (liste.length < 2) return;
  liste.sort((a, b) => a.breiteUm - b.breiteUm);
  e.rollenVorschlag = liste;
  const best = besterRollenVorschlag(liste);
  const jetzt = liste.find((v) => v.aktuell);
  if (best === null || best.aktuell || jetzt === undefined) return;
  const m2 = (v: RollenVorschlag) => `${anzahl(v.quadratmeter ?? 0)} m²`;
  const cm = (um: number) => anzahl(um / 10_000);
  e.hinweise.push(
    `Weniger Papier mit Rolle ${best.materialId} (${cm(best.breiteUm)} cm): ${m2(best)} statt ${m2(jetzt)}` +
      (best.kosten !== null && jetzt.kosten !== null
        ? `, ${formatEuro(best.kosten)} statt ${formatEuro(jetzt.kosten)}`
        : '') +
      ` – ${best.genutztProzent ?? 0} % statt ${jetzt.genutztProzent ?? 0} % genutzt`,
  );
}

/** Mindestformat des Schritts am Platz, sonst des Platzes (T105: Mindest-Rollenbreite). */
function formatMinVon(u: Umgebung, platzId: string, schrittId: string): Format | undefined {
  const platz = (u.produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  const amPlatz = platz?.schritte?.find((s) => s.schrittId === schrittId);
  return amPlatz?.grenzen?.formatMin ?? platz?.grenzen?.formatMin;
}

/** Höchstformat des Schritts am Platz, sonst des Platzes. */
function formatMaxVon(u: Umgebung, platzId: string, schrittId: string): Format | undefined {
  const platz = (u.produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  const amPlatz = platz?.schritte?.find((s) => s.schrittId === schrittId);
  return amPlatz?.grenzen?.formatMax ?? platz?.grenzen?.formatMax;
}

function stapelAus(
  bogen: number,
  dickeUm: number | null,
  einlegehoeheUm: number | undefined,
): { stapel: number; hinweis?: string } {
  if (dickeUm === null || einlegehoeheUm === undefined) {
    return {
      stapel: 1,
      hinweis: 'Stapel nicht berechnet (Dicke oder Einlegehöhe fehlt) – 1 Stapel',
    };
  }
  return { stapel: Math.max(1, Math.ceil((bogen * dickeUm) / einlegehoeheUm)) };
}

/**
 * Rückwärtskalkulation je Teil für Auflage Nr. i: Die Zeilen eines Teils werden vom letzten zum
 * ersten Schritt gerechnet. Jeder Schritt verarbeitet Netto + Zuschüsse aller späteren Schritte
 * (seine gute Menge) und legt seinen eigenen Zuschuss (aus Arbeitsplatz, Ausprägungen oder von
 * Hand) dazu. Zuschüsse in Nutzen, Druckbogen oder Rohbogen werden in Druckbogen umgerechnet und
 * erhöhen die Druckbogen davor; Schnitte erzeugen keinen Papier-Zuschuss. Der Papierweg brutto
 * (Rand vom Druckplatz, Zuschuss = Summe) gibt dem Material die Rohbogen.
 */
function rechneKette(i: number, u: Umgebung): Kette {
  const mengen = new Map<string, KettenMenge>();
  const teile: TeilKette[] = [];
  const auflageNetto = u.k.auflagen[i] ?? 0;

  // 1. Produkt-Schritte (nach dem Zusammenführen) rückwärts: Exemplare + Zuschüsse
  let spaeterEx = 0;
  const produktZeilen = u.k.zeilen.filter(
    (z): z is Extract<Zeile, { art: 'arbeitsgang' }> =>
      z.art === 'arbeitsgang' && z.menge.art === 'produkt',
  );
  for (let n = produktZeilen.length - 1; n >= 0; n--) {
    const zeile = produktZeilen[n];
    if (zeile === undefined || zeile.menge.art !== 'produkt') continue;
    const f = zeile.menge.faktor ?? 1;
    // T144: Fassung der Maschine (Stück je Durchgang) geht dem Teiler der Tätigkeit vor
    const fassung = grenzeVon(u, zeile.platzId, zeile.schrittId, 'stueckJeDurchgang', zeile);
    const t = fassung ?? zeile.menge.teiler ?? 1;
    const ex = auflageNetto + spaeterEx;
    const menge = Math.ceil(Math.round(((ex * f) / t) * 1e6) / 1e6);
    let text = `${anzahl(auflageNetto)} Exemplare`;
    if (spaeterEx > 0) text += ` + ${anzahl(spaeterEx)} für spätere Zuschüsse`;
    // T104: Stapel aus den Exemplaren (z. B. 50 Exemplare je Stapel)
    let stapel: number | undefined;
    if (zeile.stapel?.art === 'produkt') {
      const sf = zeile.stapel.faktor ?? 1;
      const st = zeile.stapel.teiler ?? 1;
      stapel = Math.max(1, Math.ceil(Math.round(((ex * sf) / st) * 1e6) / 1e6));
      text += ` in ${anzahl(stapel)} ${stapel === 1 ? 'Stapel' : 'Stapeln'}`;
    }
    if (f !== 1) text += ` × ${anzahl(f)}`;
    if (t !== 1)
      text += ` ÷ ${anzahl(t)}${fassung === undefined ? '' : ' je Durchgang (Fassung der Maschine)'}`;
    mengen.set(zeile.id, {
      menge,
      ...(stapel === undefined ? {} : { stapel }),
      text,
      hinweise: [],
    });
    const probe = rechneProbe(u.produktion, probeEingabeFuer(zeile, i, u, menge, stapel, []));
    if (!probe.ok) continue;
    spaeterEx += Math.ceil((probe.wert.zuschuss * t) / f);
  }
  const auflage = auflageNetto + spaeterEx;

  // 2. Teile: Netto = Exemplare brutto × je Produkt, dann eigene Schritte rückwärts
  for (const teilAngabe of u.k.teile ?? []) {
    const material =
      teilAngabe.materialId === undefined
        ? undefined
        : u.lager.materialien.find((m) => m.id === teilAngabe.materialId);
    const zeilen = u.k.zeilen.filter(
      (z) =>
        (z.art === 'arbeitsgang' || z.art === 'material') &&
        z.menge.art === 'papierweg' &&
        z.menge.teilId === teilAngabe.id,
    );
    // Druckmaschine: der Schritt mit Druck-Angaben, sonst der erste auf Druckbogen
    const aufDruckbogen = zeilen.filter(
      (z) =>
        z.art === 'arbeitsgang' && z.menge.art === 'papierweg' && z.menge.wert === 'druckbogen',
    );
    const druck =
      aufDruckbogen.find((z) => z.art === 'arbeitsgang' && z.druck !== undefined) ??
      aufDruckbogen[0];
    const randUm =
      druck?.art === 'arbeitsgang'
        ? grenzeVon(u, druck.platzId, druck.schrittId, 'randUm')
        : undefined;
    // Ausschießschema des Teils (fehlt: automatisch)
    const vorab: string[] = [];
    const vorabHinweise: string[] = [];
    const schema =
      teilAngabe.schemaId === undefined
        ? undefined
        : u.vorlagen?.schemas.find((s) => s.id === teilAngabe.schemaId);
    if (teilAngabe.schemaId !== undefined && schema === undefined) {
      vorabHinweise.push(`Ausschießschema ${teilAngabe.schemaId} nicht gefunden – automatisch`);
    }
    const abstandUm =
      druck?.art === 'arbeitsgang' && material?.form === 'Rolle'
        ? grenzeVon(u, druck.platzId, druck.schrittId, 'abstandUm')
        : undefined;
    const angaben = {
      ...(randUm === undefined ? {} : { randUm }),
      ...(abstandUm === undefined ? {} : { abstandUm }),
      ...(schema === undefined ? {} : { schema }),
    };
    // Druckbogen: vom Teil, sonst vom Schema; passt der Rohbogen nicht in die Druckmaschine,
    // wird vorgeschnitten
    const max =
      druck?.art === 'arbeitsgang' ? formatMaxVon(u, druck.platzId, druck.schrittId) : undefined;
    // Stück-Teile (T101) haben keinen Druckbogen: kein Vorschlag, kein Vorschneiden
    const roh =
      material &&
      material.form !== 'Rolle' &&
      material.form !== 'Menge' &&
      !istStueckTeil(teilAngabe, material)
        ? material
        : undefined;
    let teil =
      teilAngabe.druckbogen === undefined && schema?.bogen !== undefined
        ? { ...teilAngabe, druckbogen: schema.bogen }
        : teilAngabe;
    // T103: Druckbogen vom Material (Vorschnitt), wenn das Teil keinen eigenen hat
    const vomMaterial = roh?.form === 'Bogen' ? roh.druckbogen : undefined;
    if (teil.druckbogen === undefined && vomMaterial !== undefined && roh !== undefined) {
      if (max === undefined || passtInFormat(vomMaterial, max)) {
        teil = { ...teil, druckbogen: vomMaterial };
        vorab.push(
          `Druckbogen vom Material: ${formatBogen(vomMaterial)} aus Rohbogen ${formatBogen(roh)}`,
        );
      } else {
        vorabHinweise.push(
          `Druckbogen vom Material ${formatBogen(vomMaterial)} passt nicht in die Druckmaschine (höchstens ${formatBogen(max)})`,
        );
      }
    }
    if (max !== undefined && teil.druckbogen === undefined && roh !== undefined) {
      const v = druckbogenVorschlag(teil, roh, max, randUm ?? 0, schema);
      if (v !== null) {
        teil = { ...teil, druckbogen: v.format };
        vorab.push(`Druckbogen automatisch: ${v.text}`);
      } else if (!passtInFormat(roh, max)) {
        vorabHinweise.push(
          `Rohbogen ${formatBogen(roh)} passt nicht in die Druckmaschine (höchstens ${formatBogen(max)}) – Druckbogen von Hand angeben`,
        );
      }
    } else if (
      max !== undefined &&
      teil.druckbogen !== undefined &&
      !passtInFormat(teil.druckbogen, max)
    ) {
      vorabHinweise.push(
        `Druckbogen ${formatBogen(teil.druckbogen)} ist größer als die Druckmaschine (höchstens ${formatBogen(max)})`,
      );
    }
    const vorschneiden =
      teil.druckbogen !== undefined &&
      roh !== undefined &&
      !(
        (teil.druckbogen.breiteUm === roh.breiteUm && teil.druckbogen.hoeheUm === roh.hoeheUm) ||
        (teil.druckbogen.breiteUm === roh.hoeheUm && teil.druckbogen.hoeheUm === roh.breiteUm)
      );
    if (
      vorschneiden &&
      !zeilen.some(
        (z) =>
          z.art === 'arbeitsgang' && z.menge.art === 'papierweg' && z.menge.wert === 'vorschneiden',
      )
    ) {
      vorabHinweise.push(
        `Vorschneiden fehlt: Zeile Schneiden mit Menge „Papierweg ${teil.id}: Schnitte Vorschneiden“ anlegen`,
      );
    }
    const rolle = material?.form === 'Rolle';
    // T105: Rollenbreite der Maschine – höchstens die schmale Seite des Höchstformats, mindestens
    // die größere Zahl des Mindestformats (z. B. 60 cm)
    const min =
      druck?.art === 'arbeitsgang' ? formatMinVon(u, druck.platzId, druck.schrittId) : undefined;
    const rolleMaxUm = max === undefined ? undefined : Math.min(max.breiteUm, max.hoeheUm);
    const rolleMinUm = min === undefined ? undefined : Math.max(min.breiteUm, min.hoeheUm);
    if (material?.form === 'Rolle' && rolleMinUm !== undefined && material.breiteUm < rolleMinUm) {
      vorabHinweise.push(
        `Rolle ${anzahl(material.breiteUm / 1000)} mm breit – schmaler als die Druckmaschine (mindestens ${anzahl(rolleMinUm / 1000)} mm)`,
      );
    }
    if (material?.form === 'Rolle' && max !== undefined) {
      const schmal = Math.min(max.breiteUm, max.hoeheUm);
      if (material.breiteUm > schmal) {
        vorabHinweise.push(
          `Rolle ${anzahl(material.breiteUm / 1000)} mm breit – breiter als die Druckmaschine (höchstens ${anzahl(schmal / 1000)} mm)`,
        );
      }
    }
    const netto = rechnePapierweg(teil, material, auflage, angaben);
    const nutzenNetto = auflage * teil.jeProdukt;
    if (spaeterEx > 0) {
      netto.rechenweg.unshift(
        `Exemplare: ${anzahl(auflageNetto)} + ${anzahl(spaeterEx)} Zuschuss beim Zusammenführen = ${anzahl(auflage)}`,
      );
    }

    let spaeter = 0;
    const zuschuesse: { zeileId: string; druckbogen: number }[] = [];
    const gang = zeilen.filter((z) => z.art === 'arbeitsgang');
    for (let n = gang.length - 1; n >= 0; n--) {
      const zeile = gang[n];
      if (zeile?.art !== 'arbeitsgang' || zeile.menge.art !== 'papierweg') continue;
      const q = zeile.menge;
      const f = q.faktor ?? 1;
      const hinweise: string[] = [];
      const db = netto.druckbogenNetto;
      const nutzenJeBogen = netto.nutzenJeBogen;
      const jeRoh = netto.druckbogenJeRohbogen;
      if (db === null || nutzenJeBogen === null) {
        mengen.set(zeile.id, { menge: null, text: '', hinweise: netto.hinweise });
        continue;
      }
      const bogen = db + spaeter;
      let menge: number | null = null;
      let stapel: number | undefined;
      let text = '';
      let format: Format | undefined = netto.druckbogenFormat ?? undefined;
      if (q.wert === 'nutzen') {
        format = teil.endformat;
        menge = (nutzenNetto + spaeter * nutzenJeBogen) * f;
        text = `${anzahl(nutzenNetto)} Nutzen${spaeter > 0 ? ` + ${anzahl(spaeter * nutzenJeBogen)} für spätere Zuschüsse` : ''}`;
      } else if (q.wert === 'stapel') {
        format = teil.endformat;
        const n = nutzenNetto + spaeter * nutzenJeBogen;
        const s = stapelAus(
          n,
          netto.dickeUm,
          grenzeVon(u, zeile.platzId, zeile.schrittId, 'einlegehoeheUm', zeile),
        );
        if (s.hinweis) hinweise.push(s.hinweis);
        stapel = s.stapel;
        menge = s.stapel * f;
        text = `${s.stapel} Stapel (${anzahl(n)} Nutzen)`;
      } else if (q.wert === 'druckbogen') {
        menge = bogen * f;
        text = `${anzahl(db)} ${rolle ? 'Abschnitte' : 'Druckbogen'}${spaeter > 0 ? ` + ${anzahl(spaeter)} für spätere Zuschüsse` : ''}`;
      } else if (jeRoh === null) {
        hinweise.push(
          ...(rolle
            ? [`${WERT_TEXT[q.wert]} gibt es auf der Rolle nicht – Druckbogen (Abschnitte) wählen`]
            : netto.hinweise),
        );
      } else if (q.wert === 'rohbogen') {
        format = netto.rohbogenFormat ?? undefined;
        menge = Math.ceil(bogen / jeRoh) * f;
        text = `${anzahl(Math.ceil(bogen / jeRoh))} Rohbogen`;
      } else {
        const vor = q.wert === 'vorschneiden';
        const schnitte = vor ? netto.schnitteVorschneiden : netto.schnitteEndschnitt;
        const lagen = vor ? Math.ceil(bogen / jeRoh) : bogen;
        if (vor) format = netto.rohbogenFormat ?? undefined;
        const s = stapelAus(
          lagen,
          netto.dickeUm,
          grenzeVon(u, zeile.platzId, zeile.schrittId, 'einlegehoeheUm', zeile),
        );
        if (s.hinweis) hinweise.push(s.hinweis);
        if (schnitte === null) {
          hinweise.push('Schnitte nicht berechnet (Nutzen von Hand)');
        } else {
          const je = q.gestapelt ? schnitte.gestapelt : schnitte.einzeln;
          stapel = s.stapel;
          menge = je * s.stapel * f;
          text = `${je} Schnitte je Stapel${q.gestapelt ? ' (aufeinander)' : ''} × ${s.stapel} Stapel (${anzahl(lagen)} ${vor ? 'Rohbogen' : 'Druckbogen'})`;
        }
      }
      if (f !== 1 && menge !== null) text += ` × ${anzahl(f)}`;
      // Schritt in m² oder Laufmeter: Bogen bzw. Nutzen × Fläche oder Länge des Formats
      const schrittEinheit = u.produktion.arbeitsschritte.find(
        (s) => s.id === zeile.schrittId,
      )?.einheit;
      const umrechnung =
        q.wert === 'druckbogen' || q.wert === 'rohbogen' || q.wert === 'nutzen'
          ? flaechenUmrechnung(
              schrittEinheit,
              format,
              rolle && q.wert === 'druckbogen' ? format?.hoeheUm : undefined,
            )
          : null;
      if (umrechnung && menge !== null) {
        menge = runde3(menge * umrechnung.je);
        text += ` × ${umrechnung.text}`;
      }
      const aus: Pick<KettenMenge, 'format' | 'nutzen'> = { nutzen: nutzenJeBogen };
      if (format) aus.format = format;
      mengen.set(zeile.id, {
        menge,
        ...(stapel === undefined ? {} : { stapel }),
        ...aus,
        text,
        hinweise,
      });
      if (menge === null) continue;
      // eigener Zuschuss dieses Schritts, in Druckbogen (mit Farbwerk: je zusätzlichem Durchgang)
      const probe = rechneProbe(
        u.produktion,
        druckVorbereitung(
          u.produktion,
          probeEingabeFuer(zeile, i, u, menge, stapel, [], aus),
          zeile.druck,
          teil,
        ).eingabe,
      );
      if (!probe.ok) continue;
      // Zuschuss in m²/Laufmeter zurück in Bogen bzw. Nutzen
      const z = probe.wert.zuschuss / (umrechnung?.je ?? 1);
      let alsBogen = 0;
      if (q.wert === 'druckbogen') alsBogen = Math.ceil(z / f);
      else if (q.wert === 'nutzen') alsBogen = Math.ceil(z / (f * nutzenJeBogen));
      else if (q.wert === 'rohbogen' && jeRoh !== null) alsBogen = Math.ceil(z / f) * jeRoh;
      if (alsBogen > 0) {
        zuschuesse.unshift({ zeileId: zeile.id, druckbogen: alsBogen });
        spaeter += alsBogen;
      }
    }
    const brutto = rechnePapierweg(teil, material, auflage, { ...angaben, zuschussFest: spaeter });
    brutto.rechenweg.unshift(...vorab);
    brutto.hinweise.push(...vorabHinweise);
    if (material?.form === 'Rolle') {
      rollenVorschlagSetzen(
        brutto,
        teil,
        material,
        auflage,
        { ...angaben, zuschussFest: spaeter },
        u,
        {
          minUm: rolleMinUm,
          maxUm: rolleMaxUm,
        },
      );
    }
    if (spaeterEx > 0) brutto.rechenweg.unshift(netto.rechenweg[0] ?? '');
    teile.push({ teilId: teil.id, papierweg: brutto, zuschuesse, nutzenNetto });

    for (const zeile of zeilen) {
      if (zeile.art !== 'material' || zeile.menge.art !== 'papierweg') continue;
      const q = zeile.menge;
      const f = q.faktor ?? 1;
      let wert: number | null = null;
      if (rolle) {
        // Rolle: m² = Abschnitte × Rollenbreite × Abschnittslänge (Rohbogen und Druckbogen gleich)
        const a = brutto.druckbogenFormat;
        const ok = (q.wert === 'rohbogen' || q.wert === 'druckbogen') && brutto.druckbogen !== null;
        const m2 =
          ok && a && brutto.druckbogen !== null
            ? runde3((brutto.druckbogen * a.breiteUm * a.hoeheUm) / 1e12)
            : null;
        mengen.set(zeile.id, {
          menge: m2 === null ? null : runde3(m2 * f),
          text:
            m2 === null || !a
              ? ''
              : `${anzahl(brutto.druckbogen ?? 0)} Abschnitte × ${formatBogen(a)} = ${anzahl(m2)} m²` +
                ` (brutto, Zuschuss ${anzahl(spaeter)} Abschnitte)` +
                (f !== 1 ? ` × ${anzahl(f)}` : ''),
          hinweise:
            m2 !== null
              ? []
              : ok
                ? brutto.hinweise
                : [
                    `${WERT_TEXT[q.wert]} passt nicht zu einer Rolle (Rohbogen oder Druckbogen = m²)`,
                  ],
        });
        continue;
      }
      if (q.wert === 'rohbogen') wert = brutto.rohbogen;
      else if (q.wert === 'druckbogen') wert = brutto.druckbogen;
      else if (q.wert === 'nutzen' && brutto.nutzenJeBogen !== null && brutto.druckbogen !== null) {
        wert = brutto.druckbogen * brutto.nutzenJeBogen;
      }
      mengen.set(zeile.id, {
        menge: wert === null ? null : wert * f,
        text:
          wert === null
            ? ''
            : `${anzahl(wert)} ${WERT_TEXT[q.wert]} (brutto, Zuschuss ${anzahl(spaeter)} Druckbogen)` +
              (f !== 1 ? ` × ${anzahl(f)}` : ''),
        hinweise:
          wert !== null
            ? []
            : q.wert === 'rohbogen' || q.wert === 'druckbogen' || q.wert === 'nutzen'
              ? brutto.hinweise
              : [`${WERT_TEXT[q.wert]} passt nicht zu Material (Rohbogen, Druckbogen oder Nutzen)`],
      });
    }
  }
  reihenfolgeHinweise(u, mengen);
  return { produktBrutto: auflage, teile, mengen };
}

/** Hinweise (keine Sperre), wenn die Reihenfolge der Zeilen fachlich nicht passt. */
function reihenfolgeHinweise(u: Umgebung, mengen: Map<string, KettenMenge>): void {
  const hinweis = (id: string, text: string) => mengen.get(id)?.hinweise.push(text);
  let letzterTeilSchritt = -1;
  u.k.zeilen.forEach((z, n) => {
    if (
      (z.art === 'arbeitsgang' && z.menge.art === 'papierweg') ||
      (z.art === 'zukauf' && z.teilId !== undefined)
    ) {
      letzterTeilSchritt = n;
    }
  });
  for (const teil of u.k.teile ?? []) {
    const schritte = u.k.zeilen
      .map((z, n) => ({ z, n }))
      .filter(
        ({ z }) =>
          z.art === 'arbeitsgang' && z.menge.art === 'papierweg' && z.menge.teilId === teil.id,
      );
    const wert = (z: Zeile) =>
      z.art === 'arbeitsgang' && z.menge.art === 'papierweg' ? z.menge.wert : undefined;
    const druck = schritte.find(({ z }) => wert(z) === 'druckbogen')?.n;
    if (druck === undefined) continue;
    for (const { z, n } of schritte) {
      if (wert(z) === 'vorschneiden' && n > druck) {
        hinweis(z.id, 'Vorschneiden steht nach dem Druck – gedruckt wird auf Druckbogen');
      }
      if (wert(z) === 'endschnitt' && n < druck) {
        hinweis(z.id, 'Endschnitt steht vor dem Druck');
      }
    }
  }
  u.k.zeilen.forEach((z, n) => {
    if (z.art === 'arbeitsgang' && z.menge.art === 'produkt' && n < letzterTeilSchritt) {
      hinweis(z.id, 'Schritt für das ganze Produkt steht vor Schritten der Teile');
    }
  });
}

/** Menge einer Zeile: aus der Rückwärtskalkulation (Papierweg) oder aus der Mengenquelle. */
function zeilenMenge(
  zeile: Extract<Zeile, { art: 'material' | 'arbeitsgang' }>,
  i: number,
  u: Umgebung,
  kette: Kette,
  einheit: string,
  e: ZeilenErgebnis,
): { menge: number | null; stapel?: number; aus?: Pick<KettenMenge, 'format' | 'nutzen'> } {
  if (zeile.menge.art === 'produkt') {
    const k = kette.mengen.get(zeile.id);
    if (!k || k.menge === null) return { menge: null };
    e.hinweise.push(...k.hinweise);
    e.rechenweg.push(`Menge aus dem Produkt: ${k.text} = ${anzahl(k.menge)}`);
    // T143: Stationen der Maschine (z. B. Duplo 20) gegen die Blatt je Exemplar
    const stationen =
      zeile.art === 'arbeitsgang'
        ? grenzeVon(u, zeile.platzId, zeile.schrittId, 'stationen', zeile)
        : undefined;
    const blatt = (u.k.teile ?? []).reduce((summe, t) => summe + t.jeProdukt, 0);
    let menge = k.menge;
    if (stationen !== undefined && blatt > 0) {
      const durchgaenge = Math.ceil(blatt / stationen);
      const text = `${anzahl(blatt)} Blatt je ${einheitAnzeige(u.k.einheit, 1)}, ${anzahl(stationen)} Stationen`;
      if (durchgaenge > 1) {
        menge = k.menge * durchgaenge;
        e.hinweise.push(
          `${text}: ${anzahl(durchgaenge)} Durchgänge – Teilsätze von Hand zusammenführen`,
        );
        e.rechenweg.push(
          `${text} → ${anzahl(durchgaenge)} Durchgänge: ${anzahl(k.menge)} × ${anzahl(durchgaenge)} = ${anzahl(menge)}`,
        );
      } else {
        e.rechenweg.push(`${text} → 1 Durchgang`);
      }
    }
    return k.stapel === undefined ? { menge } : { menge, stapel: k.stapel };
  }
  if (zeile.menge.art === 'auftrag' && zeile.menge.teilId !== undefined) {
    // T111: einmal je Auftrag, je Blatt des Teils (z. B. Stanze aufbauen je Registerblatt)
    const teilId = zeile.menge.teilId;
    const teil = u.k.teile?.find((t) => t.id === teilId);
    if (!teil || i >= u.k.auflagen.length) return { menge: null };
    e.rechenweg.push(
      `Menge: einmal je Auftrag, je Blatt von „${teil.name}“ = ${anzahl(teil.jeProdukt)}`,
    );
    return { menge: teil.jeProdukt };
  }
  if (zeile.menge.art !== 'papierweg') {
    return { menge: mengeAusQuelle(zeile.menge, u.k.auflagen, i, einheit) };
  }
  const k = kette.mengen.get(zeile.id);
  if (!k) {
    e.hinweise.push(`Kein Papierweg für Teil ${zeile.menge.teilId}`);
    return { menge: null };
  }
  e.hinweise.push(...k.hinweise);
  if (k.menge !== null) e.rechenweg.push(`Menge aus dem Papierweg: ${k.text} = ${anzahl(k.menge)}`);
  const aus: Pick<KettenMenge, 'format' | 'nutzen'> = {};
  if (k.format) aus.format = k.format;
  if (k.nutzen !== undefined) aus.nutzen = k.nutzen;
  return k.stapel === undefined
    ? { menge: k.menge, aus }
    : { menge: k.menge, stapel: k.stapel, aus };
}

/** Abgerechnete Menge nach Rundung; packungInhalt nur bei Preisen je Packung. */
function abgerechnet(
  menge: number,
  rundung: Extract<Zeile, { art: 'material' }>['rundung'],
  packungInhalt: number | undefined,
): number {
  if (rundung?.art === 'vielfaches') return Math.ceil(menge / rundung.auf) * rundung.auf;
  if (rundung?.art === 'packung' && packungInhalt !== undefined) {
    return Math.ceil(menge / packungInhalt) * packungInhalt;
  }
  return menge;
}

function rechneMaterial(
  zeile: Extract<Zeile, { art: 'material' }>,
  i: number,
  u: Umgebung,
  kette: Kette,
): ZeilenErgebnis {
  const material = u.lager.materialien.find((m) => m.id === zeile.materialId);
  const einheit = material === undefined ? '' : materialEinheitText(material);
  const e = leer(zeile, material ? materialName(material) : zeile.materialId, einheit);
  if (!material) {
    e.hinweise.push(`Material ${zeile.materialId} nicht im Lager`);
    return e;
  }
  const menge = zeilenMenge(
    zeile,
    i,
    u,
    kette,
    material.form === 'Rolle' ? 'm2' : 'Bogen',
    e,
  ).menge;
  e.menge = menge;
  if (menge === null) return e;
  // Rolle (Nutzer 30.10.): abgerechnet wird je m²; eine „Packung“ ist eine ganze Rolle
  const rollenFlaeche =
    material.form === 'Rolle'
      ? runde3((material.breiteUm / 1_000_000) * material.laengeM)
      : undefined;

  let preise: Preis[];
  if (zeile.preisVonHand !== undefined) {
    const h = zeile.preisVonHand;
    const gemein = {
      id: 'HAND',
      materialId: material.id,
      lieferant: 'Preis von Hand',
      gueltigAb: u.stichtag,
    };
    preise = [
      h.je === 'einheit'
        ? {
            ...gemein,
            basis: 'einheit',
            einheitName: 'Stück',
            inhalt: 1,
            staffel: [{ ab: 1, betragZehntelcent: h.zehntelcent }],
          }
        : h.je === 'tausend'
          ? { ...gemein, basis: 'je1000', betragZehntelcent: h.zehntelcent }
          : { ...gemein, basis: 'je100kg', betragZehntelcent: h.zehntelcent },
    ];
  } else {
    preise = aktuellePreise(u.lager, material.id, u.stichtag).filter(
      (p) =>
        zeile.lieferant === undefined ||
        p.lieferant.trim().toLowerCase() === zeile.lieferant.trim().toLowerCase(),
    );
  }
  // Rundung: von der Zeile; sonst ganze Packungen, wenn das Material keinen Anbruch erlaubt
  const ohneAnbruch = zeile.rundung === undefined && material.packung?.anbruch === false;
  const rundung: Extract<Zeile, { art: 'material' }>['rundung'] = ohneAnbruch
    ? { art: 'packung' }
    : zeile.rundung;
  // je Preis die Kosten für die abgerechnete Menge (Staffel nach Packungen), der günstigste gewinnt
  let bester: {
    kosten: Geld;
    text: string;
    menge: number;
    inhalt: number | undefined;
    je1000?: Geld;
  } | null = null;
  for (const preis of preise) {
    // Packungsinhalt: vom Preis je Packung, sonst vom Material
    const inhalt =
      rollenFlaeche !== undefined
        ? rollenFlaeche
        : preis.basis === 'einheit' && zeile.preisVonHand === undefined
          ? preis.inhalt
          : material.packung?.inhalt;
    const ab = abgerechnet(menge, rundung, inhalt);
    const packungen =
      rollenFlaeche !== undefined
        ? Math.ceil(ab / rollenFlaeche)
        : preis.basis === 'einheit'
          ? Math.ceil(ab / preis.inhalt)
          : 1;
    let werte: ReturnType<typeof preisVergleichswerte>;
    try {
      werte = preisVergleichswerte(material, preis, Math.max(packungen, 1));
    } catch {
      e.hinweise.push(`Preis je 100 kg braucht Grammatur und Format (${material.id})`);
      continue;
    }
    let kosten: Geld;
    let text: string;
    let je1000: Geld | undefined;
    if (rollenFlaeche !== undefined && rundung?.art === 'packung' && werte.jeRolle) {
      // ganze Rollen: Rollenpreis × Rollen (ohne Rundungsrest über den m²-Preis)
      kosten = zehntelcent(werte.jeRolle.zehntelcent * packungen);
      text = `${packungen} ${packungen === 1 ? 'Rolle' : 'Rollen'} × ${formatEuro(werte.jeRolle)}`;
    } else if (material.form === 'Rolle' && werte.jeM2) {
      kosten = zehntelcent(rundeKaufmaennisch(werte.jeM2.zehntelcent * ab));
      text = `${anzahl(ab)} m² × ${formatEuro3(werte.jeM2)}/m²`;
    } else if (werte.je1000) {
      kosten = zehntelcent(rundeKaufmaennisch((werte.je1000.zehntelcent * ab) / 1000));
      text = `${anzahl(ab)} ${einheit} × ${formatEuro(werte.je1000)} je 1.000`;
      je1000 = werte.je1000;
    } else {
      continue;
    }
    if (bester === null || kosten.zehntelcent < bester.kosten.zehntelcent) {
      bester = {
        kosten,
        text: `${text} (${preis.lieferant}) = ${formatEuro(kosten)}`,
        menge: ab,
        inhalt,
      };
      if (je1000 !== undefined) bester.je1000 = je1000;
    }
  }
  if (rundung?.art === 'packung' && material.packung === undefined && rollenFlaeche === undefined) {
    if (
      zeile.preisVonHand !== undefined ||
      (preise.length > 0 && preise.every((p) => p.basis !== 'einheit'))
    ) {
      e.hinweise.push(
        'Rundung auf Packung: keine Packung am Material und kein Preis je Packung – genaue Menge gerechnet',
      );
    }
  }
  if (bester === null) {
    e.hinweise.push(
      zeile.preisVonHand !== undefined
        ? `Preis von Hand für ${material.id} nicht verwendbar – rechnet nicht`
        : zeile.lieferant === undefined
          ? `Kein Preis für ${material.id} zum ${u.stichtag} – rechnet nicht`
          : `Kein Preis von ${zeile.lieferant} für ${material.id} – rechnet nicht`,
    );
    return e;
  }
  e.mengeAbgerechnet = bester.menge;
  if (bester.menge !== menge) {
    e.rechenweg.push(
      `Benötigt ${anzahl(menge)} ${einheit} → einkalkuliert ${anzahl(bester.menge)}` +
        (rundung?.art === 'vielfaches'
          ? ` (auf ${anzahl(rundung.auf)} aufgerundet)`
          : ` (${anzahl(bester.menge / (bester.inhalt ?? bester.menge))} ${rollenFlaeche !== undefined ? 'Rolle(n)' : (material.packung?.einheit ?? 'Packung')}` +
            `${bester.inhalt === undefined ? '' : ` à ${anzahl(bester.inhalt)}`}` +
            `${ohneAnbruch ? ', kein Anbruch' : ''})`),
    );
  }
  e.kostenVoll = bester.kosten;
  e.kostenTeil = bester.kosten;
  if (bester.je1000 !== undefined) {
    e.werte = { art: 'material', je1000: bester.je1000, vonHand: zeile.preisVonHand !== undefined };
  }
  e.rechenweg.push(`Material: ${bester.text}`);
  // Aufschlag: Zeile > Material; Gewinnaufschlag zusätzlich, außer ausgeschaltet
  const prozent = zeile.aufschlagProzent ?? material.aufschlagProzent;
  const festWert = zeile.aufschlagFestZehntelcent ?? material.aufschlagFestZehntelcent;
  const zv = zeilenVerkauf(
    bester.kosten,
    prozent,
    festWert,
    zeile.gewinnZusaetzlich ?? material.gewinnZusaetzlich,
    u.gewinn,
  );
  e.verkauf = zv.verkauf;
  e.kostenMitZeilenaufschlag = zv.mit;
  if (zv.eigener) {
    const inZeile =
      zeile.aufschlagProzent !== undefined || zeile.aufschlagFestZehntelcent !== undefined;
    e.rechenweg.push(
      `Aufschlag${inZeile ? '' : ' am Material'}: ${formatEuro(bester.kosten)} + ` +
        `${anzahl(prozent ?? 0)} % + ${formatEuro(zehntelcent(festWert ?? 0))} = ${formatEuro(zv.mit)}`,
    );
    const g = gewinnText(zv, u.gewinn);
    if (g) e.rechenweg.push(g);
  }
  return e;
}

function passtIn(f: Format, bis: Format): boolean {
  return (
    (f.breiteUm <= bis.breiteUm && f.hoeheUm <= bis.hoeheUm) ||
    (f.breiteUm <= bis.hoeheUm && f.hoeheUm <= bis.breiteUm)
  );
}

/** Klickart der bisherigen Klickpreise (ohne Farbwerk). */
const KLICKART_ALT: Record<KlickFarbe, string> = {
  farbig: '4c',
  schwarz: '1c',
  sonderfarbe: 'Sonderfarbe',
};

/** Sammelt Klicks je Klickart in der Reihenfolge des ersten Auftretens. */
function klickartSammler(): {
  dazu: (name: string, anzahl: number, kosten: number) => void;
  liste: () => KlickartPosten[];
} {
  const posten = new Map<string, { anzahl: number; kosten: number }>();
  return {
    dazu: (name, anzahl, kosten) => {
      const p = posten.get(name) ?? { anzahl: 0, kosten: 0 };
      posten.set(name, { anzahl: p.anzahl + anzahl, kosten: p.kosten + kosten });
    },
    liste: () =>
      [...posten].map(([name, p]) => ({
        name,
        anzahl: p.anzahl,
        kosten: zehntelcent(rundeKaufmaennisch(p.kosten)),
      })),
  };
}

/** Klicks je Klickart über mehrere Zeilen zusammengezählt (Reihenfolge des ersten Auftretens). */
export function klicksJeKlickart(zeilen: readonly ZeilenErgebnis[]): KlickartPosten[] {
  const s = klickartSammler();
  for (const z of zeilen) {
    for (const p of z.klicks?.jeKlickart ?? []) s.dazu(p.name, p.anzahl, p.kosten.zehntelcent);
  }
  return s.liste();
}

/** Klickpreis für Farbe und Bogenformat: kleinste passende Klickgröße; ohne Größe = jede. */
function klickpreisFuer(
  preise: readonly Klickpreis[],
  farbe: KlickFarbe,
  format: Format | undefined,
): Klickpreis | undefined {
  const passend = preise.filter(
    (k) =>
      k.farbe === farbe &&
      (k.bisFormat === undefined || (format !== undefined && passtIn(format, k.bisFormat))),
  );
  const flaeche = (k: Klickpreis) =>
    k.bisFormat === undefined
      ? Number.POSITIVE_INFINITY
      : k.bisFormat.breiteUm * k.bisFormat.hoeheUm;
  return [...passend].sort((a, b) => flaeche(a) - flaeche(b))[0];
}

/** Klicks eines Druck-Arbeitsgangs: je bedruckte Seite × Bogen inkl. Zuschuss. Ohne Klickpreise
 *  ein Hinweis – außer der Schritt hat Verbrauch (Tinte), dann ist das so gewollt. */
function rechneKlicks(
  druck: Druck,
  bogen: number,
  preise: readonly Klickpreis[] | undefined,
  format: Format | undefined,
  e: Notizen,
  mitVerbrauch = false,
): Klicks | null {
  if (preise === undefined || preise.length === 0) {
    // T109: Druck mit Verbrauch (Tinte je m² oder Stück) statt Klick: kein Hinweis
    if (!mitVerbrauch) {
      e.hinweise.push('Keine Klickpreise am Arbeitsplatz hinterlegt – Klicks nicht gerechnet');
    }
    return null;
  }
  const seiten: [string, NonNullable<Druck['hinten']>][] = [['vorne', druck.vorne]];
  if (druck.hinten) seiten.push(['hinten', druck.hinten]);
  let anzahlGesamt = 0;
  let summe = 0;
  let tonerSumme: number | null = null;
  const jeArt = klickartSammler();
  for (const [name, seite] of seiten) {
    const posten: [KlickFarbe, number][] = [[seite.farbe, 1]];
    if ((seite.sonderfarben ?? 0) > 0) posten.push(['sonderfarbe', seite.sonderfarben ?? 0]);
    for (const [farbe, mal] of posten) {
      const k = klickpreisFuer(preise, farbe, format);
      if (!k) {
        e.hinweise.push(
          `Kein Klickpreis für ${farbe}${format ? ` bei ${formatBogen(format)}` : ''} – rechnet nicht`,
        );
        return null;
      }
      const anzahlSeite = bogen * mal;
      const kosten = anzahlSeite * k.zehntelcent;
      anzahlGesamt += anzahlSeite;
      summe += kosten;
      jeArt.dazu(KLICKART_ALT[farbe], anzahlSeite, kosten);
      e.rechenweg.push(
        `Klicks ${name} ${farbe}: ${anzahl(anzahlSeite)} × ${formatEuro3(zehntelcent(k.zehntelcent))}` +
          `${k.bisFormat ? ` (bis ${formatBogen(k.bisFormat)})` : ''} = ${euroGenau(kosten)}`,
      );
      if (k.toner) {
        const t = tonerKosten(
          k.toner,
          anzahlSeite,
          seite.deckungProzent,
          format,
          `${name} ${farbe}`,
          e,
        );
        if (t !== null) tonerSumme = (tonerSumme ?? 0) + t;
      }
    }
  }
  return {
    anzahl: anzahlGesamt,
    kosten: zehntelcent(summe),
    toner: tonerSumme === null ? null : zehntelcent(rundeKaufmaennisch(tonerSumme)),
    jeKlickart: jeArt.liste(),
  };
}

/**
 * Klicks und Toner nach dem Farbwerk der Maschine: je Seite und Durchgang die günstigsten
 * Gruppen (je Bogen ein Klick je Gruppe), Toner je Farbe und Seite nach Fläche und Deckung
 * (Sonderfarbe: ihre Deckung, 4c/1c: Grunddeckung). Eine Farbe ohne Gruppe und ohne Toner
 * kostet nichts (Hinweis).
 */
function rechneFarbwerkKlicks(
  werk: Farbwerk,
  plan: DruckPlan,
  druck: Druck,
  bogen: number,
  format: Format | undefined,
  e: Notizen,
): Klicks | null {
  let anzahlGesamt = 0;
  let summe = 0;
  let tonerSumme: number | null = null;
  const jeArt = klickartSammler();
  const ohneKosten = new Set<string>();
  for (const s of plan.seiten) {
    const seite = s.seite === 'vorne' ? druck.vorne : druck.hinten;
    if (!seite) continue;
    const mehrere = s.durchgaenge.length > 1;
    e.rechenweg.push(
      mehrere
        ? `Farbwerk ${s.seite}: ${s.durchgaenge.length} Durchgänge – ` +
            s.durchgaenge
              .map((d, k) => `${k + 1}: ${d.belegung.map((b) => b.farbe).join(', ')}`)
              .join(' · ')
        : `Farbwerk ${s.seite}: ${s.durchgaenge[0]?.belegung.map((b) => b.farbe).join(', ') ?? ''}`,
    );
    for (const [k, d] of s.durchgaenge.entries()) {
      const farben = d.belegung.map((b) => b.farbe);
      const wahl = guenstigsteGruppen(werk, farben, format);
      if (!wahl.ok) {
        e.hinweise.push(
          `${wahl.meldung}${format ? ` (${formatBogen(format)})` : ''} – Klicks nicht gerechnet`,
        );
        return null;
      }
      for (const g of wahl.gruppen) {
        const kosten = bogen * g.zehntelcent;
        anzahlGesamt += bogen;
        summe += kosten;
        jeArt.dazu(g.name, bogen, kosten);
        e.rechenweg.push(
          `Klicks ${s.seite}${mehrere ? ` Durchgang ${k + 1}` : ''} ${g.name}: ` +
            `${anzahl(bogen)} × ${formatEuro3(zehntelcent(g.zehntelcent))}` +
            `${klickGroesseText(g)} = ${euroGenau(kosten)}`,
        );
      }
      for (const name of wahl.ohneGruppe) {
        if (!farbeImWerk(werk, name)?.toner) ohneKosten.add(name);
      }
    }
    for (const d of s.durchgaenge) {
      for (const b of d.belegung) {
        const farbe = farbeImWerk(werk, b.farbe);
        if (!farbe?.toner) continue;
        const deckung =
          farbe.art === 'sonder'
            ? seite.sonder?.find((x) => x.name.trim().toLowerCase() === farbe.name.toLowerCase())
                ?.deckungProzent
            : seite.grundDeckungProzent;
        const t = tonerKosten(farbe.toner, bogen, deckung, format, `${s.seite} ${farbe.name}`, e);
        if (t !== null) tonerSumme = (tonerSumme ?? 0) + t;
      }
    }
  }
  for (const name of ohneKosten) {
    e.hinweise.push(`${name}: weder Klickpreis noch Toner – nicht gerechnet`);
  }
  if (plan.durchgaenge > plan.seiten.length) {
    e.hinweise.push(
      `Mehr Durchgänge wegen der Farben: ${plan.durchgaenge} statt ${plan.seiten.length}`,
    );
  }
  return {
    anzahl: anzahlGesamt,
    kosten: zehntelcent(summe),
    toner: tonerSumme === null ? null : zehntelcent(rundeKaufmaennisch(tonerSumme)),
    jeKlickart: jeArt.liste(),
  };
}

/** Betrag auf Zehntelcent genau: volle Cent mit 2, sonst mit 3 Nachkommastellen („1,295 €“),
 *  damit die Posten im Rechenweg zur Summe passen. */
function euroGenau(zehntel: number): string {
  const g = zehntelcent(rundeKaufmaennisch(zehntel));
  return g.zehntelcent % 10 === 0 ? formatEuro(g) : formatEuro3(g);
}

/** Klickgröße einer Gruppe im Rechenweg: „ (Bogenlänge bis 487 mm)“, „ (bis 33 × 48,7 cm)“. */
function klickGroesseText(g: GruppenPreis): string {
  if (g.bisLaengeUm !== undefined) {
    return ` (Bogenlänge bis ${anzahl(g.bisLaengeUm / 1000)} mm)`;
  }
  return g.bisFormat ? ` (bis ${formatBogen(g.bisFormat)})` : '';
}

/** Fläche einer A4-Seite in m² (Bezug der Reichweite im Datenblatt). */
const A4_QM = 0.21 * 0.297;

/**
 * Toner extra in Zehntelcent (ungerundet): Seiten × Bogenfläche × Deckung × Kosten je m² bei
 * 100 % Deckung (Kartusche ÷ Reichweite ÷ A4-Fläche ÷ Bezugsdeckung). Deckung: Kalkulation,
 * sonst Standard am Klickpreis, sonst 100 % (mit Hinweis). Ohne Bogenformat: Hinweis, null.
 */
function tonerKosten(
  toner: Toner,
  seiten: number,
  deckungKalkulation: number | undefined,
  format: Format | undefined,
  titel: string,
  e: Notizen,
): number | null {
  if (format === undefined) {
    e.hinweise.push(`Bogenformat unbekannt – Toner ${titel} nicht gerechnet`);
    return null;
  }
  const deckung = deckungKalkulation ?? toner.standardDeckungProzent;
  if (deckung === undefined) {
    e.hinweise.push(`Deckung für Toner ${titel} nicht angegeben – mit 100 % gerechnet`);
  }
  const prozent = deckung ?? 100;
  const bezug = (toner.bezugDeckungProzent ?? 5) / 100;
  const jeQm = toner.kartuscheZehntelcent / toner.reichweiteSeiten / A4_QM / bezug;
  const flaeche = (format.breiteUm / 1_000_000) * (format.hoeheUm / 1_000_000);
  const kosten = seiten * flaeche * (prozent / 100) * jeQm;
  const zahl = (w: number, stellen: number) =>
    w.toLocaleString('de-DE', { maximumFractionDigits: stellen });
  e.rechenweg.push(
    `Toner ${titel}: ${anzahl(seiten)} × ${zahl(flaeche, 4)} m² × ${zahl(prozent, 1)} % × ` +
      `${formatEuro3(zehntelcent(rundeKaufmaennisch(jeQm)))}/m²` +
      ` (Kartusche ${formatEuro(zehntelcent(toner.kartuscheZehntelcent))} ÷ ${anzahl(toner.reichweiteSeiten)} Seiten A4` +
      ` bei ${zahl(bezug * 100, 1)} % Deckung) = ${formatEuro(zehntelcent(rundeKaufmaennisch(kosten)))}`,
  );
  return kosten;
}

function rechneArbeitsgang(
  zeile: Extract<Zeile, { art: 'arbeitsgang' }>,
  i: number,
  u: Umgebung,
  kette: Kette,
): ZeilenErgebnis {
  const platz = (u.produktion.arbeitsplaetze ?? []).find((p) => p.id === zeile.platzId);
  const schritt = u.produktion.arbeitsschritte.find((s) => s.id === zeile.schrittId);
  const einheit = schritt ? einheitAnzeige(schritt.einheit) : '';
  const titel = `${platz?.name ?? zeile.platzId} – ${schritt?.name ?? zeile.schrittId}`;
  const e = leer(zeile, titel, einheit);
  const berechnet = zeilenMenge(zeile, i, u, kette, schritt?.einheit ?? 'Stueck', e);
  const { aus } = berechnet;
  let { menge, stapel } = berechnet;
  // T154: Menge von Hand ersetzt die berechnete (Stapel entfällt: die Menge ist schon gezählt)
  const mengeHand = zeile.handwerte?.menge;
  if (mengeHand !== undefined) {
    e.rechenweg.push(
      `Menge von Hand: ${anzahl(mengeHand)} ${einheit}` +
        (menge === null ? '' : ` (berechnet: ${anzahl(menge)})`),
    );
    menge = mengeHand;
    stapel = undefined;
  }
  e.menge = menge;
  if (menge === null) return e;
  // T113: Einzahl bei genau 1 („1 Auftrag“ statt „1 Aufträge“)
  if (menge === 1 && schritt) e.einheit = einheitAnzeige(schritt.einheit, 1);

  const material =
    zeile.materialId === undefined
      ? undefined
      : u.lager.materialien.find((m) => m.id === zeile.materialId);
  const format =
    aus?.format ??
    (material && material.form !== 'Rolle' && material.form !== 'Menge'
      ? { breiteUm: material.breiteUm, hoeheUm: material.hoeheUm }
      : undefined);
  const eingabe = probeEingabeFuer(zeile, i, u, menge, stapel, e.hinweise, aus);
  const teil =
    zeile.menge.art === 'papierweg'
      ? (u.k.teile ?? []).find((t) => t.id === (zeile.menge as { teilId: string }).teilId)
      : undefined;
  if (platz?.inaktiv === true) e.hinweise.push(`${platz.name} ist inaktiv (Ersatzgerät, gesperrt)`);
  // T121: Grenze „höchstens n Nutzen je Druckbogen“ (z. B. Lochen im Finisher nur beim Endformat)
  const ungeeignet: string[] = [];
  const nutzenMax = grenzeVon(u, zeile.platzId, zeile.schrittId, 'nutzenMax');
  if (nutzenMax !== undefined && teil !== undefined) {
    const n = kette.teile.find((t) => t.teilId === teil.id)?.papierweg.nutzenJeBogen ?? null;
    if (n !== null && n > nutzenMax) {
      const text = `${platz?.name ?? zeile.platzId}: höchstens ${anzahl(nutzenMax)} Nutzen je Bogen – hier ${anzahl(n)}`;
      ungeeignet.push(text);
      e.hinweise.push(text);
    }
  }
  // T144: Fächer der Druckmaschine gegen die Papiere, die sie in dieser Kalkulation druckt
  const faecher = grenzeVon(u, zeile.platzId, zeile.schrittId, 'faecher');
  if (faecher !== undefined && zeile.druck !== undefined) {
    const papiere = new Set(
      u.k.zeilen.flatMap((z) => {
        if (z.art !== 'arbeitsgang' || z.druck === undefined || z.platzId !== zeile.platzId)
          return [];
        if (z.menge.art !== 'papierweg') return [];
        const id = z.menge.teilId;
        const t = (u.k.teile ?? []).find((x) => x.id === id);
        return t?.materialId === undefined ? [] : [t.materialId];
      }),
    );
    if (papiere.size > faecher) {
      e.hinweise.push(
        `${anzahl(papiere.size)} Papiere, ${anzahl(faecher)} ${faecher === 1 ? 'Fach' : 'Fächer'} – zwischendurch umlegen`,
      );
    }
  }
  // Nutzer 30.10.: alte Muster rechneten 4/4 mit „Leistung −50 %“; seit T61 zählt 4/4 selbst
  // 2 Durchgänge – beides zusammen rechnet den Widerdruck doppelt
  const minus = zeile.aenderung?.leistungProzent;
  if (zeile.druck?.hinten !== undefined && minus !== undefined && minus < 0) {
    e.hinweise.push(
      `Leistung −${anzahl(-minus)} % im Arbeitsgang und 4/4 rechnet schon 2 Durchgänge – Widerdruck doppelt? Änderung prüfen`,
    );
  }
  laeuftMitAnwenden(zeile, u, eingabe, e);
  const g = rechneDruckGang(u.produktion, eingabe, zeile.druck, format, e, teil, {
    lager: u.lager,
    stichtag: u.stichtag,
  });
  if (!g.ok) {
    e.hinweise.push(...g.fehler.map((f) => f.meldung));
    if (ungeeignet.length > 0) e.ungeeignet = ungeeignet;
    return e;
  }
  e.mengeGesamt = g.wert.probe.mengeGesamt;
  e.zeitMs = g.wert.probe.zeitMs;
  const pr = g.wert.probe;
  e.werte = {
    art: 'arbeitsgang',
    jeStunde: pr.jeStunde,
    leistungVonHand: pr.leistungVonHand,
    ruestenMs: pr.ruestenMs,
    ruestenVonHand: pr.ruestenVonHand,
    satzVoll: pr.stundensatzVoll,
    satzVonHand: pr.satzVollVonHand === true,
  };
  if (pr.ohneLauf !== undefined) e.werte.laeuftMit = pr.ohneLauf;
  // T156: Wartezeit nach der Tätigkeit – nur Angabe, keine Kosten
  const warten = platz?.schritte.find((s) => s.schrittId === zeile.schrittId)?.wartezeitMs;
  if (warten !== undefined) {
    e.werte.wartezeitMs = warten;
    e.rechenweg.push(`Danach warten: ${dauerAnzeige(warten)} (kostet nichts, nur Durchlaufzeit)`);
  }
  if (g.wert.probe.ungeeignet !== undefined || ungeeignet.length > 0)
    e.ungeeignet = [...ungeeignet, ...(g.wert.probe.ungeeignet ?? [])];
  e.kostenVoll = g.wert.kostenVoll;
  e.kostenTeil = g.wert.kostenTeil;
  // T149: Werkzeug einmalig (Stanzform) – vorhandene, bezahlte Form kostet nichts
  const werkzeug = werkzeugKosten(zeile, u, e);
  if (werkzeug !== null) {
    e.werkzeugZehntelcent = werkzeug;
    const plus = (geld: Geld | null) =>
      geld === null ? null : zehntelcent(geld.zehntelcent + werkzeug);
    e.kostenVoll = plus(e.kostenVoll);
    e.kostenTeil = plus(e.kostenTeil);
  }
  if (g.wert.klicks !== null) e.klicks = g.wert.klicks;
  e.kostenMitZeilenaufschlag = e.kostenVoll;
  e.verkauf = e.kostenVoll === null ? null : mitAufschlag(e.kostenVoll, u.gewinn);
  return e;
}

/** Eine Art Druckbogen mit ihrem Plan (Farbwerk) und den Nutzen, die so gedruckt werden. */
type DruckArt = { druck: Druck; nutzen: number[]; plan: DruckPlan | null };

/**
 * Eingabe der Probe für einen Arbeitsgang mit (wahlweise) Druck: 4/4 = 2 Durchgänge; mit
 * Farbwerk Durchgänge, Zuschuss je zusätzlichem Durchgang und „Sonderfarbe wechseln“ aus dem
 * Plan. Mit Seitenfarben am Teil (T65) gibt es mehrere Arten Druckbogen; die Durchgänge sind
 * dann das Mittel über die Druckbogen, der Zuschuss richtet sich nach der Art mit den meisten
 * Durchgängen, die Wechsel zählen über alle Arten. Dieselbe Vorbereitung gilt in der Kette
 * (Zuschuss für das Papier) und im Arbeitsgang.
 */
function druckVorbereitung(
  produktion: Produktion,
  eingabeRoh: ProbeEingabe,
  druck: Druck | undefined,
  teil?: Teil,
): {
  eingabe: ProbeEingabe;
  werk: Farbwerk | undefined;
  arten: DruckArt[];
  jeProdukt: number;
  schrittKlicks: boolean;
  platz: Arbeitsplatz | undefined;
  amPlatz: PlatzSchritt | undefined;
  meldungen: string[];
} {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === eingabeRoh.platzId);
  const amPlatz = platz?.schritte.find((s) => s.schrittId === eingabeRoh.schrittId);
  const schrittKlicks = (amPlatz?.klickpreise?.length ?? 0) > 0;
  const werk = druck !== undefined && !schrittKlicks ? platz?.farbwerk : undefined;
  const eingabe: ProbeEingabe = { ...eingabeRoh };
  if (druck?.hinten !== undefined && eingabe.durchgaenge === undefined) eingabe.durchgaenge = 2;
  const meldungen: string[] = [];
  if (druck === undefined) {
    return { eingabe, werk, arten: [], jeProdukt: 1, schrittKlicks, platz, amPlatz, meldungen };
  }
  const verteilt = teil
    ? bogenArten(teil, druck)
    : { arten: [{ nutzen: [1], druck }], hinweise: [] };
  meldungen.push(...verteilt.hinweise);
  const jeProdukt = teil ? teil.jeProdukt : 1;
  const arten: DruckArt[] = verteilt.arten.map((a) => ({ ...a, plan: null }));
  if (werk) {
    for (const a of arten) {
      const p = planeDruck(werk, a.druck);
      if (p.ok) a.plan = p.plan;
      else if (!meldungen.includes(`Farbwerk: ${p.meldung} – Klicks nicht gerechnet`)) {
        meldungen.push(`Farbwerk: ${p.meldung} – Klicks nicht gerechnet`);
      }
    }
  }
  const plaene = arten.map((a) => a.plan);
  if (werk && plaene.every((p): p is DruckPlan => p !== null)) {
    const seiten = druck.hinten ? 2 : 1;
    const gewicht = arten.map((a) => a.nutzen.length);
    const summe = gewicht.reduce((x, y) => x + y, 0);
    const mittel =
      plaene.reduce((x, p, i) => x + p.durchgaenge * (gewicht[i] ?? 0), 0) / Math.max(1, summe);
    eingabe.durchgaenge = Math.round(mittel * 1000) / 1000;
    const mehr = Math.max(...plaene.map((p) => p.durchgaenge - seiten));
    if (mehr > 0) eingabe.zuschussMal = 1 + mehr;
    const wechsel = wechselFuer(werk, plaene);
    if (werk.wechselMs !== undefined && werk.wechselMs > 0 && wechsel > 0) {
      eingabe.ruestenDazu = [
        { name: 'Sonderfarbe wechseln', anzahl: wechsel, jeMs: werk.wechselMs },
      ];
    }
  }
  return { eingabe, werk, arten, jeProdukt, schrittKlicks, platz, amPlatz, meldungen };
}

/**
 * Schritte im selben Durchlauf (Duplo: Heften läuft mit Zusammentragen): Ist für den Schritt
 * dieser Zeile „läuft mit X“ hinterlegt und gibt es eine Zeile mit X am selben Platz, hat diese
 * Zeile keine eigene Laufzeit. Umgekehrt bekommt die Zeile mit X die Leistungsänderung der
 * mitlaufenden Schritte.
 */
function laeuftMitAnwenden(
  zeile: Extract<Zeile, { art: 'arbeitsgang' }>,
  u: Umgebung,
  eingabe: ProbeEingabe,
  e: Notizen,
): void {
  const platz = (u.produktion.arbeitsplaetze ?? []).find((p) => p.id === zeile.platzId);
  if (!platz) return;
  const name = (id: string) => u.produktion.arbeitsschritte.find((s) => s.id === id)?.name ?? id;
  const andere = u.k.zeilen.filter(
    (z): z is Extract<Zeile, { art: 'arbeitsgang' }> =>
      z.art === 'arbeitsgang' && z.id !== zeile.id && z.platzId === zeile.platzId,
  );
  const eigen = platz.schritte.find((s) => s.schrittId === zeile.schrittId);
  const mit = eigen?.laeuftMit?.schrittId;
  if (mit !== undefined && andere.some((z) => z.schrittId === mit)) {
    eingabe.ohneLauf = name(mit);
    e.hinweise.push(`${name(zeile.schrittId)} läuft mit ${name(mit)} – nur Rüsten`);
  }
  for (const s of platz.schritte) {
    const l = s.laeuftMit;
    if (l?.schrittId !== zeile.schrittId || l.leistungProzent === undefined) continue;
    if (!andere.some((z) => z.schrittId === s.schrittId)) continue;
    eingabe.weitere = [
      ...(eingabe.weitere ?? []),
      { quelle: `mit ${name(s.schrittId)}`, a: { leistungProzent: l.leistungProzent } },
    ];
  }
}

/** Auf drei Nachkommastellen (m², Laufmeter). */
function runde3(w: number): number {
  return Math.round(w * 1000) / 1000;
}

/**
 * Umrechnung für Schritte in m² oder Laufmeter: je Bogen bzw. Nutzen die Fläche (m²) oder die
 * Länge (längere Seite, m) des Formats. Andere Einheiten oder ohne Format: null.
 * laengeUm: Abschnitt auf der Rolle – Laufmeter = Länge des Abschnitts (nicht die längere Seite).
 */
export function flaechenUmrechnung(
  einheit: Einheit | undefined,
  format: Format | undefined,
  laengeUm?: number,
): { je: number; text: string } | null {
  if (!format || (einheit !== 'm2' && einheit !== 'Laufmeter')) return null;
  const b = format.breiteUm / 1_000_000;
  const h = format.hoeheUm / 1_000_000;
  const flaeche = Math.round(b * h * 1_000_000) / 1_000_000;
  const zahl = (w: number) => w.toLocaleString('de-DE', { maximumFractionDigits: 4 });
  if (einheit === 'm2') {
    return { je: flaeche, text: `${zahl(flaeche)} m² (${formatBogen(format)})` };
  }
  if (laengeUm !== undefined) {
    const l = laengeUm / 1_000_000;
    return { je: l, text: `${zahl(l)} m (Abschnittslänge)` };
  }
  return { je: Math.max(b, h), text: `${zahl(Math.max(b, h))} m (längere Seite)` };
}

/** Rechenweg und Hinweise, in die ein Druck-Arbeitsgang schreibt. */
type Notizen = { rechenweg: string[]; hinweise: string[] };

/** Arbeitsgang mit Druck: Probe-Rechnung, Klicks, Toner und Kosten zusammen. */
export type DruckGang = {
  probe: ProbeErgebnis;
  klicks: Klicks | null;
  kostenVoll: Geld | null;
  kostenTeil: Geld | null;
};

/** Klicks mehrerer Bogenarten zusammen (null, wenn eine Art nicht rechnet). */
function klicksZusammen(liste: readonly (Klicks | null)[]): Klicks | null {
  if (liste.some((k) => k === null)) return null;
  const da = liste.filter((k): k is Klicks => k !== null);
  const jeArt = klickartSammler();
  for (const k of da)
    for (const p of k.jeKlickart) jeArt.dazu(p.name, p.anzahl, p.kosten.zehntelcent);
  const toner = da.filter((k) => k.toner !== null);
  return {
    anzahl: da.reduce((s, k) => s + k.anzahl, 0),
    kosten: zehntelcent(da.reduce((s, k) => s + k.kosten.zehntelcent, 0)),
    toner:
      toner.length === 0
        ? null
        : zehntelcent(toner.reduce((s, k) => s + (k.toner?.zehntelcent ?? 0), 0)),
    jeKlickart: jeArt.liste(),
  };
}

/**
 * Rechnet einen Arbeitsgang wie die Kalkulation: Hat die Maschine ein Farbwerk (und der Schritt
 * keine eigenen Klickpreise), bestimmt es Durchgänge, Zuschuss, Wechsel und Klicks; sonst die
 * Klickpreise. 4/4 ohne Farbwerk = 2 Durchgänge. Mit Seitenfarben am Teil werden die Klicks je
 * Art Druckbogen gerechnet (Druckbogen gleich auf die Nutzen verteilt). Rechenweg und Hinweise
 * kommen in `n`.
 */
function rechneDruckGang(
  produktion: Produktion,
  eingabeRoh: ProbeEingabe,
  druck: Druck | undefined,
  format: Format | undefined,
  n: Notizen,
  teil?: Teil,
  lager?: { lager: Lager; stichtag: string },
): PruefErgebnis<DruckGang> {
  const v = druckVorbereitung(produktion, eingabeRoh, druck, teil);
  const { eingabe, werk, arten, schrittKlicks, platz, amPlatz } = v;
  n.hinweise.push(...v.meldungen);
  const r = rechneProbe(produktion, eingabe);
  if (!r.ok) return r;
  n.rechenweg.push(...rechenweg(r.wert));
  let kostenVoll = r.wert.kostenVoll;
  let kostenTeil = r.wert.kostenTeil;
  let klicks: DruckGang['klicks'] = null;
  if (druck === undefined) {
    const hatKlicks =
      schrittKlicks || (platz?.klickpreise?.length ?? 0) > 0 || platz?.farbwerk !== undefined;
    if (hatKlicks) {
      n.hinweise.push('Druck (vorne/hinten) nicht angegeben – Klicks nicht gerechnet');
    }
  } else {
    // Klickpreise des Schritts gehen vor, sonst die der Maschine
    const preise = schrittKlicks ? amPlatz?.klickpreise : platz?.klickpreise;
    const bogen =
      arten.length === 1
        ? [r.wert.mengeGesamt]
        : bogenJeArt(arten, r.wert.mengeGesamt, v.jeProdukt);
    const je = arten.map((a, i) => {
      const anzahlBogen = bogen[i] ?? 0;
      if (arten.length > 1) {
        n.rechenweg.push(
          `Druckbogen ${bogenDruckText(a.druck)}: ${anzahl(anzahlBogen)} (Nutzen ${a.nutzen.join(', ')})`,
        );
      }
      return werk
        ? a.plan
          ? rechneFarbwerkKlicks(werk, a.plan, a.druck, anzahlBogen, format, n)
          : null
        : rechneKlicks(
            a.druck,
            anzahlBogen,
            preise,
            format,
            n,
            (amPlatz?.verbrauch ?? []).length > 0 ||
              verbrauchFuerSchritt(platz, eingabe.schrittId).length > 0,
          );
    });
    klicks = je.length === 1 ? (je[0] ?? null) : klicksZusammen(je);
    if (klicks !== null) {
      const dazu = klicks.kosten.zehntelcent + (klicks.toner?.zehntelcent ?? 0);
      const plus = (g: Geld | null) => (g === null ? null : zehntelcent(g.zehntelcent + dazu));
      if (kostenVoll !== null) {
        const toner = klicks.toner ? ` + ${formatEuro(klicks.toner)} Toner` : '';
        n.rechenweg.push(
          `Vollkosten mit Druck: ${formatEuro(kostenVoll)} Zeit + ${formatEuro(klicks.kosten)} Klicks` +
            `${toner} = ${formatEuro(zehntelcent(kostenVoll.zehntelcent + dazu))}`,
        );
      }
      kostenVoll = plus(kostenVoll);
      kostenTeil = plus(kostenTeil);
    }
  }
  // Verbrauch am Schritt (älterer Stand) und Verbrauchsmaterial der Maschine (T115, je Gruppe eins)
  const verbrauch = [
    ...(amPlatz?.verbrauch ?? []),
    ...maschinenVerbrauch(platz, eingabe.schrittId, eingabeRoh.verbrauchWahl),
  ];
  if (verbrauch.length > 0) {
    const schritt = produktion.arbeitsschritte.find((s) => s.id === eingabe.schrittId);
    const v = rechneVerbrauch(verbrauch, r.wert, schritt?.einheit, eingabe.mengen, lager, n);
    if (v !== null) {
      const plus = (g: Geld | null) => (g === null ? null : zehntelcent(g.zehntelcent + v));
      if (kostenVoll !== null) {
        n.rechenweg.push(
          `Vollkosten mit Verbrauch: ${formatEuro(kostenVoll)} + ${formatEuro(zehntelcent(v))} = ` +
            `${formatEuro(zehntelcent(kostenVoll.zehntelcent + v))}`,
        );
      }
      kostenVoll = plus(kostenVoll);
      kostenTeil = plus(kostenTeil);
    }
  }
  n.hinweise.push(...r.wert.hinweise);
  return { ok: true, wert: { probe: r.wert, klicks, kostenVoll, kostenTeil } };
}

/**
 * Verbrauch eines Schritts in Zehntelcent (kaufmännisch gerundet je Posten): Menge je Einheit ×
 * Anzahl (Einheit des Schritts = Gesamtmenge inkl. Zuschuss, „Auftrag“ = 1, sonst aus `mengen`,
 * z. B. Stapel) × günstigster aktueller Preis (Bogen/Stück je 1.000, Rolle je m²). Ohne Lager
 * (null) oder ohne Preis: Hinweis, der Posten rechnet nicht.
 */
function rechneVerbrauch(
  verbrauch: readonly Verbrauch[],
  probe: ProbeErgebnis,
  einheit: Einheit | undefined,
  mengen: ProbeEingabe['mengen'],
  lager: { lager: Lager; stichtag: string } | undefined,
  n: Notizen,
): number | null {
  if (!lager) {
    n.hinweise.push('Verbrauch braucht das Materiallager – nicht gerechnet');
    return null;
  }
  let summe = 0;
  let gerechnet = false;
  for (const v of verbrauch) {
    const material = lager.lager.materialien.find((m) => m.id === v.materialId);
    if (!material) {
      n.hinweise.push(`Verbrauch: Material ${v.materialId} nicht im Lager`);
      continue;
    }
    // T181: Kostenquelle „im Stundensatz enthalten“ – sichtbar, aber nicht gerechnet
    if (v.imStundensatz === true) {
      n.rechenweg.push(`Verbrauch ${materialName(material)}: im Stundensatz enthalten`);
      continue;
    }
    const anzahlJe =
      v.je === 'Auftrag'
        ? 1
        : v.je === einheit
          ? probe.mengeGesamt
          : v.je === 'Stunde'
            ? probe.laufMs / 3_600_000
            : mengen?.[v.je];
    if (anzahlJe === undefined) {
      n.hinweise.push(
        `Verbrauch ${materialName(material)}: Menge in ${einheitAnzeige(v.je)} fehlt`,
      );
      continue;
    }
    const menge = v.menge * anzahlJe;
    let jeEinheit: number | null = null;
    let quelle = '';
    for (const preis of aktuellePreise(lager.lager, material.id, lager.stichtag)) {
      let w: ReturnType<typeof preisVergleichswerte>;
      try {
        w = preisVergleichswerte(material, preis);
      } catch {
        continue;
      }
      const je =
        material.form === 'Rolle'
          ? w.jeM2?.zehntelcent
          : w.je1000 === undefined
            ? undefined
            : w.je1000.zehntelcent / 1000;
      if (je !== undefined && (jeEinheit === null || je < jeEinheit)) {
        jeEinheit = je;
        quelle = preis.lieferant;
      }
    }
    if (jeEinheit === null) {
      n.hinweise.push(
        `Verbrauch: kein Preis für ${material.id} zum ${lager.stichtag} – rechnet nicht`,
      );
      continue;
    }
    const grund = menge * jeEinheit;
    // T180: Aufschlag auf Verbrauchsmaterial (Material vor Standard des Lagers)
    const aufschlag = verbrauchAufschlag(lager.lager, material);
    const kosten = rundeKaufmaennisch(grund * (1 + aufschlag.prozent / 100));
    const einheitText = materialEinheitText(material);
    const preisText =
      material.form === 'Rolle'
        ? `${formatEuro3(zehntelcent(rundeKaufmaennisch(jeEinheit)))}/m²`
        : formatEuro3(zehntelcent(rundeKaufmaennisch(jeEinheit)));
    n.rechenweg.push(
      `Verbrauch ${materialName(material)}: ${v.menge < 0.001 ? kleineMenge(v.menge) : anzahl(v.menge)} je ${einheitAnzeige(v.je, 1)} × ` +
        `${anzahl(anzahlJe)} = ${menge < 0.001 ? kleineMenge(menge) : anzahl(menge)} ${einheitText} × ${preisText} (${quelle})` +
        (aufschlag.prozent === 0
          ? ''
          : ` = ${formatEuro(zehntelcent(rundeKaufmaennisch(grund)))} + ${anzahl(aufschlag.prozent)} % Aufschlag` +
            (aufschlag.quelle === 'standard'
              ? ' (Standard)'
              : aufschlag.quelle === 'art'
                ? ` (${aufschlag.name ?? ''})`
                : '')) +
        ` = ${formatEuro(zehntelcent(kosten))}`,
    );
    summe += kosten;
    gerechnet = true;
  }
  return gerechnet ? summe : null;
}

/** Ergebnis von `rechneDruckProbe`: wie DruckGang, dazu Rechenweg und Hinweise. */
export type DruckProbe = DruckGang & { rechenweg: string[]; hinweise: string[] };

/**
 * Probe-Rechnung mit Druck (Ausprobieren an der Maschine): dieselbe Rechnung wie ein
 * Druck-Arbeitsgang in der Kalkulation. format = Bogenformat für Klickgröße und Toner.
 */
export function rechneDruckProbe(
  produktion: Produktion,
  eingabe: ProbeEingabe,
  druck: Druck | undefined,
  format: Format | undefined,
  lager?: { lager: Lager; stichtag: string },
): PruefErgebnis<DruckProbe> {
  const n: Notizen = { rechenweg: [], hinweise: [] };
  const g = rechneDruckGang(
    produktionZumStichtag(produktion, lager?.stichtag),
    eingabe,
    druck,
    format,
    n,
    undefined,
    lager,
  );
  if (!g.ok) return g;
  return { ok: true, wert: { ...g.wert, rechenweg: n.rechenweg, hinweise: n.hinweise } };
}

function rechneZukauf(
  zeile: Extract<Zeile, { art: 'zukauf' }>,
  i: number,
  u: Umgebung,
  kette: Kette,
): ZeilenErgebnis {
  const lieferant = (u.produktion.lieferanten ?? []).find((l) => l.id === zeile.lieferantId);
  const name = lieferant?.name ?? zeile.lieferant;
  const e = leer(zeile, `Zukauf${name === undefined ? '' : ` bei ${name}`}`, '');
  if (zeile.teilId !== undefined) {
    const teil = (u.k.teile ?? []).find((t) => t.id === zeile.teilId);
    const tk = kette.teile.find((t) => t.teilId === zeile.teilId);
    if (teil && tk && teil.geliefert === true && tk.papierweg.druckbogen !== null) {
      // T125: Bogen vom Lieferanten – bestellt wird die ermittelte Menge inkl. Zuschuss im Haus
      const pw = tk.papierweg;
      const bogen = pw.druckbogen ?? 0;
      e.menge = bogen;
      e.einheit = 'Bogen';
      const f = teil.druckbogen;
      e.rechenweg.push(
        `Bestellmenge für ${teil.name}: ${anzahl(bogen)} Bogen` +
          (f ? ` ${anzahl(f.breiteUm / 1000)} × ${anzahl(f.hoeheUm / 1000)} mm` : '') +
          (pw.nutzenJeBogen !== null ? ` (${anzahl(pw.nutzenJeBogen)} Nutzen je Bogen` : ' (') +
          `, netto ${anzahl(pw.druckbogenNetto ?? 0)} + Zuschuss im Haus ${anzahl(pw.zuschuss)})` +
          ' – mindestens so viele anfragen und bestellen',
      );
    } else if (teil && tk) {
      e.menge = tk.nutzenNetto;
      e.einheit = 'Stück';
      e.rechenweg.push(
        `Bestellmenge für ${teil.name}: ${anzahl(tk.nutzenNetto)} Stück` +
          (kette.produktBrutto > (u.k.auflagen[i] ?? 0)
            ? ' (inkl. Zuschuss beim Zusammenführen)'
            : ''),
      );
    }
  }
  if (zeile.lieferantId !== undefined && !lieferant) {
    e.hinweise.push(`Lieferant ${zeile.lieferantId} nicht gefunden`);
  }
  if (name === undefined) e.hinweise.push('Kein Lieferant angegeben');
  const preis = jeAuflage(zeile.preise, i);
  if (preis === undefined) return e;
  const einkauf = zehntelcent(preis);
  // Aufschlag: Zeile > Lieferant; Gewinnaufschlag zusätzlich, außer ausgeschaltet
  const prozent = zeile.aufschlagProzent ?? lieferant?.aufschlagProzent;
  const festWert = zeile.aufschlagFestZehntelcent ?? lieferant?.aufschlagFestZehntelcent;
  const zv = zeilenVerkauf(
    einkauf,
    prozent,
    festWert,
    zeile.gewinnZusaetzlich ?? lieferant?.gewinnZusaetzlich,
    u.gewinn,
  );
  e.kostenVoll = einkauf;
  e.kostenTeil = einkauf;
  e.verkauf = zv.verkauf;
  e.kostenMitZeilenaufschlag = zv.mit;
  e.rechenweg.push(
    zv.eigener
      ? `Zukauf: Einkauf ${formatEuro(einkauf)} + ${anzahl(prozent ?? 0)} % + ${formatEuro(zehntelcent(festWert ?? 0))} = ${formatEuro(zv.mit)}`
      : `Zukauf: Einkauf ${formatEuro(einkauf)} + ${anzahl(u.gewinn)} % + 0,00 € = ${formatEuro(zv.verkauf)}`,
  );
  const g = gewinnText(zv, u.gewinn);
  if (g) e.rechenweg.push(g);
  return e;
}

function rechneSonstiges(
  zeile: Extract<Zeile, { art: 'sonstiges' }>,
  i: number,
  u: Umgebung,
): ZeilenErgebnis {
  const e = leer(zeile, 'Sonstiges', '');
  const betrag = jeAuflage(zeile.betraege, i);
  if (betrag === undefined) return e;
  const kosten = zehntelcent(betrag);
  e.kostenVoll = kosten;
  e.kostenTeil = kosten;
  const zv = zeilenVerkauf(
    kosten,
    zeile.aufschlagProzent,
    zeile.aufschlagFestZehntelcent,
    zeile.gewinnZusaetzlich,
    u.gewinn,
  );
  e.verkauf = zv.verkauf;
  e.kostenMitZeilenaufschlag = zv.mit;
  if (zv.eigener) {
    e.rechenweg.push(
      `${e.titel}: ${formatEuro(kosten)} + ${anzahl(zeile.aufschlagProzent ?? 0)} % + ` +
        `${formatEuro(zehntelcent(zeile.aufschlagFestZehntelcent ?? 0))} = ${formatEuro(zv.mit)}`,
    );
    const g = gewinnText(zv, u.gewinn);
    if (g) e.rechenweg.push(g);
  } else {
    e.rechenweg.push(`${e.titel}: ${formatEuro(kosten)}`);
  }
  return e;
}

/**
 * Rechnet die Kalkulation je Auflage: jede Zeile einzeln (Material zum Stichtag, günstigster
 * Preis, außer ein Lieferant ist gewählt; Arbeitsgang mit rechneProbe; Zukauf; Sonstiges), dann
 * Summen Voll-/Teilkosten, Verkauf (Kosten + Gewinnaufschlag; Material, Zukauf und Sonstiges mit
 * eigenem Aufschlag – Material/Lieferant oder Zeile – und standardmäßig zusätzlich dem
 * Gewinnaufschlag, außer „Gewinnaufschlag zusätzlich“ ist aus), je Stück/100/1.000,
 * Deckungsbeitrag. Fehlende Kosten → Zeile mit Hinweis, Summe als unvollständig markiert.
 * stichtag ohne Angabe in der Kalkulation = heute (JJJJ-MM-TT).
 */
/**
 * Rechnet alle Auflagen. vorlagen: Formate und Ausschießschemas (für Teile mit `schemaId`);
 * ohne vorlagen rechnen alle Teile automatisch.
 */
export function rechneKalkulation(
  k: Kalkulation,
  produktion: Produktion,
  lager: Lager,
  heute: string,
  vorlagen?: AusschiessVorlagen,
): KalkulationsErgebnis {
  const stichtag = k.stichtag ?? heute;
  const u: Umgebung = {
    k,
    // T164: nur die am Stichtag geltenden Klickpreise
    produktion: produktionZumStichtag(produktion, stichtag),
    lager,
    vorlagen,
    stichtag,
    gewinn: k.gewinnProzent ?? 0,
  };
  const auflagen = k.auflagen.map((auflage, i): AuflagenErgebnis => {
    const kette = rechneKette(i, u);
    const zeilen = k.zeilen.map((zeile) => {
      switch (zeile.art) {
        case 'material':
          return rechneMaterial(zeile, i, u, kette);
        case 'arbeitsgang':
          return rechneArbeitsgang(zeile, i, u, kette);
        case 'zukauf':
          return rechneZukauf(zeile, i, u, kette);
        case 'sonstiges':
          return rechneSonstiges(zeile, i, u);
      }
    });
    const summe = (f: (z: ZeilenErgebnis) => Geld | null) =>
      zehntelcent(zeilen.reduce((s, z) => s + (f(z)?.zehntelcent ?? 0), 0));
    const verkauf = summe((z) => z.verkauf);
    const summeTeil = summe((z) => z.kostenTeil);
    return {
      auflage,
      zeilen,
      zeitMs: zeilen.reduce((s, z) => s + z.zeitMs, 0),
      summeVoll: summe((z) => z.kostenVoll),
      summeTeil,
      vollstaendig: zeilen.every((z) => z.kostenVoll !== null),
      teilVollstaendig: zeilen.every((z) => z.kostenTeil !== null),
      verkauf,
      kostenMitZeilenaufschlag: summe((z) => z.kostenMitZeilenaufschlag),
      jeStueck: zehntelcent(rundeKaufmaennisch(verkauf.zehntelcent / auflage)),
      je100: zehntelcent(rundeKaufmaennisch((verkauf.zehntelcent * 100) / auflage)),
      je1000: zehntelcent(rundeKaufmaennisch((verkauf.zehntelcent * 1000) / auflage)),
      deckungsbeitrag: zehntelcent(verkauf.zehntelcent - summeTeil.zehntelcent),
      papierwege: kette.teile,
      klicksJeKlickart: klicksJeKlickart(zeilen),
    };
  });
  return { einheit: k.einheit, gewinnProzent: u.gewinn, auflagen };
}

/** Kurzfassung einer Auflage als Zeilen (für Anzeige und Prüfung). */
export function auflagenZusammenfassung(a: AuflagenErgebnis, einheit: Einheit): string[] {
  const name = einheitAnzeige(einheit, a.auflage);
  const zeilen = [
    `Auflage ${anzahl(a.auflage)} ${name}`,
    `Zeit: ${formatDauer(ms(a.zeitMs))}`,
    `Vollkosten: ${formatEuro(a.summeVoll)}${a.vollstaendig ? '' : ' (unvollständig)'}`,
    `Teilkosten: ${formatEuro(a.summeTeil)}${a.teilVollstaendig ? '' : ' (unvollständig)'}`,
    `Verkauf: ${formatEuro(a.verkauf)}`,
    `Je ${einheitAnzeige(einheit, 1)} ${formatEuro3(a.jeStueck)} · je 100 ${formatEuro(a.je100)} · je 1.000 ${formatEuro(a.je1000)}`,
    `Deckungsbeitrag: ${formatEuro(a.deckungsbeitrag)}${a.teilVollstaendig ? '' : ' (unvollständig)'}`,
  ];
  return zeilen;
}
