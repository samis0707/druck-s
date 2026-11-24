import { z } from 'zod/v3';
import type { Lager } from './lager-schema';
import { ausZod, type PruefErgebnis } from './pruefung';
import { LagerStanzformSchema } from './stanzform-schema';

/**
 * Werkzeuge als eigener Datenblock (ADR 0003): heute nur Stanzformen. Werkzeuge sind kein
 * Material und kein Bestand; sie werden genutzt, nicht verbraucht.
 */
export const WerkzeugeSchema = z
  .object({
    version: z.literal(1, {
      errorMap: (issue, ctx) =>
        issue.code === z.ZodIssueCode.invalid_literal
          ? { message: issue.received === undefined ? 'Pflichtfeld' : 'Version muss 1 sein' }
          : { message: ctx.defaultError },
    }),
    stanzformen: z.array(LagerStanzformSchema, {
      required_error: 'Pflichtfeld',
      invalid_type_error: 'muss eine Liste sein',
    }),
  })
  .superRefine((w, ctx) => {
    const ids = new Set<string>();
    w.stanzformen.forEach((form, index) => {
      if (ids.has(form.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stanzformen', index, 'id'],
          message: `ID doppelt: ${form.id}`,
        });
      }
      ids.add(form.id);
    });
  });

export type Werkzeuge = z.infer<typeof WerkzeugeSchema>;

export function pruefeWerkzeuge(input: unknown): PruefErgebnis<Werkzeuge> {
  return ausZod(WerkzeugeSchema.safeParse(input));
}

export function leereWerkzeuge(): Werkzeuge {
  return { version: 1, stanzformen: [] };
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

/** JSON mit 2 Leerzeichen Einrückung, Stanzformen nach ID, Schlüssel alphabetisch (deterministisch). */
export function werkzeugeAlsJson(w: Werkzeuge): string {
  const stanzformen = [...w.stanzformen].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(schluesselSortieren({ ...w, stanzformen }), null, 2);
}

/** Liest JSON. Kein gültiges JSON → { pfad: '', meldung: 'Kein gültiges JSON' }; sonst pruefeWerkzeuge. */
export function werkzeugeAusJson(text: string): PruefErgebnis<Werkzeuge> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: '', meldung: 'Kein gültiges JSON' }] };
  }
  return pruefeWerkzeuge(roh);
}

/**
 * Teilt ein Lager (alter, gemeinsamer Datenblock) in Material-Stammdaten ohne Stanzformen und
 * den Werkzeug-Block. Nichts geht verloren: lagerZusammenfuehren stellt es wieder her.
 */
export function lagerAufteilen(lager: Lager): { material: Lager; werkzeuge: Werkzeuge } {
  const material: Lager = { ...lager };
  delete material.stanzformen;
  return { material, werkzeuge: { version: 1, stanzformen: [...(lager.stanzformen ?? [])] } };
}

/**
 * Setzt Material-Stammdaten und Werkzeuge wieder zu einem Lager zusammen (Sicht für Rechnung
 * und Oberfläche, Rückweg der Umstellung). Die Stanzformen kommen aus den Werkzeugen; eine
 * leere Liste fällt weg.
 */
export function lagerZusammenfuehren(material: Lager, werkzeuge: Werkzeuge): Lager {
  const lager: Lager = { ...material };
  delete lager.stanzformen;
  if (werkzeuge.stanzformen.length > 0) lager.stanzformen = [...werkzeuge.stanzformen];
  return lager;
}
