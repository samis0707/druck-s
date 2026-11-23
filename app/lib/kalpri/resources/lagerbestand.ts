import { z } from 'zod';
import { BestandSchema, pruefeLager, type Lager } from './lager-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

/**
 * Lagerbestand als eigener Datenblock (ADR 0003): die Bestandszeilen (Material, Lagerort, Menge,
 * reserviert). Lager ist Bestand, keine Ressource; die Stammdaten des Materials liegen im
 * Material-Block. Ob jede Zeile zu einem Material passt, prüft bestandEinsetzen.
 */
export const LagerbestandSchema = z.object({
  version: z.literal(1, {
    errorMap: (issue, ctx) =>
      issue.code === z.ZodIssueCode.invalid_literal
        ? { message: issue.received === undefined ? 'Pflichtfeld' : 'Version muss 1 sein' }
        : { message: ctx.defaultError },
  }),
  bestaende: z.array(BestandSchema, {
    required_error: 'Pflichtfeld',
    invalid_type_error: 'muss eine Liste sein',
  }),
});

export type Lagerbestand = z.infer<typeof LagerbestandSchema>;

export function pruefeLagerbestand(input: unknown): PruefErgebnis<Lagerbestand> {
  return ausZod(LagerbestandSchema.safeParse(input));
}

export function leererLagerbestand(): Lagerbestand {
  return { version: 1, bestaende: [] };
}

function vergleichen(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function schluesselSortieren(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(schluesselSortieren);
  if (typeof wert === 'object' && wert !== null) {
    const ergebnis: Record<string, unknown> = {};
    for (const schluessel of Object.keys(wert).sort()) {
      ergebnis[schluessel] = schluesselSortieren((wert as Record<string, unknown>)[schluessel]);
    }
    return ergebnis;
  }
  return wert;
}

/** JSON mit 2 Leerzeichen Einrückung, nach Material-ID und Lagerort sortiert (wie lagerAlsJson),
 *  Schlüssel alphabetisch (deterministisch). */
export function lagerbestandAlsJson(b: Lagerbestand): string {
  const bestaende = [...b.bestaende].sort(
    (x, y) => vergleichen(x.materialId, y.materialId) || vergleichen(x.lagerort, y.lagerort),
  );
  return JSON.stringify(schluesselSortieren({ ...b, bestaende }), null, 2);
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }; sonst pruefeLagerbestand. */
export function lagerbestandAusJson(text: string): PruefErgebnis<Lagerbestand> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeLagerbestand(roh);
}

/** Trennt den Bestand ab: Material-Stammdaten mit leerem `bestaende` (Pflichtfeld des Schemas)
 *  und der Bestand-Block. bestandEinsetzen stellt das Lager wieder her. */
export function bestandAbtrennen(lager: Lager): { material: Lager; bestand: Lagerbestand } {
  return {
    material: { ...lager, bestaende: [] },
    bestand: { version: 1, bestaende: [...lager.bestaende] },
  };
}

/**
 * Setzt den Bestand in die Material-Stammdaten ein und prüft das Ganze mit pruefeLager: Jede
 * Zeile braucht ein vorhandenes Material mit passender Form. Fehler kommen mit dem Pfad aus
 * pruefeLager (z. B. „bestaende.0.materialId“) und werden nicht still korrigiert.
 */
export function bestandEinsetzen(material: Lager, bestand: Lagerbestand): PruefErgebnis<Lager> {
  return pruefeLager({ ...material, bestaende: bestand.bestaende });
}
