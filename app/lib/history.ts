/** Per-customer MIS history bundle: raw XML kept, deterministic derivations read by the note. */

export interface HistoryImport {
  id: string;
  identityId: string;
  rawKey: string;
  derivedKeys: string[];
  importedAt: string;
  orderCount: number;
}

export interface HistoryOrder {
  id: string;
  date: string;
  product: string;
  quantity: number | null;
  attributes: Record<string, string>;
}
