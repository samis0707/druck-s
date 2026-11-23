import { ausZod, type PruefErgebnis } from './pruefung';
import type { Lager } from './lager-schema';
import { TagSchema } from './tag-schema';

/** Umlaute wie im Glossar: ä → ae, ö → oe, ü → ue, ß → ss. */
const UMLAUTE: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
};

/** ID aus dem Anzeigenamen ableiten: „Recycling“ → „recycling“, „Vegan & Bio“ → „vegan-bio“.
 *  Ohne Treffertext: „tag“. */
export function tagIdAusName(name: string): string {
  const umgesetzt = name.replace(/[äöüßÄÖÜ]/g, (zeichen) => UMLAUTE[zeichen] ?? zeichen);
  const id = umgesetzt
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id === '' ? 'tag' : id;
}

/**
 * Hängt einen Tag an den kontrollierten Katalog an (Startbestand: leer; es gibt keine
 * Freitext-Tags - ein Tag hat eine ID ohne Umlaute und einen Anzeigenamen). Fehlt die ID,
 * wird sie aus dem Namen abgeleitet (tagIdAusName). Prüft die Eingabe mit TagSchema und
 * lehnt eine doppelte ID ab (Fehler { pfad: 'id', meldung: 'ID doppelt: <id>' },
 * wie bei materialHinzufuegen).
 */
export function tagAnlegen(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const istObjekt = typeof eingabe === 'object' && eingabe !== null;
  const roh: Record<string, unknown> = istObjekt ? { ...(eingabe as Record<string, unknown>) } : {};
  const name = roh['name'];
  const id =
    typeof roh['id'] === 'string' && roh['id'].trim() !== ''
      ? roh['id']
      : typeof name === 'string'
        ? tagIdAusName(name)
        : undefined;
  const pruefung = ausZod(TagSchema.safeParse({ ...roh, id }));
  if (!pruefung.ok) {
    return pruefung;
  }
  const tag = pruefung.wert;
  if (lager.tags?.some((vorhanden) => vorhanden.id === tag.id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `ID doppelt: ${tag.id}` }] };
  }
  return { ok: true, wert: { ...lager, tags: [...(lager.tags ?? []), tag] } };
}
