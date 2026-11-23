import { pruefeLager } from './lager-schema';
import type { Lager } from './lager-schema';
import type { Fehler, PruefErgebnis } from './pruefung';
import type { LagerStanzform, StanzHerkunft } from './stanzform-schema';

/** Standard-Tiegel, bis es eine Maschinenliste gibt: 260 mm an der Greiferkante, 380 mm tief. */
export const STANDARD_TIEGEL = { breiteUm: 260000, hoeheUm: 380000, greiferUm: 9000 } as const;

/** "F" + mindestens 4 Ziffern, eins höher als die höchste vorhandene "F####"-ID; ohne Stanzformen "F0001". */
export function naechsteStanzformId(lager: Lager): string {
  let hoechste = 0;
  for (const form of lager.stanzformen ?? []) {
    const treffer = /^F(\d+)$/.exec(form.id);
    if (!treffer) {
      continue;
    }
    const zahl = Number.parseInt(treffer[1] ?? '', 10);
    if (Number.isFinite(zahl) && zahl > hoechste) {
      hoechste = zahl;
    }
  }
  return `F${String(hoechste + 1).padStart(4, '0')}`;
}

/** Hängt eine automatische ID an, wenn die Eingabe ein Objekt ist und die ID fehlt oder leer ist. */
function mitAutomatischerId(lager: Lager, eingabe: unknown): unknown {
  if (typeof eingabe !== 'object' || eingabe === null || Array.isArray(eingabe)) {
    return eingabe;
  }
  const id = (eingabe as { id?: unknown }).id;
  const passt = id !== undefined && (typeof id !== 'string' || id.trim() !== '');
  if (passt) {
    return eingabe;
  }
  return { ...(eingabe as Record<string, unknown>), id: naechsteStanzformId(lager) };
}

/** Prüft das Lager mit den neuen Stanzformen; Fehler der Stanzform an Stelle index kommen
 *  ohne das Präfix "stanzformen.<index>." zurück (z. B. "nutzen"). */
function pruefeMitStanzformen(
  lager: Lager,
  stanzformen: unknown[],
  index: number,
): PruefErgebnis<Lager> {
  const pruefung = pruefeLager({ ...lager, stanzformen });
  if (pruefung.ok) {
    return pruefung;
  }
  return {
    ok: false,
    fehler: pruefung.fehler.map((fehler): Fehler => {
      const teile = fehler.pfad.split('.');
      if (teile[0] === 'stanzformen' && teile[1] === String(index)) {
        return { pfad: teile.slice(2).join('.'), meldung: fehler.meldung };
      }
      return fehler;
    }),
  };
}

/** Hängt eine Stanzform an. Fehlt die ID oder ist sie leer → naechsteStanzformId.
 *  Doppelte ID → Fehler { pfad: 'id', meldung: 'ID doppelt: <id>' } (aus pruefeLager). */
export function stanzformHinzufuegen(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const stanzformen = [...(lager.stanzformen ?? []), mitAutomatischerId(lager, eingabe)];
  return pruefeMitStanzformen(lager, stanzformen, stanzformen.length - 1);
}

/** Ersetzt die Stanzform mit gleicher ID. Unbekannte ID → { pfad: 'id', meldung: 'Stanzform <id> nicht gefunden' }. */
export function stanzformAendern(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const roh = eingabe as { id?: unknown } | null;
  const id = typeof roh?.id === 'string' ? roh.id.trim() : '';
  const vorhandene = lager.stanzformen ?? [];
  const index = vorhandene.findIndex((form) => form.id === id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Stanzform ${id} nicht gefunden` }] };
  }
  const stanzformen: unknown[] = vorhandene.map((form, i) => (i === index ? eingabe : form));
  return pruefeMitStanzformen(lager, stanzformen, index);
}

/** Entfernt die Stanzform. Unbekannte ID → { pfad: 'id', meldung: 'Stanzform <id> nicht gefunden' }. */
export function stanzformEntfernen(lager: Lager, id: string): PruefErgebnis<Lager> {
  const vorhandene = lager.stanzformen ?? [];
  if (!vorhandene.some((form) => form.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Stanzform ${id} nicht gefunden` }] };
  }
  return { ok: true, wert: { ...lager, stanzformen: vorhandene.filter((form) => form.id !== id) } };
}

/**
 * Teilbogen aus der Herkunft: Druckbogen in Spalten × Zeilen gleich großer Teile, zwischen
 * zwei Teilen je ein Abfallstreifen. Ganze µm, abgerundet. Ohne Teilung → der Druckbogen.
 * Bleibt nichts übrig (Abfall zu groß) → null.
 */
export function teilbogenAusHerkunft(
  h: StanzHerkunft,
): { breiteUm: number; hoeheUm: number } | null {
  if (h.teilung === undefined) {
    return { breiteUm: h.druckbogen.breiteUm, hoeheUm: h.druckbogen.hoeheUm };
  }
  const t = h.teilung;
  const breiteUm = Math.floor((h.druckbogen.breiteUm - (t.spalten - 1) * t.abfallUm) / t.spalten);
  const hoeheUm = Math.floor((h.druckbogen.hoeheUm - (t.zeilen - 1) * t.abfallUm) / t.zeilen);
  if (breiteUm <= 0 || hoeheUm <= 0) {
    return null;
  }
  return { breiteUm, hoeheUm };
}

/** µm als mm-Text mit Komma: 160000 → "160", 162500 → "162,5". */
function mmText(um: number): string {
  return String(um / 1000).replace('.', ',');
}

function formatText(f: { breiteUm: number; hoeheUm: number }): string {
  return `${mmText(f.breiteUm)} × ${mmText(f.hoeheUm)} mm`;
}

/**
 * Hinweise zur Stanzform (keine Fehler), in dieser Reihenfolge:
 * - Tiegelbogen passt nicht in den Tiegel: 'Tiegelbogen passt nur gedreht in den Tiegel (260 × 380 mm)'
 *   bzw. 'Tiegelbogen passt nicht in den Tiegel (260 × 380 mm)'. Breite = Anlagekante.
 * - Tiegelbogen weicht vom Teilbogen der Herkunft ab (in keiner Lage gleich):
 *   'Tiegelbogen passt nicht zur Teilung (berechnet 160 × 225 mm)'.
 * - Weder Tiegelbogen noch Herkunft: 'Tiegelbogen nicht hinterlegt'.
 */
export function stanzformHinweise(
  form: LagerStanzform,
  tiegel: { breiteUm: number; hoeheUm: number } = STANDARD_TIEGEL,
): string[] {
  const hinweise: string[] = [];
  const tb = form.tiegelbogen;
  if (tb !== undefined && (tb.breiteUm > tiegel.breiteUm || tb.hoeheUm > tiegel.hoeheUm)) {
    const gedreht = tb.hoeheUm <= tiegel.breiteUm && tb.breiteUm <= tiegel.hoeheUm;
    hinweise.push(
      `Tiegelbogen passt ${gedreht ? 'nur gedreht' : 'nicht'} in den Tiegel (${formatText(tiegel)})`,
    );
  }
  if (tb !== undefined && form.herkunft !== undefined) {
    const teil = teilbogenAusHerkunft(form.herkunft);
    const gleich =
      teil !== null &&
      ((teil.breiteUm === tb.breiteUm && teil.hoeheUm === tb.hoeheUm) ||
        (teil.breiteUm === tb.hoeheUm && teil.hoeheUm === tb.breiteUm));
    if (!gleich) {
      hinweise.push(
        teil === null
          ? 'Tiegelbogen passt nicht zur Teilung (Abfall zu groß)'
          : `Tiegelbogen passt nicht zur Teilung (berechnet ${formatText(teil)})`,
      );
    }
  }
  if (tb === undefined && form.herkunft === undefined) {
    hinweise.push('Tiegelbogen nicht hinterlegt');
  }
  return hinweise;
}

/**
 * T185: Datei an eine Stanzform hängen. Gibt es schon einen Anhang mit diesem Titel (oder ist
 * `anhangIndex` gesetzt), wird die Datei dort als neue Fassung angehängt – alte Fassungen bleiben.
 */
export function stanzformDateiAnhaengen(
  lager: Lager,
  stanzformId: string,
  titel: string,
  fassung: unknown,
  anhangIndex?: number,
): PruefErgebnis<Lager> {
  const vorhandene = lager.stanzformen ?? [];
  const index = vorhandene.findIndex((f) => f.id === stanzformId);
  const form = vorhandene[index];
  if (form === undefined) {
    return {
      ok: false,
      fehler: [{ pfad: 'id', meldung: `Stanzform ${stanzformId} nicht gefunden` }],
    };
  }
  const anhaenge = [...(form.anhaenge ?? [])];
  const ziel =
    anhangIndex !== undefined
      ? anhangIndex
      : anhaenge.findIndex((a) => a.titel.trim().toLowerCase() === titel.trim().toLowerCase());
  const alt = anhaenge[ziel];
  if (anhangIndex !== undefined && alt === undefined) {
    return { ok: false, fehler: [{ pfad: 'anhaenge', meldung: 'Datei nicht gefunden' }] };
  }
  if (alt === undefined) anhaenge.push({ titel: titel.trim(), fassungen: [fassung] } as never);
  else anhaenge[ziel] = { ...alt, fassungen: [...alt.fassungen, fassung] } as never;
  return stanzformAendern(lager, { ...form, anhaenge });
}

/** T185: Anhang aus der Liste nehmen (die Datei selbst bleibt in der Datenbank). */
export function stanzformAnhangEntfernen(
  lager: Lager,
  stanzformId: string,
  anhangIndex: number,
): PruefErgebnis<Lager> {
  const form = (lager.stanzformen ?? []).find((f) => f.id === stanzformId);
  if (form === undefined) {
    return {
      ok: false,
      fehler: [{ pfad: 'id', meldung: `Stanzform ${stanzformId} nicht gefunden` }],
    };
  }
  const anhaenge = (form.anhaenge ?? []).filter((_, i) => i !== anhangIndex);
  const rest: Record<string, unknown> = { ...form };
  delete rest['anhaenge'];
  return stanzformAendern(lager, anhaenge.length === 0 ? rest : { ...rest, anhaenge });
}

/** T185: Alle Datei-Kennungen, auf die das Lager verweist (für Prüfung/Sicherung). */
export function stanzformDateiIds(lager: Lager): string[] {
  return [
    ...new Set(
      (lager.stanzformen ?? []).flatMap((f) =>
        (f.anhaenge ?? []).flatMap((a) => a.fassungen.map((x) => x.dateiId)),
      ),
    ),
  ];
}

/** T186: Anhang für Shop und Bots freigeben bzw. sperren. */
export function stanzformAnhangFreigeben(
  lager: Lager,
  stanzformId: string,
  anhangIndex: number,
  freigegeben: boolean,
): PruefErgebnis<Lager> {
  const form = (lager.stanzformen ?? []).find((f) => f.id === stanzformId);
  const alt = form?.anhaenge?.[anhangIndex];
  if (form === undefined || alt === undefined) {
    return { ok: false, fehler: [{ pfad: 'anhaenge', meldung: 'Datei nicht gefunden' }] };
  }
  const neu: Record<string, unknown> = { ...alt };
  if (freigegeben) neu['freigegeben'] = true;
  else delete neu['freigegeben'];
  const anhaenge = (form.anhaenge ?? []).map((a, i) => (i === anhangIndex ? neu : a));
  return stanzformAendern(lager, { ...form, anhaenge });
}
