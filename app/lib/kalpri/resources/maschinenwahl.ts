import { formatEuro, zehntelcent, type Geld } from '@druck/units';
import type { AusschiessVorlagen } from '@druck/layout-core';
import type { Kalkulation } from './kalkulation-schema';
import { rechneKalkulation } from './kalkulation';
import type { Lager } from './lager-schema';
import type { Arbeitsplatz, Produktion } from './produktion-schema';
import { schrittLeistung } from './produktion-schema';
import { stundensatzDesPlatzes } from './stundensatz';

/**
 * Stand einer Maschine für einen Arbeitsgang: geeignet (rechnet, keine Gründe dagegen),
 * rechnet nicht (Leistung oder Satz fehlt) oder ungeeignet (inaktiv, Grenzen, Sonderfall).
 */
export type MaschinenStand = 'geeignet' | 'rechnetNicht' | 'ungeeignet';

/** Eine Maschine, die den Schritt einer Arbeitsgang-Zeile kann (T84). */
export type MaschinenOption = {
  platzId: string;
  name: string;
  /** Die Maschine steht heute in der Zeile. */
  gewaehlt: boolean;
  stand: MaschinenStand;
  /** Warum nicht geeignet bzw. warum sie nicht rechnet; leer bei „geeignet“. */
  gruende: string[];
  /** Zeit und Vollkosten dieser Zeile mit dieser Maschine. */
  zeitMs: number;
  kostenZeile: Geld | null;
  /** Vollkosten der ganzen Auflage mit dieser Maschine (Papier und Zuschüsse eingeschlossen). */
  summeVoll: Geld;
  /** summeVoll − summeVoll der gewählten Maschine; null, wenn eine der beiden nicht geeignet ist. */
  mehrkosten: Geld | null;
};

const RANG: Record<MaschinenStand, number> = { geeignet: 0, rechnetNicht: 1, ungeeignet: 2 };

/** Kandidaten: aktive eigene Plätze mit dem Schritt (Listenreihenfolge), dazu der gewählte. */
function kandidaten(p: Produktion, schrittId: string, platzId: string): Arbeitsplatz[] {
  const alle = p.arbeitsplaetze ?? [];
  const mit = alle.filter(
    (x) =>
      (x.id === platzId || (x.inaktiv !== true && x.fremdarbeit === undefined)) &&
      x.schritte.some((s) => s.schrittId === schrittId),
  );
  return mit;
}

/**
 * Kalkulation mit anderer Maschine in der Arbeitsgang-Zeile `zeileId` (T85). Eine Ausführung
 * (`profil`), die es an der neuen Maschine für den Schritt nicht gibt, entfällt; sonst bleibt die
 * Zeile, wie sie ist. Unbekannte Zeile oder kein Arbeitsgang → Kalkulation unverändert.
 */
export function kalkulationMitMaschine(
  k: Kalkulation,
  zeileId: string,
  produktion: Produktion,
  platzId: string,
): Kalkulation {
  const platz = (produktion.arbeitsplaetze ?? []).find((p) => p.id === platzId);
  return {
    ...k,
    zeilen: k.zeilen.map((z) => {
      if (z.id !== zeileId || z.art !== 'arbeitsgang') return z;
      const neu = { ...z, platzId };
      if (neu.profil !== undefined) {
        const name = neu.profil.trim().toLowerCase();
        const profile = platz?.schritte.find((s) => s.schrittId === z.schrittId)?.profile ?? [];
        if (!profile.some((v) => v.name.toLowerCase() === name)) delete neu.profil;
      }
      return neu;
    }),
  };
}

/** Warum der Platz nicht rechnet: Leistung oder Satz fehlt; sonst die Hinweise der Zeile. */
function gruendeRechnetNicht(
  p: Produktion,
  platz: Arbeitsplatz,
  schrittId: string,
  hinweise: string[],
): string[] {
  const gruende: string[] = [];
  const amPlatz = platz.schritte.find((s) => s.schrittId === schrittId);
  if (
    (amPlatz === undefined || schrittLeistung(platz, amPlatz) === undefined) &&
    amPlatz?.laeuftMit === undefined
  ) {
    gruende.push('Leistung fehlt');
  }
  if (stundensatzDesPlatzes(p, platz).stundensatzVollZehntelcent === undefined) {
    gruende.push('Stundensatz fehlt');
  }
  return gruende.length > 0 ? gruende : [...new Set(hinweise)];
}

/**
 * Welche Maschinen können den Arbeitsgang `zeileId`, und was kostet er mit jeder (T84)?
 * Für jede Maschine, die den Schritt kann (aktiv, keine Fremdarbeit; die gewählte immer), wird
 * die ganze Kalkulation mit dieser Maschine in der Zeile gerechnet (`kalkulationMitMaschine`).
 * Damit zählen auch Papier und Zuschüsse, die sich durch die Maschine ändern (z. B. Druckbogen,
 * nicht bedruckbarer Rand).
 * Reihenfolge: geeignete nach Vollkosten der Auflage (gleich teuer: Listenreihenfolge), dann die,
 * die nicht rechnen, dann die ungeeigneten. Unbekannte Zeile oder kein Arbeitsgang → [].
 */
export function maschinenWahl(
  k: Kalkulation,
  zeileId: string,
  produktion: Produktion,
  lager: Lager,
  heute: string,
  vorlagen?: AusschiessVorlagen,
  auflageIndex = 0,
): MaschinenOption[] {
  const zeile = k.zeilen.find((z) => z.id === zeileId);
  if (zeile === undefined || zeile.art !== 'arbeitsgang') return [];
  if (k.auflagen[auflageIndex] === undefined) return [];

  const optionen = kandidaten(produktion, zeile.schrittId, zeile.platzId).map((platz, reihe) => {
    const kopie = kalkulationMitMaschine(k, zeileId, produktion, platz.id);
    const auflage = rechneKalkulation(kopie, produktion, lager, heute, vorlagen).auflagen[
      auflageIndex
    ];
    const ergebnis = auflage?.zeilen.find((z) => z.zeileId === zeileId);
    let stand: MaschinenStand = 'geeignet';
    let gruende: string[] = [];
    if (platz.inaktiv === true || (ergebnis?.ungeeignet?.length ?? 0) > 0) {
      stand = 'ungeeignet';
      gruende = [...(platz.inaktiv === true ? ['inaktiv'] : []), ...(ergebnis?.ungeeignet ?? [])];
    } else if (!ergebnis || ergebnis.kostenVoll === null) {
      stand = 'rechnetNicht';
      gruende = gruendeRechnetNicht(produktion, platz, zeile.schrittId, ergebnis?.hinweise ?? []);
    }
    const option: MaschinenOption = {
      platzId: platz.id,
      name: platz.name,
      gewaehlt: platz.id === zeile.platzId,
      stand,
      gruende,
      zeitMs: ergebnis?.zeitMs ?? 0,
      kostenZeile: ergebnis?.kostenVoll ?? null,
      summeVoll: auflage?.summeVoll ?? zehntelcent(0),
      mehrkosten: null,
    };
    return { option, reihe };
  });

  const gewaehlt = optionen.find((o) => o.option.gewaehlt)?.option;
  for (const { option } of optionen) {
    if (gewaehlt?.stand === 'geeignet' && option.stand === 'geeignet') {
      option.mehrkosten = zehntelcent(
        option.summeVoll.zehntelcent - gewaehlt.summeVoll.zehntelcent,
      );
    }
  }
  return optionen
    .sort(
      (a, b) =>
        RANG[a.option.stand] - RANG[b.option.stand] ||
        (a.option.stand === 'geeignet'
          ? a.option.summeVoll.zehntelcent - b.option.summeVoll.zehntelcent
          : 0) ||
        a.reihe - b.reihe,
    )
    .map((o) => o.option);
}

/** Ein Maschinenwechsel durch `guenstigsteMaschinen` (T86). */
export type MaschinenWechsel = {
  zeileId: string;
  vonPlatzId: string;
  nachPlatzId: string;
  /** Ersparnis der ersten Auflage; null, wenn die bisherige Maschine nicht geeignet war. */
  ersparnis: Geld | null;
  /** z. B. „Rillen: Rillmaschine groß statt Schneide-/Rillsystem (1.000: 208,83 € günstiger)“ */
  text: string;
};

/**
 * Setzt in den Arbeitsgang-Zeilen die günstigste geeignete Maschine (T86), Zeile für Zeile in
 * der Reihenfolge der Kalkulation; jede Zeile sieht die Wahl der Zeilen davor. Gewechselt wird
 * nur, wenn die erste Maschine von `maschinenWahl` (erste Auflage) geeignet und nicht gewählt ist
 * und die gewählte nicht geeignet ist oder die Auflage mit der ersten weniger kostet. Bei
 * gleichen Kosten bleibt die gewählte. `zeilenIds` begrenzt auf diese Zeilen (sonst alle).
 */
export function guenstigsteMaschinen(
  k: Kalkulation,
  produktion: Produktion,
  lager: Lager,
  heute: string,
  vorlagen?: AusschiessVorlagen,
  zeilenIds?: string[],
): { kalkulation: Kalkulation; wechsel: MaschinenWechsel[] } {
  let aktuell = k;
  const wechsel: MaschinenWechsel[] = [];
  const auflage = (k.auflagen[0] ?? 0).toLocaleString('de-DE');
  for (const z of k.zeilen) {
    if (z.art !== 'arbeitsgang') continue;
    if (zeilenIds !== undefined && !zeilenIds.includes(z.id)) continue;
    const optionen = maschinenWahl(aktuell, z.id, produktion, lager, heute, vorlagen);
    const erste = optionen[0];
    const gewaehlt = optionen.find((o) => o.gewaehlt);
    if (!erste || erste.gewaehlt || erste.stand !== 'geeignet') continue;
    const besser =
      gewaehlt === undefined ||
      gewaehlt.stand !== 'geeignet' ||
      (erste.mehrkosten !== null && erste.mehrkosten.zehntelcent < 0);
    if (!besser) continue;
    aktuell = kalkulationMitMaschine(aktuell, z.id, produktion, erste.platzId);
    const schritt =
      produktion.arbeitsschritte.find((s) => s.id === z.schrittId)?.name ?? z.schrittId;
    const vonName = gewaehlt?.name ?? z.platzId;
    const ersparnis =
      gewaehlt?.stand === 'geeignet' && erste.mehrkosten !== null
        ? zehntelcent(-erste.mehrkosten.zehntelcent)
        : null;
    const grund =
      ersparnis !== null
        ? `${auflage}: ${formatEuro(ersparnis)} günstiger`
        : gewaehlt?.stand === 'rechnetNicht'
          ? `${vonName} rechnet nicht`
          : `${vonName} ungeeignet`;
    wechsel.push({
      zeileId: z.id,
      vonPlatzId: z.platzId,
      nachPlatzId: erste.platzId,
      ersparnis,
      text: `${schritt}: ${erste.name} statt ${vonName} (${grund})`,
    });
  }
  return { kalkulation: aktuell, wechsel };
}
