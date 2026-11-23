import { pruefeLager, type Lager } from './lager-schema';
import type { Material } from './material';
import {
  MaterialGruppeSchema,
  STANDARD_GRUPPEN,
  type MaterialGruppe,
} from './material-gruppe-schema';
import { ausZod, type PruefErgebnis } from './pruefung';

// ---------------------------------------------------------------------------
// Einkaufsgruppen (T70, aus den T68-Gruppen umbenannt – fachlich, nicht im Code):
// pflegbare Liste, auf die Materialien über `gruppeId` verweisen. Gibt es keine
// eigene Liste, gilt die vorbelegte. Zuordnungsempfehlungen aus Name/Oberfläche
// (T68: gruppeVorschlag, gruppenZuordnen) wurden mit T70 entfernt, denn die
// Einkaufsgruppe ist nur für die Preisanpassung da und wird im Dialog gewählt.

/** Die Gruppen des Lagers; ohne eigene Liste die vorbelegten. */
export function gruppenVon(lager: Lager): readonly MaterialGruppe[] {
  return lager.gruppen ?? STANDARD_GRUPPEN;
}

/** Nächste freie Gruppen-ID: G01, G02 … */
function naechsteGruppenId(gruppen: readonly MaterialGruppe[]): string {
  for (let n = 1; ; n++) {
    const id = `G${String(n).padStart(2, '0')}`;
    if (!gruppen.some((g) => g.id === id)) return id;
  }
}

/** Neue Gruppe (ID automatisch, wenn leer). Die Liste des Lagers entsteht dabei aus der
 *  vorbelegten, falls es noch keine eigene gibt. Name doppelt → Fehler am Feld „name“. */
export function gruppeHinzufuegen(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const gruppen = gruppenVon(lager);
  const roh = eingabe as Record<string, unknown>;
  const mitId =
    typeof roh === 'object' && roh !== null && (roh['id'] === undefined || roh['id'] === '')
      ? { ...roh, id: naechsteGruppenId(gruppen) }
      : eingabe;
  const g = ausZod(MaterialGruppeSchema.safeParse(mitId));
  if (!g.ok) return g;
  return mitGruppen(lager, [...gruppen, g.wert], gruppen.length);
}

/** Ändert Name bzw. Oberfläche der Gruppe mit gleicher ID. */
export function gruppeAendern(lager: Lager, eingabe: unknown): PruefErgebnis<Lager> {
  const g = ausZod(MaterialGruppeSchema.safeParse(eingabe));
  if (!g.ok) return g;
  const gruppen = gruppenVon(lager);
  const index = gruppen.findIndex((x) => x.id === g.wert.id);
  if (index < 0) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Gruppe ${g.wert.id} nicht gefunden` }] };
  }
  return mitGruppen(
    lager,
    gruppen.map((x, i) => (i === index ? g.wert : x)),
    index,
  );
}

/** Entfernt die Gruppe; ihre Materialien verlieren die Zuordnung (Anzahl in `geloest`). */
export function gruppeEntfernen(
  lager: Lager,
  id: string,
): PruefErgebnis<{ lager: Lager; geloest: number }> {
  const gruppen = gruppenVon(lager);
  if (!gruppen.some((g) => g.id === id)) {
    return { ok: false, fehler: [{ pfad: 'id', meldung: `Gruppe ${id} nicht gefunden` }] };
  }
  let geloest = 0;
  const materialien = lager.materialien.map((m) => {
    if (m.gruppeId !== id) return m;
    geloest++;
    const ohne: Material = { ...m };
    delete ohne.gruppeId;
    return ohne;
  });
  const r = pruefeLager({ ...lager, materialien, gruppen: gruppen.filter((g) => g.id !== id) });
  return r.ok ? { ok: true, wert: { lager: r.wert, geloest } } : r;
}

/** Lager mit neuer Gruppenliste prüfen; Fehler der Gruppe an Stelle `index` ohne Präfix. */
function mitGruppen(lager: Lager, gruppen: MaterialGruppe[], index: number): PruefErgebnis<Lager> {
  const r = pruefeLager({ ...lager, gruppen });
  if (r.ok) return r;
  const praefix = `gruppen.${index}.`;
  return {
    ok: false,
    fehler: r.fehler.map((f) =>
      f.pfad.startsWith(praefix) ? { ...f, pfad: f.pfad.slice(praefix.length) } : f,
    ),
  };
}
