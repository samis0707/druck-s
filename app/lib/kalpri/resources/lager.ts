import { pruefeMaterial, type Material } from './material';
import { pruefeLager, type Lager } from './lager-schema';
import { STANDARD_GRUPPEN } from './material-gruppe-schema';
import type { PruefErgebnis } from './pruefung';
/** Leeres Lager ohne Material und ohne Bestand. */
export function leeresLager(): Lager {
  return { version: 1, materialien: [], bestaende: [] };
}

/** Nächste freie automatische ID: "M" + mindestens 4 Ziffern, eins höher als die höchste vorhandene "M####"-ID.
 *  Andere IDs (z. B. "L1") werden ignoriert. Leeres Lager → "M0001". */
export function naechsteMaterialId(lager: Lager): string {
  let hoechste = 0;
  for (const material of lager.materialien) {
    const treffer = /^M(\d+)$/.exec(material.id);
    if (!treffer) continue;
    const zahl = Number.parseInt(treffer[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) {
      hoechste = zahl;
    }
  }
  return `M${String(hoechste + 1).padStart(4, '0')}`;
}

/** Prüft das Material, lehnt doppelte ID ab (Fehler { pfad: 'id', meldung: 'ID doppelt: <id>' }).
 *  Fehlt die ID oder ist sie nach dem Trimmen leer, wird naechsteMaterialId(lager) vergeben. */
export function materialHinzufuegen(lager: Lager, material: unknown): PruefErgebnis<Lager> {
  const pruefung = pruefeMaterial(mitAutomatischerId(lager, material));
  if (!pruefung.ok) {
    return pruefung;
  }
  const id = pruefung.wert.id;
  if (lager.materialien.some((vorhanden) => vorhanden.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `ID doppelt: ${id}` }] };
  }
  const gruppeId = pruefung.wert.gruppeId;
  if (
    gruppeId !== undefined &&
    !(lager.gruppen ?? STANDARD_GRUPPEN).some((g) => g.id === gruppeId)
  ) {
    return {
      ok: false,
      fehler: [{ pfad: 'gruppeId', meldung: `Gruppe ${gruppeId} nicht gefunden` }],
    };
  }
  // Tags (T69): nur Tag-IDs aus dem Katalog des Lagers
  const fehltTag = (pruefung.wert.tags ?? []).find(
    (tagId) => !(lager.tags ?? []).some((tag) => tag.id === tagId),
  );
  if (fehltTag !== undefined) {
    return {
      ok: false,
      fehler: [{ pfad: 'tags', meldung: `Tag ${fehltTag} nicht gefunden` }],
    };
  }
  return { ok: true, wert: { ...lager, materialien: [...lager.materialien, pruefung.wert] } };
}

/** Hängt eine automatische ID an die Eingabe, wenn sie ein Objekt ist und
 *  die ID fehlt oder nach dem Trimmen leer ist. Alles andere wird unverändert durchgereicht. */
function mitAutomatischerId(lager: Lager, material: unknown): unknown {
  if (typeof material !== 'object' || material === null || Array.isArray(material)) {
    return material;
  }
  const id = (material as { id?: unknown }).id;
  const passt = id !== undefined && (typeof id !== 'string' || id.trim() !== '');
  if (passt) {
    return material;
  }
  return { ...(material as Record<string, unknown>), id: naechsteMaterialId(lager) };
}

/** Ersetzt das Material mit gleicher ID. Unbekannte ID → { pfad: 'id', meldung: 'Material <id> nicht gefunden' }.
 *  Wechselt die Form, müssen die Bestände dazu passen, sonst Fehler aus pruefeLager. */
export function materialAendern(lager: Lager, material: unknown): PruefErgebnis<Lager> {
  const pruefung = pruefeMaterial(material);
  if (!pruefung.ok) {
    return pruefung;
  }
  const id = pruefung.wert.id;
  const index = lager.materialien.findIndex((vorhanden) => vorhanden.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Material ${id} nicht gefunden` }] };
  }
  const materialien = lager.materialien.map((vorhanden, i) =>
    i === index ? pruefung.wert : vorhanden,
  );
  return pruefeLager({ ...lager, materialien });
}

/** Entfernt Material und seine Bestandszeilen. Abgelehnt, wenn eine Bestandszeile menge > 0
 *  oder reserviert > 0 hat: { pfad: 'id', meldung: 'Material <id> hat noch Bestand' }.
 *  Unbekannte ID → { pfad: 'id', meldung: 'Material <id> nicht gefunden' }. */
export function materialEntfernen(lager: Lager, id: string): PruefErgebnis<Lager> {
  if (!lager.materialien.some((vorhanden) => vorhanden.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Material ${id} nicht gefunden` }] };
  }
  const hatBestand = lager.bestaende.some(
    (bestand) => bestand.materialId === id && (bestand.menge > 0 || bestand.reserviert > 0),
  );
  if (hatBestand) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Material ${id} hat noch Bestand` }] };
  }
  return {
    ok: true,
    wert: {
      ...lager,
      materialien: lager.materialien.filter((vorhanden) => vorhanden.id !== id),
      bestaende: lager.bestaende.filter((bestand) => bestand.materialId !== id),
    },
  };
}

/** Setzt die Bestandszeile für (materialId, lagerort): ersetzt vorhandene oder hängt neue an.
 *  Ergebnis wird mit pruefeLager geprüft. */
export function bestandSetzen(lager: Lager, bestand: unknown): PruefErgebnis<Lager> {
  const roh = bestand as { materialId?: unknown; lagerort?: unknown } | undefined;
  const materialId = typeof roh?.materialId === 'string' ? roh.materialId : undefined;
  const lagerort = typeof roh?.lagerort === 'string' ? roh.lagerort : undefined;
  const index = lager.bestaende.findIndex(
    (vorhanden) => vorhanden.materialId === materialId && vorhanden.lagerort === lagerort,
  );
  const bestaende: unknown[] =
    index >= 0
      ? lager.bestaende.map((vorhanden, i) => (i === index ? bestand : vorhanden))
      : [...lager.bestaende, bestand];
  return pruefeLager({ ...lager, bestaende });
}

/** Vergleicht Texte zeichenweise, unabhängig von der Sprachumgebung. */
function vergleichen(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Erzeugt eine Kopie mit alphabetisch sortierten Schlüsseln in jedem Objekt. */
function schluesselSortieren(wert: unknown): unknown {
  if (Array.isArray(wert)) {
    return wert.map((eintrag) => schluesselSortieren(eintrag));
  }
  if (wert && typeof wert === 'object') {
    const quelle = wert as Record<string, unknown>;
    const sortiert: Record<string, unknown> = {};
    for (const schluessel of Object.keys(quelle).sort()) {
      sortiert[schluessel] = schluesselSortieren(quelle[schluessel]);
    }
    return sortiert;
  }
  return wert;
}

/** JSON mit 2 Leerzeichen Einrückung; materialien nach id sortiert, bestaende nach materialId, dann lagerort,
 *  preise und stanzformen nach id (nur wenn vorhanden).
 *  Die Schlüssel jedes Objekts werden alphabetisch sortiert ausgegeben, damit das Ergebnis immer gleich ist
 *  (die Prüfung mit zod ändert sonst die Reihenfolge der Felder). */
export function lagerAlsJson(lager: Lager): string {
  const materialien = [...lager.materialien].sort((a, b) => vergleichen(a.id, b.id));
  const bestaende = [...lager.bestaende].sort(
    (a, b) => vergleichen(a.materialId, b.materialId) || vergleichen(a.lagerort, b.lagerort),
  );
  const preise =
    lager.preise === undefined
      ? undefined
      : [...lager.preise].sort((a, b) => vergleichen(a.id, b.id));
  const stanzformen =
    lager.stanzformen === undefined
      ? undefined
      : [...lager.stanzformen].sort((a, b) => vergleichen(a.id, b.id));
  return JSON.stringify(
    schluesselSortieren({ ...lager, materialien, bestaende, preise, stanzformen }),
    null,
    2,
  );
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }; sonst pruefeLager. */
export function lagerAusJson(text: string): PruefErgebnis<Lager> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeLager(roh);
}

/** Sucht Materialien, deren Artikelnummer gleich ist (getrimmt, ohne Groß-/Kleinschreibung).
 *  Mit lieferant: zusätzlich gleicher Lieferant (ebenso verglichen). Leere Nummer → []. */
export function findeMaterialNachArtikelnummer(
  lager: Lager,
  nummer: string,
  lieferant?: string,
): Material[] {
  const gesucht = nummer.trim().toLowerCase();
  if (gesucht === '') {
    return [];
  }
  const lieferantGesucht = lieferant === undefined ? undefined : lieferant.trim().toLowerCase();
  return lager.materialien.filter((material) =>
    (material.artikelnummern ?? []).some(
      (eintrag) =>
        eintrag.nummer.trim().toLowerCase() === gesucht &&
        (lieferantGesucht === undefined ||
          eintrag.lieferant.trim().toLowerCase() === lieferantGesucht),
    ),
  );
}

export type Verfuegbarkeit = {
  status: 'nicht_gelagert' | 'nicht_vorraetig' | 'zu_wenig' | 'vorraetig';
  frei: number;
  einheit: 'Bogen' | 'Rolle' | 'Stueck' | 'ml' | 'l' | 'g' | 'kg' | 'm';
};

/** nicht_gelagert: keine Bestandszeile. nicht_vorraetig: frei = 0.
 *  zu_wenig: benoetigt angegeben und frei < benoetigt. Sonst vorraetig.
 *  Unbekanntes Material → RangeError "Material <id> nicht gefunden". */
export function verfuegbarkeit(
  lager: Lager,
  materialId: string,
  benoetigt?: number,
): Verfuegbarkeit {
  const material = lager.materialien.find((vorhanden) => vorhanden.id === materialId);
  if (!material) {
    throw new RangeError(`Material ${materialId} nicht gefunden`);
  }
  const zeilen = lager.bestaende.filter((bestand) => bestand.materialId === materialId);
  const frei = zeilen.reduce((summe, bestand) => summe + (bestand.menge - bestand.reserviert), 0);
  let status: Verfuegbarkeit['status'];
  if (zeilen.length === 0) {
    status = 'nicht_gelagert';
  } else if (frei === 0) {
    status = 'nicht_vorraetig';
  } else if (benoetigt !== undefined && frei < benoetigt) {
    status = 'zu_wenig';
  } else {
    status = 'vorraetig';
  }
  return { status, frei, einheit: material.form === 'Menge' ? material.einheit : material.form };
}

const ZAHL = new Intl.NumberFormat('de-DE');

/** Einheitstext für die Anzeige: Bogen/Bogen, Rolle/Rollen (bei 1: Rolle), Stueck → "Stück". */
function einheitText(einheit: Verfuegbarkeit['einheit'], anzahl: number): string {
  if (einheit === 'Rolle') {
    return anzahl === 1 ? 'Rolle' : 'Rollen';
  }
  if (einheit === 'Stueck') return 'Stück';
  return einheit === 'Bogen' ? 'Bogen' : einheit;
}

/** Deutsche Meldung zur Verfügbarkeit, Zahlen mit Intl.NumberFormat('de-DE'). */
export function verfuegbarkeitsMeldung(v: Verfuegbarkeit, benoetigt?: number): string {
  if (v.status === 'nicht_gelagert') {
    return 'Nicht am Lager geführt – bei Bedarf bestellen';
  }
  if (v.status === 'nicht_vorraetig') {
    return 'Nicht vorrätig';
  }
  const frei = `${ZAHL.format(v.frei)} ${einheitText(v.einheit, v.frei)}`;
  if (v.status === 'zu_wenig') {
    return `Nur ${frei} frei, ${ZAHL.format(benoetigt ?? 0)} benötigt`;
  }
  return `${frei} frei`;
}
