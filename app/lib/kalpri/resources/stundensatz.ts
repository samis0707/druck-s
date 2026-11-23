import type { Arbeitsplatz, Produktion } from './produktion-schema';

/** Woher der Stundensatz eines Platzes kommt. */
export type SatzHerkunft = { art: 'platz' } | { art: 'kostenstelle'; id: string; name: string };

/** Stundensatz, der für einen Platz gilt (Zehntelcent je Stunde), mit Herkunft. */
export type Stundensatz = {
  stundensatzVollZehntelcent?: number;
  stundensatzTeilZehntelcent?: number;
  personalZehntelcent?: number;
  vorlaeufig: boolean;
  herkunft: SatzHerkunft;
};

/** Plätze, die auf die Kostenstelle verweisen, in Listenreihenfolge. */
export function arbeitsplaetzeDerKostenstelle(
  produktion: Produktion,
  kostenstelleId: string,
): Arbeitsplatz[] {
  return (produktion.arbeitsplaetze ?? []).filter((p) => p.kostenstelleId === kostenstelleId);
}

/**
 * Der eine Ort, an dem der Stundensatz eines Platzes gelesen wird: mit kostenstelleId die Sätze
 * der Kostenstelle, sonst die des Platzes. Unbekannte Kostenstelle (ungeprüfte Daten) → ohne Satz.
 */
export function stundensatzDesPlatzes(produktion: Produktion, platz: Arbeitsplatz): Stundensatz {
  const id = platz.kostenstelleId;
  const quelle =
    id === undefined ? platz : (produktion.kostenstellen ?? []).find((k) => k.id === id);
  const satz: Stundensatz = {
    vorlaeufig: quelle?.stundensatzVorlaeufig === true,
    herkunft:
      id === undefined ? { art: 'platz' } : { art: 'kostenstelle', id, name: quelle?.name ?? id },
  };
  if (quelle?.stundensatzVollZehntelcent !== undefined) {
    satz.stundensatzVollZehntelcent = quelle.stundensatzVollZehntelcent;
  }
  if (quelle?.stundensatzTeilZehntelcent !== undefined) {
    satz.stundensatzTeilZehntelcent = quelle.stundensatzTeilZehntelcent;
  }
  if (quelle?.personalZehntelcent !== undefined) {
    satz.personalZehntelcent = quelle.personalZehntelcent;
  }
  return satz;
}
