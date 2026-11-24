import type { z } from 'zod/v3';

export type Fehler = { pfad: string; meldung: string };
export type PruefErgebnis<T> = { ok: true; wert: T } | { ok: false; fehler: Fehler[] };

/** Wandelt ein zod-Ergebnis um. pfad = Pfadteile mit "." verbunden, z. B. "endformat.breiteUm". */
export function ausZod<T>(ergebnis: z.SafeParseReturnType<unknown, T>): PruefErgebnis<T> {
  if (ergebnis.success) {
    return { ok: true, wert: ergebnis.data };
  }
  return {
    ok: false,
    fehler: ergebnis.error.issues.map((issue) => ({
      pfad: issue.path.map(String).join('.'),
      meldung: issue.message,
    })),
  };
}
