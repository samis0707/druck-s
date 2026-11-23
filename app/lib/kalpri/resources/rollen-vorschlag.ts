import type { Geld } from '@druck/units';
import type { Kalkulation } from './kalkulation-schema';
import type { Material } from './material';

/**
 * Rollen-Vorschlag (T105): dieselbe Sorte (und Grammatur) in anderen Rollenbreiten aus dem
 * Lager, die in die Druckmaschine passen (Mindest- bis Höchstbreite), mit Verbrauch und Kosten.
 */
export type RollenVorschlag = {
  materialId: string;
  breiteUm: number;
  /** Nutzen nebeneinander; null, wenn der Nutzen nicht auf die Rolle passt. */
  nutzenQuer: number | null;
  gedreht: boolean;
  laufmeter: number | null;
  quadratmeter: number | null;
  genutztProzent: number | null;
  /** Papierkosten (m² × günstigster Preis je m²); null ohne Preis. */
  kosten: Geld | null;
  /** Die Rolle, mit der gerade gerechnet wird. */
  aktuell: boolean;
};

/** Rollen derselben Sorte (ohne Groß-/Kleinschreibung) und Grammatur, Breite in [min, max]. */
export function passendeRollen(
  materialien: readonly Material[],
  rolle: Material,
  minUm: number | undefined,
  maxUm: number | undefined,
): Extract<Material, { form: 'Rolle' }>[] {
  const sorte = rolle.sorte.trim().toLowerCase();
  return materialien.flatMap((m) =>
    m.form === 'Rolle' &&
    m.sorte.trim().toLowerCase() === sorte &&
    m.grammatur === rolle.grammatur &&
    (minUm === undefined || m.breiteUm >= minUm) &&
    (maxUm === undefined || m.breiteUm <= maxUm)
      ? [m]
      : [],
  );
}

/** Bester Vorschlag: günstigste Kosten; ohne Preise die wenigsten m². */
export function besterRollenVorschlag(liste: readonly RollenVorschlag[]): RollenVorschlag | null {
  const moeglich = liste.filter((v) => v.quadratmeter !== null);
  const alleMitPreis = moeglich.every((v) => v.kosten !== null);
  const sortiert = [...moeglich].sort((a, b) =>
    alleMitPreis
      ? (a.kosten?.zehntelcent ?? 0) - (b.kosten?.zehntelcent ?? 0) ||
        (a.quadratmeter ?? 0) - (b.quadratmeter ?? 0)
      : (a.quadratmeter ?? 0) - (b.quadratmeter ?? 0),
  );
  return sortiert[0] ?? null;
}

/**
 * Rolle übernehmen (T105): Teil und seine Materialzeilen (Papierweg dieses Teils, bisheriges
 * Material) auf die neue Rolle umstellen. Gibt die geänderte Kalkulation zurück.
 */
export function rolleUebernehmen(k: Kalkulation, teilId: string, materialId: string): Kalkulation {
  const teil = (k.teile ?? []).find((t) => t.id === teilId);
  if (k.teile === undefined || teil === undefined) return k;
  const alt = teil.materialId;
  return {
    ...k,
    teile: k.teile.map((t) => (t.id === teilId ? { ...t, materialId } : t)),
    zeilen: k.zeilen.map((z) =>
      z.art === 'material' &&
      z.materialId === alt &&
      z.menge.art === 'papierweg' &&
      z.menge.teilId === teilId
        ? { ...z, materialId }
        : z,
    ),
  };
}
