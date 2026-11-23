/**
 * T166: Lieferanten in den Materialpreisen. Ein Preis nennt seinen Lieferanten als Text; über
 * Name oder „Namen in Preisen“ gehört er zu einem Partner. Preise selbst werden nicht geändert
 * (nur anhängen) – die Zuordnung steht am Partner.
 */
import type { Lager } from './lager-schema';
import { partnerZumPreisnamen, type Lieferant } from './lieferant-schema';

export type PreisLieferant = {
  /** Name, wie er in den Preisen steht (erste Schreibweise). */
  name: string;
  anzahlPreise: number;
  materialIds: string[];
  /** Neuestes „gültig ab“ dieses Lieferanten. */
  neuesterPreis: string;
  partnerId: string | null;
};

const schluessel = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Alle Lieferanten-Namen aus den Materialpreisen mit Zuordnung, nach Name sortiert. */
export function preisLieferanten(
  lager: Pick<Lager, 'preise'>,
  partner: readonly Lieferant[],
): PreisLieferant[] {
  const nach = new Map<string, PreisLieferant>();
  for (const p of lager.preise ?? []) {
    const s = schluessel(p.lieferant);
    const e = nach.get(s) ?? {
      name: p.lieferant.trim(),
      anzahlPreise: 0,
      materialIds: [],
      neuesterPreis: p.gueltigAb,
      partnerId: partnerZumPreisnamen(partner, p.lieferant)?.id ?? null,
    };
    e.anzahlPreise += 1;
    if (!e.materialIds.includes(p.materialId)) e.materialIds.push(p.materialId);
    if (p.gueltigAb > e.neuesterPreis) e.neuesterPreis = p.gueltigAb;
    nach.set(s, e);
  }
  return [...nach.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Material-IDs mit Preisen dieses Partners. */
export function materialienVonPartner(lager: Pick<Lager, 'preise'>, p: Lieferant): string[] {
  const ids: string[] = [];
  for (const preis of lager.preise ?? []) {
    if (partnerZumPreisnamen([p], preis.lieferant) && !ids.includes(preis.materialId))
      ids.push(preis.materialId);
  }
  return ids;
}

/** Tage zwischen zwei ISO-Daten (b − a). */
function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Ein Preis gilt als alt, wenn sein „gültig ab“ mehr als `monate` (Standard 12) zurückliegt. */
export function preisIstAlt(gueltigAb: string, heute: string, monate = 12): boolean {
  return tageZwischen(gueltigAb, heute) > Math.round(monate * 30.44);
}
