/**
 * T180: Aufschläge auf Verbrauchsmaterial (Nutzer 23.11.2026: „ich möchte individuell die
 * aufschläge anpassen können, aber auch alle … auf einmal …, oder per häkchen eine auswahl …
 * generell haben wir erst mal einen aufschlag von 15 %“).
 *
 * Der Aufschlag erhöht die Kosten des Verbrauchs an Maschinen (Lager, Handling, Schwund). Reihenfolge:
 * eigener Aufschlag am Material (`aufschlagProzent`) → gewählte Aufschlag-Art (`aufschlagArtId`) →
 * Standard des Lagers (`verbrauchAufschlagProzent`) → 0.
 */
import { pruefeLager, type AufschlagArt, type Lager } from './lager-schema';
import type { Material } from './material';
import { materialArt } from './material-art';
import type { PruefErgebnis } from './pruefung';

export type AufschlagQuelle = 'material' | 'art' | 'standard' | 'keiner';

/** Wirksamer Aufschlag auf den Verbrauch eines Materials in %; bei einer Art mit ihrem Namen. */
export function verbrauchAufschlag(
  lager: Pick<Lager, 'verbrauchAufschlagProzent' | 'aufschlagArten'>,
  material: Pick<Material, 'aufschlagProzent' | 'aufschlagArtId'>,
): { prozent: number; quelle: AufschlagQuelle; name?: string } {
  if (material.aufschlagProzent !== undefined)
    return { prozent: material.aufschlagProzent, quelle: 'material' };
  const art =
    material.aufschlagArtId === undefined
      ? undefined
      : (lager.aufschlagArten ?? []).find((a) => a.id === material.aufschlagArtId);
  if (art !== undefined) return { prozent: art.prozent, quelle: 'art', name: art.name };
  if (lager.verbrauchAufschlagProzent !== undefined)
    return { prozent: lager.verbrauchAufschlagProzent, quelle: 'standard' };
  return { prozent: 0, quelle: 'keiner' };
}

/** Verbrauchsmaterialien (Form Menge oder Kategorie „sonstiges“), nach Bezeichnung. */
export function verbrauchsmaterialien(lager: Lager): Material[] {
  return lager.materialien
    .filter((m) => materialArt(m) === 'verbrauch')
    .sort((a, b) => a.sorte.localeCompare(b.sorte, 'de'));
}

const pruefeProzent = (p: number): string | null =>
  !Number.isFinite(p)
    ? 'muss eine Zahl sein'
    : p < 0
      ? 'darf nicht negativ sein'
      : p > 1000
        ? 'höchstens 1000'
        : null;

/** Standard-Aufschlag setzen (null = entfernen). */
export function standardAufschlagSetzen(
  lager: Lager,
  prozent: number | null,
): PruefErgebnis<Lager> {
  if (prozent !== null) {
    const f = pruefeProzent(prozent);
    if (f !== null)
      return { ok: false, fehler: [{ pfad: 'verbrauchAufschlagProzent', meldung: f }] };
  }
  const { verbrauchAufschlagProzent: _alt, ...rest } = lager;
  void _alt;
  return pruefeLager(prozent === null ? rest : { ...rest, verbrauchAufschlagProzent: prozent });
}

/**
 * Aufschlag für mehrere Materialien setzen. `prozent: null` = eigenen Aufschlag entfernen (dann gilt
 * der Standard). Unbekannte IDs → Fehler, nichts geändert.
 */
export function aufschlaegeSetzen(
  lager: Lager,
  aenderungen: readonly { materialId: string; prozent: number | null }[],
): PruefErgebnis<Lager> {
  const fehler: { pfad: string; meldung: string }[] = [];
  const neu = new Map(aenderungen.map((a) => [a.materialId, a.prozent]));
  for (const [id, p] of neu) {
    if (!lager.materialien.some((m) => m.id === id))
      fehler.push({ pfad: id, meldung: `Material ${id} nicht gefunden` });
    else if (p !== null) {
      const f = pruefeProzent(p);
      if (f !== null) fehler.push({ pfad: id, meldung: f });
    }
  }
  if (fehler.length > 0) return { ok: false, fehler };
  const materialien = lager.materialien.map((m) => {
    if (!neu.has(m.id)) return m;
    const p = neu.get(m.id) ?? null;
    const { aufschlagProzent: _alt, ...rest } = m;
    void _alt;
    return (p === null ? rest : { ...rest, aufschlagProzent: p }) as Material;
  });
  return pruefeLager({ ...lager, materialien });
}

/** Wahl je Material: Standard, eine Aufschlag-Art oder ein eigener Wert. */
export type AufschlagWahl =
  | { art: 'standard' }
  | { art: 'art'; artId: string }
  | { art: 'eigen'; prozent: number };

/** Aufschlag für mehrere Materialien auf einmal festlegen (Häkchen-Auswahl, „alle“). */
export function aufschlagZuweisen(
  lager: Lager,
  materialIds: readonly string[],
  wahl: AufschlagWahl,
): PruefErgebnis<Lager> {
  const ids = new Set(materialIds);
  const fehlt = [...ids].filter((id) => !lager.materialien.some((m) => m.id === id));
  if (fehlt.length > 0)
    return {
      ok: false,
      fehler: fehlt.map((id) => ({ pfad: id, meldung: `Material ${id} nicht gefunden` })),
    };
  if (wahl.art === 'eigen') {
    const f = pruefeProzent(wahl.prozent);
    if (f !== null) return { ok: false, fehler: [{ pfad: 'prozent', meldung: f }] };
  }
  if (wahl.art === 'art' && !(lager.aufschlagArten ?? []).some((a) => a.id === wahl.artId))
    return {
      ok: false,
      fehler: [{ pfad: 'artId', meldung: `Aufschlag-Art ${wahl.artId} gibt es nicht` }],
    };
  const materialien = lager.materialien.map((m) => {
    if (!ids.has(m.id)) return m;
    const { aufschlagProzent: _p, aufschlagArtId: _a, ...rest } = m;
    void _p;
    void _a;
    if (wahl.art === 'eigen') return { ...rest, aufschlagProzent: wahl.prozent } as Material;
    if (wahl.art === 'art') return { ...rest, aufschlagArtId: wahl.artId } as Material;
    return rest as Material;
  });
  return pruefeLager({ ...lager, materialien });
}

/** Nächste freie ID AA-####. */
export function naechsteAufschlagArtId(lager: Pick<Lager, 'aufschlagArten'>): string {
  let max = 0;
  for (const a of lager.aufschlagArten ?? []) max = Math.max(max, Number(a.id.slice(3)));
  return `AA-${String(max + 1).padStart(4, '0')}`;
}

/** Aufschlag-Art anlegen. */
export function aufschlagArtHinzufuegen(
  lager: Lager,
  eingabe: { name: string; prozent: number },
): PruefErgebnis<Lager> {
  const name = eingabe.name.trim();
  if ((lager.aufschlagArten ?? []).some((a) => a.name.trim().toLowerCase() === name.toLowerCase()))
    return { ok: false, fehler: [{ pfad: 'name', meldung: `„${name}“ gibt es schon` }] };
  const art: AufschlagArt = { id: naechsteAufschlagArtId(lager), name, prozent: eingabe.prozent };
  return pruefeLager({ ...lager, aufschlagArten: [...(lager.aufschlagArten ?? []), art] });
}

/** Aufschlag-Art ändern (Name, Prozent) – wirkt auf alle Materialien dieser Art. */
export function aufschlagArtAendern(
  lager: Lager,
  id: string,
  aenderung: { name?: string; prozent?: number },
): PruefErgebnis<Lager> {
  const arten = lager.aufschlagArten ?? [];
  if (!arten.some((a) => a.id === id))
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Aufschlag-Art ${id} gibt es nicht` }] };
  return pruefeLager({
    ...lager,
    aufschlagArten: arten.map((a) =>
      a.id === id
        ? {
            ...a,
            ...(aenderung.name === undefined ? {} : { name: aenderung.name.trim() }),
            ...(aenderung.prozent === undefined ? {} : { prozent: aenderung.prozent }),
          }
        : a,
    ),
  });
}

/** Aufschlag-Art entfernen; ihre Materialien fallen auf den Standard zurück. */
export function aufschlagArtEntfernen(lager: Lager, id: string): PruefErgebnis<Lager> {
  const materialien = lager.materialien.map((m) => {
    if (m.aufschlagArtId !== id) return m;
    const { aufschlagArtId: _a, ...rest } = m;
    void _a;
    return rest as Material;
  });
  return pruefeLager({
    ...lager,
    materialien,
    aufschlagArten: (lager.aufschlagArten ?? []).filter((a) => a.id !== id),
  });
}

/** Anzahl der Materialien je Aufschlag-Art. */
export function aufschlagArtVerwendung(lager: Lager, id: string): number {
  return lager.materialien.filter(
    (m) => m.aufschlagArtId === id && m.aufschlagProzent === undefined,
  ).length;
}
