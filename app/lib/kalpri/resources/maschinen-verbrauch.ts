import type { Lager } from './lager-schema';
import type { Arbeitsplatz, MaschinenVerbrauch, Produktion, Verbrauch } from './produktion-schema';

/**
 * T115: Verbrauchsmaterial der Maschine – Gruppen von Alternativen (Folie matt | glänzend |
 * Softtouch), je Gruppe wird eines gerechnet.
 */

const schluessel = (text: string) => text.trim().toLowerCase();

/** Einträge, die beim Schritt anfallen (ohne `schritte` = bei allen Schritten der Maschine). */
export function verbrauchFuerSchritt(
  platz: Pick<Arbeitsplatz, 'verbrauchsmaterial'> | undefined,
  schrittId: string,
): MaschinenVerbrauch[] {
  return (platz?.verbrauchsmaterial ?? []).filter(
    (v) => v.schritte === undefined || v.schritte.length === 0 || v.schritte.includes(schrittId),
  );
}

export type VerbrauchGruppe = { gruppe: string; eintraege: MaschinenVerbrauch[] };

/** Gruppen beim Schritt in der Reihenfolge des ersten Eintrags. */
export function verbrauchGruppen(
  platz: Pick<Arbeitsplatz, 'verbrauchsmaterial'> | undefined,
  schrittId: string,
): VerbrauchGruppe[] {
  const gruppen: VerbrauchGruppe[] = [];
  for (const v of verbrauchFuerSchritt(platz, schrittId)) {
    const g = gruppen.find((x) => schluessel(x.gruppe) === schluessel(v.gruppe));
    if (g) g.eintraege.push(v);
    else gruppen.push({ gruppe: v.gruppe.trim(), eintraege: [v] });
  }
  return gruppen;
}

/** Der Eintrag einer Gruppe: gewählt (Material-ID), sonst Standard, sonst der erste. */
export function eintragDerGruppe(
  g: VerbrauchGruppe,
  wahl: Readonly<Record<string, string>> | undefined,
): MaschinenVerbrauch | undefined {
  const gewaehlt = Object.entries(wahl ?? {}).find(([k]) => schluessel(k) === schluessel(g.gruppe));
  return (
    (gewaehlt ? g.eintraege.find((v) => v.materialId === gewaehlt[1]) : undefined) ??
    g.eintraege.find((v) => v.standard === true) ??
    g.eintraege[0]
  );
}

/** Verbrauch des Schritts aus dem Verbrauchsmaterial der Maschine (je Gruppe einer). */
export function maschinenVerbrauch(
  platz: Pick<Arbeitsplatz, 'verbrauchsmaterial'> | undefined,
  schrittId: string,
  wahl?: Readonly<Record<string, string>>,
): Verbrauch[] {
  return verbrauchGruppen(platz, schrittId).flatMap((g) => {
    const v = eintragDerGruppe(g, wahl);
    return v
      ? [
          {
            materialId: v.materialId,
            menge: v.menge,
            je: v.je,
            ...(v.imStundensatz === true ? { imStundensatz: true } : {}),
          },
        ]
      : [];
  });
}

/**
 * Wahl aus einem Merkmal-Wert (z. B. Kaschierung „matt“): je Gruppe der Eintrag mit diesem Wert.
 * Ohne Treffer: undefined (dann gilt der Standard).
 */
export function verbrauchWahlFuerWert(
  platz: Pick<Arbeitsplatz, 'verbrauchsmaterial'> | undefined,
  schrittId: string,
  wert: string | null | undefined,
): Record<string, string> | undefined {
  if (wert === null || wert === undefined || wert.trim() === '') return undefined;
  const wahl: Record<string, string> = {};
  for (const g of verbrauchGruppen(platz, schrittId)) {
    const v = g.eintraege.find(
      (x) => x.wert !== undefined && schluessel(x.wert) === schluessel(wert),
    );
    if (v) wahl[g.gruppe] = v.materialId;
  }
  return Object.keys(wahl).length > 0 ? wahl : undefined;
}

/** Nächste freie ID „V1“, „V2“ … am Platz. */
export function naechsteVerbrauchId(platz: Pick<Arbeitsplatz, 'verbrauchsmaterial'>): string {
  const n = (platz.verbrauchsmaterial ?? [])
    .map((v) => Number(/^V(\d+)$/.exec(v.id)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return `V${n + 1}`;
}

/**
 * Übernahme (T115): Verbrauch am Schritt wandert ins Verbrauchsmaterial der Maschine – je
 * Material eine eigene Gruppe (erstes Wort des Materials, bei Gleichheit „(2)“), nur bei diesem
 * Schritt, als Standard. Die
 * Rechnung bleibt gleich. Ohne alten Verbrauch: dieselbe Produktion (gleiches Objekt).
 */
export function verbrauchAnDieMaschine(
  p: Produktion,
  lager?: Pick<Lager, 'materialien'>,
): Produktion {
  const hatAlten = (p.arbeitsplaetze ?? []).some((a) =>
    a.schritte.some((s) => (s.verbrauch ?? []).length > 0),
  );
  if (!hatAlten) return p;
  // Gruppe = erstes Wort des Materials („Kaschierfolie …“ → „Kaschierfolie“), kurz und lesbar
  const name = (id: string) =>
    (lager?.materialien.find((m) => m.id === id)?.sorte ?? id).trim().split(/\s+/)[0] ?? id;
  return {
    ...p,
    arbeitsplaetze: (p.arbeitsplaetze ?? []).map((a) => {
      if (!a.schritte.some((s) => (s.verbrauch ?? []).length > 0)) return a;
      let platz: Arbeitsplatz = { ...a, verbrauchsmaterial: [...(a.verbrauchsmaterial ?? [])] };
      for (const s of a.schritte) {
        for (const v of s.verbrauch ?? []) {
          // Gruppe je Material und Schritt eindeutig, damit nichts zur Alternative wird
          let gruppe = name(v.materialId).slice(0, 60);
          let k = 2;
          while (
            verbrauchGruppen(platz, s.schrittId).some(
              (g) => schluessel(g.gruppe) === schluessel(gruppe),
            )
          ) {
            gruppe = `${name(v.materialId).slice(0, 55)} (${k++})`;
          }
          platz = {
            ...platz,
            verbrauchsmaterial: [
              ...(platz.verbrauchsmaterial ?? []),
              {
                id: naechsteVerbrauchId(platz),
                materialId: v.materialId,
                gruppe,
                menge: v.menge,
                je: v.je,
                schritte: [s.schrittId],
                standard: true,
              },
            ],
          };
        }
      }
      return {
        ...platz,
        schritte: platz.schritte.map((s) => {
          if (s.verbrauch === undefined) return s;
          const neu = { ...s };
          delete neu.verbrauch;
          return neu;
        }),
      };
    }),
  };
}
