import { KalkulationSchema, type IstWert, type Kalkulation } from './kalkulation-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

/**
 * Hängt Ist-Werte an die Kalkulation (Regel 14: Rückmeldungen nur anhängen). Nichts wird
 * ersetzt oder entfernt; die Reihenfolge bleibt; `k` bleibt unverändert. Unbekannte Zeile oder
 * Auflage → Fehler mit Pfad `ist.<i>.<feld>` wie im Schema.
 */
export function istAnhaengen(
  k: Kalkulation,
  eintraege: readonly IstWert[],
): PruefErgebnis<Kalkulation> {
  return ausZod(KalkulationSchema.safeParse({ ...k, ist: [...(k.ist ?? []), ...eintraege] }));
}

/** Zuletzt angehängter Ist-Wert einer Zeile je Auflage; null, wenn keiner da ist. */
export function istFuer(
  k: Pick<Kalkulation, 'ist'>,
  zeileId: string,
  auflage: number,
): IstWert | null {
  const ist = k.ist ?? [];
  for (let i = ist.length - 1; i >= 0; i -= 1) {
    const e = ist[i];
    if (e && e.zeileId === zeileId && e.auflage === auflage) return e;
  }
  return null;
}

/** Abweichung Ist zu Soll in %, eine Nachkommastelle; null ohne Soll/Ist oder bei Soll 0. */
export function istAbweichung(soll: number | null, ist: number | null): number | null {
  if (soll === null || ist === null || soll === 0) return null;
  return Math.round(((ist - soll) / soll) * 1000) / 10;
}
