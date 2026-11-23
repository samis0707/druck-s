import type { Quelle } from './artikel-schema';
import { effektiveDicke } from './eigenschaften';
import type { Lager } from './lager-schema';

/** Rücken eines Blocks: Seiten → Blatt (Seiten ÷ 2, aufgerundet) → Dicke. */
export type Ruecken = { seiten: number; blatt: number; dickeUm: number; um: number };

/**
 * Rücken aus Seiten und Papierdicke: Blatt = Seiten ÷ 2 aufgerundet, Rücken = Blatt × Dicke.
 * null bei Seiten ≤ 0 oder ohne Dicke – dann wird nichts angenommen (der Aufrufer meldet es).
 */
export function ruecken(seiten: number, dickeUm: number | undefined): Ruecken | null {
  if (seiten <= 0 || dickeUm === undefined || dickeUm <= 0) return null;
  const blatt = Math.ceil(seiten / 2);
  return { seiten, blatt, dickeUm, um: blatt * dickeUm };
}

/** „Rücken 1,76 mm (16 Blatt × 110 µm)“. */
export function rueckenText(r: Ruecken): string {
  const mm = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(r.um / 1000);
  return `Rücken ${mm} mm (${r.blatt} Blatt × ${r.dickeUm} µm)`;
}

/**
 * Papierdicke zum „Woraus“ eines Teils: Lagermaterial direkt, bei einer Sorte das erste Bogen-
 * material gleicher Sorte und Grammatur; Dicke gemessen, aus dem Volumen oder geschätzt
 * (effektiveDicke). undefined, wenn nichts passt.
 */
export function dickeFuer(
  q: Quelle | null,
  lager: Pick<Lager, 'materialien'> | undefined,
): number | undefined {
  if (q === null || lager === undefined) return undefined;
  const m =
    q.art === 'material'
      ? lager.materialien.find((x) => x.id === q.materialId)
      : q.art === 'sorte'
        ? lager.materialien.find(
            (x) =>
              x.form === 'Bogen' &&
              x.grammatur === q.grammatur &&
              x.sorte.trim().toLowerCase() === q.sorte.trim().toLowerCase(),
          )
        : undefined;
  return m ? effektiveDicke(m)?.um : undefined;
}
