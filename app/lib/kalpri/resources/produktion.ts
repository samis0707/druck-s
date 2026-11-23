import { stichwortSchluessel } from './lieferant-schema';
import { pruefeProduktion, type Produktion } from './produktion-schema';
import type { Fehler, PruefErgebnis } from './pruefung';

/** Leere Produktion ohne Arbeitsschritte und Arbeitsplätze. */
export function leereProduktion(): Produktion {
  return { version: 1, arbeitsschritte: [] };
}

/** Nächste ID aus Präfix + mindestens 4 Ziffern, eins höher als die höchste passende ID. */
function naechsteId(ids: readonly string[], praefix: string): string {
  const muster = new RegExp(`^${praefix}(\\d+)$`);
  let hoechste = 0;
  for (const id of ids) {
    const treffer = muster.exec(id);
    if (!treffer) {
      continue;
    }
    const zahl = Number.parseInt(treffer[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) {
      hoechste = zahl;
    }
  }
  return `${praefix}${String(hoechste + 1).padStart(4, '0')}`;
}

/** "S" + mindestens 4 Ziffern, eins höher als die höchste vorhandene "S####"-ID; leer → "S0001". */
export function naechsteArbeitsschrittId(produktion: Produktion): string {
  return naechsteId(
    produktion.arbeitsschritte.map((s) => s.id),
    'S',
  );
}

/** "AP-" + mindestens 4 Ziffern, eins höher als die höchste "AP-####"-ID; andere IDs zählen nicht. */
export function naechsteArbeitsplatzId(produktion: Produktion): string {
  return naechsteId(
    (produktion.arbeitsplaetze ?? []).map((p) => p.id),
    'AP-',
  );
}

/** "LF-" + mindestens 4 Ziffern, eins höher als die höchste "LF-####"-ID; leer → "LF-0001". */
export function naechsteLieferantId(produktion: Produktion): string {
  return naechsteId(
    (produktion.lieferanten ?? []).map((l) => l.id),
    'LF-',
  );
}

/** "KST-" + mindestens 4 Ziffern, eins höher als die höchste "KST-####"-ID; leer → "KST-0001". */
export function naechsteKostenstelleId(produktion: Produktion): string {
  return naechsteId(
    (produktion.kostenstellen ?? []).map((k) => k.id),
    'KST-',
  );
}

/** Hängt eine automatische ID an, wenn die Eingabe ein Objekt ist und die ID fehlt oder leer ist. */
function mitAutomatischerId(eingabe: unknown, id: string): unknown {
  if (typeof eingabe !== 'object' || eingabe === null || Array.isArray(eingabe)) {
    return eingabe;
  }
  const vorhanden = (eingabe as { id?: unknown }).id;
  const passt =
    vorhanden !== undefined && (typeof vorhanden !== 'string' || vorhanden.trim() !== '');
  return passt ? eingabe : { ...(eingabe as Record<string, unknown>), id };
}

type Liste = 'arbeitsschritte' | 'arbeitsplaetze' | 'lieferanten' | 'kostenstellen';

/** Prüft die Produktion mit der neuen Liste. Hat der Eintrag an Stelle index Fehler, kommen nur
 *  diese zurück, ohne das Präfix "<liste>.<index>." (z. B. "einheit"); sonst alle Fehler. */
function pruefeMitListe(
  produktion: Produktion,
  liste: Liste,
  eintraege: unknown[],
  index: number,
): PruefErgebnis<Produktion> {
  const pruefung = pruefeProduktion({ ...produktion, [liste]: eintraege });
  if (pruefung.ok) {
    return pruefung;
  }
  const praefix = `${liste}.${index}.`;
  const eigene = pruefung.fehler
    .filter((fehler) => fehler.pfad.startsWith(praefix))
    .map(
      (fehler): Fehler => ({ pfad: fehler.pfad.slice(praefix.length), meldung: fehler.meldung }),
    );
  return { ok: false, fehler: eigene.length > 0 ? eigene : pruefung.fehler };
}

function idAus(eingabe: unknown): string {
  const roh = eingabe as { id?: unknown } | null;
  return typeof roh?.id === 'string' ? roh.id.trim() : '';
}

/** Hängt einen Arbeitsschritt an. Fehlt die ID oder ist sie leer → naechsteArbeitsschrittId.
 *  Doppelte ID oder doppelter Name → Fehler am Feld (aus pruefeProduktion). */
export function arbeitsschrittHinzufuegen(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const eintraege = [
    ...produktion.arbeitsschritte,
    mitAutomatischerId(eingabe, naechsteArbeitsschrittId(produktion)),
  ];
  return pruefeMitListe(produktion, 'arbeitsschritte', eintraege, eintraege.length - 1);
}

/** Ersetzt den Arbeitsschritt mit gleicher ID.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Arbeitsschritt <id> nicht gefunden' }. */
export function arbeitsschrittAendern(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const id = idAus(eingabe);
  const index = produktion.arbeitsschritte.findIndex((schritt) => schritt.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Arbeitsschritt ${id} nicht gefunden` }] };
  }
  const eintraege: unknown[] = produktion.arbeitsschritte.map((schritt, i) =>
    i === index ? eingabe : schritt,
  );
  return pruefeMitListe(produktion, 'arbeitsschritte', eintraege, index);
}

/** Entfernt den Arbeitsschritt.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Arbeitsschritt <id> nicht gefunden' }.
 *  Von Arbeitsplätzen genutzt → { pfad: 'id', meldung: 'Arbeitsschritt <id> wird genutzt von: <Platz-IDs>' }. */
export function arbeitsschrittEntfernen(
  produktion: Produktion,
  id: string,
): PruefErgebnis<Produktion> {
  if (!produktion.arbeitsschritte.some((schritt) => schritt.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Arbeitsschritt ${id} nicht gefunden` }] };
  }
  const nutzer = (produktion.arbeitsplaetze ?? [])
    .filter((platz) => platz.schritte.some((s) => s.schrittId === id))
    .map((platz) => platz.id);
  if (nutzer.length > 0) {
    return {
      ok: false,
      fehler: [
        { pfad: 'id', meldung: `Arbeitsschritt ${id} wird genutzt von: ${nutzer.join(', ')}` },
      ],
    };
  }
  return {
    ok: true,
    wert: {
      ...produktion,
      arbeitsschritte: produktion.arbeitsschritte.filter((schritt) => schritt.id !== id),
    },
  };
}

/** Hängt einen Arbeitsplatz an. Fehlt die ID oder ist sie leer → naechsteArbeitsplatzId.
 *  Fehler des Platzes kommen ohne Präfix zurück (z. B. "schritte.0.schrittId"). */
export function arbeitsplatzHinzufuegen(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const eintraege = [
    ...(produktion.arbeitsplaetze ?? []),
    mitAutomatischerId(eingabe, naechsteArbeitsplatzId(produktion)),
  ];
  return pruefeMitListe(produktion, 'arbeitsplaetze', eintraege, eintraege.length - 1);
}

/** Ersetzt den Arbeitsplatz mit gleicher ID.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Arbeitsplatz <id> nicht gefunden' }. */
export function arbeitsplatzAendern(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const id = idAus(eingabe);
  const vorhandene = produktion.arbeitsplaetze ?? [];
  const index = vorhandene.findIndex((platz) => platz.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Arbeitsplatz ${id} nicht gefunden` }] };
  }
  const eintraege: unknown[] = vorhandene.map((platz, i) => (i === index ? eingabe : platz));
  return pruefeMitListe(produktion, 'arbeitsplaetze', eintraege, index);
}

/** Entfernt den Arbeitsplatz. Unbekannte ID → { pfad: 'id', meldung: 'Arbeitsplatz <id> nicht gefunden' }. */
export function arbeitsplatzEntfernen(
  produktion: Produktion,
  id: string,
): PruefErgebnis<Produktion> {
  const vorhandene = produktion.arbeitsplaetze ?? [];
  if (!vorhandene.some((platz) => platz.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Arbeitsplatz ${id} nicht gefunden` }] };
  }
  return {
    ok: true,
    wert: { ...produktion, arbeitsplaetze: vorhandene.filter((platz) => platz.id !== id) },
  };
}

/** Hängt einen Lieferanten an. Fehlt die ID oder ist sie leer → naechsteLieferantId.
 *  Fehler des Lieferanten kommen ohne Präfix zurück (z. B. "email"). */
export function lieferantHinzufuegen(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const eintraege = [
    ...(produktion.lieferanten ?? []),
    mitAutomatischerId(eingabe, naechsteLieferantId(produktion)),
  ];
  return pruefeMitListe(produktion, 'lieferanten', eintraege, eintraege.length - 1);
}

/** Ersetzt den Lieferanten mit gleicher ID.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Lieferant <id> nicht gefunden' }. */
export function lieferantAendern(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const id = idAus(eingabe);
  const vorhandene = produktion.lieferanten ?? [];
  const index = vorhandene.findIndex((l) => l.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Lieferant ${id} nicht gefunden` }] };
  }
  const eintraege: unknown[] = vorhandene.map((l, i) => (i === index ? eingabe : l));
  return pruefeMitListe(produktion, 'lieferanten', eintraege, index);
}

/** Entfernt den Lieferanten. Unbekannt → „Lieferant <id> nicht gefunden“;
 *  an Fremdarbeit-Plätzen gewählt → „Lieferant <id> wird genutzt von: <Platz-IDs>“. */
export function lieferantEntfernen(produktion: Produktion, id: string): PruefErgebnis<Produktion> {
  const vorhandene = produktion.lieferanten ?? [];
  if (!vorhandene.some((l) => l.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Lieferant ${id} nicht gefunden` }] };
  }
  const nutzer = (produktion.arbeitsplaetze ?? [])
    .filter((p) => p.fremdarbeit?.lieferantId === id)
    .map((p) => p.id);
  if (nutzer.length > 0) {
    return {
      ok: false,
      fehler: [{ pfad: 'id', meldung: `Lieferant ${id} wird genutzt von: ${nutzer.join(', ')}` }],
    };
  }
  const rest = vorhandene.filter((l) => l.id !== id);
  const wert: Produktion = { ...produktion };
  if (rest.length > 0) wert.lieferanten = rest;
  else delete wert.lieferanten;
  return { ok: true, wert };
}

/** Hängt eine Kostenstelle an. Fehlt die ID oder ist sie leer → naechsteKostenstelleId.
 *  Fehler der Kostenstelle kommen ohne Präfix zurück (z. B. "name"). */
export function kostenstelleHinzufuegen(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const eintraege = [
    ...(produktion.kostenstellen ?? []),
    mitAutomatischerId(eingabe, naechsteKostenstelleId(produktion)),
  ];
  return pruefeMitListe(produktion, 'kostenstellen', eintraege, eintraege.length - 1);
}

/** Ersetzt die Kostenstelle mit gleicher ID.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Kostenstelle <id> nicht gefunden' }. */
export function kostenstelleAendern(
  produktion: Produktion,
  eingabe: unknown,
): PruefErgebnis<Produktion> {
  const id = idAus(eingabe);
  const vorhandene = produktion.kostenstellen ?? [];
  const index = vorhandene.findIndex((k) => k.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Kostenstelle ${id} nicht gefunden` }] };
  }
  const eintraege: unknown[] = vorhandene.map((k, i) => (i === index ? eingabe : k));
  return pruefeMitListe(produktion, 'kostenstellen', eintraege, index);
}

/** Entfernt die Kostenstelle. Unbekannt → „Kostenstelle <id> nicht gefunden“;
 *  von Plätzen genutzt → „Kostenstelle <id> wird genutzt von: <Platz-IDs>“. */
export function kostenstelleEntfernen(
  produktion: Produktion,
  id: string,
): PruefErgebnis<Produktion> {
  const vorhandene = produktion.kostenstellen ?? [];
  if (!vorhandene.some((k) => k.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Kostenstelle ${id} nicht gefunden` }] };
  }
  const nutzer = (produktion.arbeitsplaetze ?? [])
    .filter((p) => p.kostenstelleId === id)
    .map((p) => p.id);
  if (nutzer.length > 0) {
    return {
      ok: false,
      fehler: [
        { pfad: 'id', meldung: `Kostenstelle ${id} wird genutzt von: ${nutzer.join(', ')}` },
      ],
    };
  }
  const rest = vorhandene.filter((k) => k.id !== id);
  const wert: Produktion = { ...produktion };
  if (rest.length > 0) wert.kostenstellen = rest;
  else delete wert.kostenstellen;
  return { ok: true, wert };
}

/** Lieferanten mit dem Stichwort (ohne Groß-/Kleinschreibung), in Listenreihenfolge. */
export function lieferantenMitStichwort(produktion: Produktion, stichwort: string) {
  const schluessel = stichwortSchluessel(stichwort);
  return (produktion.lieferanten ?? []).filter((l) =>
    (l.stichworte ?? []).some((w) => stichwortSchluessel(w) === schluessel),
  );
}

/** Alle Stichwörter der Lieferanten, ohne Doppelte (Schreibweise des ersten Vorkommens),
 *  alphabetisch – für Filterknöpfe und Vorschläge. */
export function alleStichworte(produktion: Produktion): string[] {
  const worte = new Map<string, string>();
  for (const l of produktion.lieferanten ?? []) {
    for (const w of l.stichworte ?? []) {
      const schluessel = stichwortSchluessel(w);
      if (!worte.has(schluessel)) worte.set(schluessel, w.trim());
    }
  }
  return [...worte.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

function vergleichen(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Sortiert die Schlüssel aller Objekte alphabetisch (rekursiv); Arrays behalten ihre Reihenfolge. */
function schluesselSortieren(wert: unknown): unknown {
  if (Array.isArray(wert)) {
    return wert.map(schluesselSortieren);
  }
  if (typeof wert === 'object' && wert !== null) {
    const ergebnis: Record<string, unknown> = {};
    for (const schluessel of Object.keys(wert).sort()) {
      ergebnis[schluessel] = schluesselSortieren((wert as Record<string, unknown>)[schluessel]);
    }
    return ergebnis;
  }
  return wert;
}

/** JSON mit 2 Leerzeichen Einrückung; Arbeitsschritte, Arbeitsplätze und Lieferanten nach id
 *  sortiert (Arbeitsplätze und Lieferanten nur, wenn vorhanden), Schlüssel alphabetisch. */
export function produktionAlsJson(produktion: Produktion): string {
  const arbeitsschritte = [...produktion.arbeitsschritte].sort((a, b) => vergleichen(a.id, b.id));
  const arbeitsplaetze =
    produktion.arbeitsplaetze === undefined
      ? undefined
      : [...produktion.arbeitsplaetze].sort((a, b) => vergleichen(a.id, b.id));
  const lieferanten =
    produktion.lieferanten === undefined
      ? undefined
      : [...produktion.lieferanten].sort((a, b) => vergleichen(a.id, b.id));
  const kostenstellen =
    produktion.kostenstellen === undefined
      ? undefined
      : [...produktion.kostenstellen].sort((a, b) => vergleichen(a.id, b.id));
  return JSON.stringify(
    schluesselSortieren({
      ...produktion,
      arbeitsschritte,
      arbeitsplaetze,
      lieferanten,
      kostenstellen,
    }),
    null,
    2,
  );
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }; sonst pruefeProduktion. */
export function produktionAusJson(text: string): PruefErgebnis<Produktion> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeProduktion(roh);
}
