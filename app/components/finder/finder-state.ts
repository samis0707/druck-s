import { severityLabel, severityTone } from "@/lib/ui-text";
import type { PreviewItem } from "./preview";
import { assetRank, rollupOf, type RollupFile } from "./rollup";

export interface FinderFile extends RollupFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | string;
}

export interface FinderRequest {
  id: string;
  /** Auftragsnummer DDMMJJ-NNN (Altdaten: null). */
  number?: string | null;
  productHint: string;
  freeText: string;
  status: string;
  trust: string;
  email: string;
  fileCount: string | number;
  createdAt: string;
  files: FinderFile[];
}

export type FinderSort = "rollup" | "newest" | "oldest" | "files";

export interface FinderFilters {
  query: string;
  statuses: string[];
  trusts: string[];
  attentionOnly: boolean;
  sort: FinderSort;
}

export const LEER_FILTER: FinderFilters = {
  query: "",
  statuses: [],
  trusts: [],
  attentionOnly: false,
  sort: "newest",
};

/** Suchbare Referenzen eines Auftrags: Nummer (mit und ohne Bindestrich) und Kurz-ID. */
function referenceHaystack(r: Pick<FinderRequest, "id" | "number">): string {
  const number = r.number ?? "";
  return `${number} ${number.replace("-", "")} ${r.id.slice(0, 8)}`;
}

function matchesQuery(r: FinderRequest, q: string): boolean {
  const hay = `${referenceHaystack(r)} ${r.id} ${r.productHint} ${r.freeText} ${r.email} ${r.status}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((teil) => hay.includes(teil));
}

/** Filtert und sortiert Finder-Aufträge client-seitig (eine Wahrheit für View B und C). */
export function findeAuftraege(requests: FinderRequest[], filters: FinderFilters): FinderRequest[] {
  const gefiltert = requests.filter((r) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) return false;
    if (filters.trusts.length > 0 && !filters.trusts.includes(r.trust)) return false;
    if (filters.attentionOnly && rollupOf(r.files).rank < 2) return false;
    if (!matchesQuery(r, filters.query)) return false;
    return true;
  });
  const sortiert = [...gefiltert];
  switch (filters.sort) {
    case "rollup":
      sortiert.sort((a, b) => rollupOf(b.files).rank - rollupOf(a.files).rank);
      break;
    case "oldest":
      sortiert.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      break;
    case "files":
      sortiert.sort((a, b) => Number(b.fileCount) - Number(a.fileCount));
      break;
    default:
      sortiert.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  return sortiert;
}

export type AssetSort = "severity" | "name" | "size";

export function sortiereAssets(files: FinderFile[], sort: AssetSort): FinderFile[] {
  const kopie = [...files];
  switch (sort) {
    case "name":
      kopie.sort((a, b) => a.fileName.localeCompare(b.fileName, "de"));
      break;
    case "size":
      kopie.sort((a, b) => Number(b.sizeBytes) - Number(a.sizeBytes));
      break;
    default:
      kopie.sort((a, b) => assetRank(b) - assetRank(a));
  }
  return kopie;
}

export function formatBytes(bytes: number | string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Finder-Datei als Quicklook-Item (Staff-Download-Route des Auftrags). */
export function toPreviewItem(requestId: string, file: FinderFile): PreviewItem {
  const withheld = file.securityVerdict === "INFECTED";
  return {
    id: file.id,
    name: file.fileName,
    mimeType: file.mimeType,
    src: `/api/staff/requests/${requestId}/files/${file.id}`,
    sizeBytes: file.sizeBytes,
    group: "Kundendatei",
    badges: file.printability
      ? [{ label: severityLabel(file.printability), tone: severityTone(file.printability) }]
      : [],
    withheld,
    withholdReasons: withheld ? ["Sicherheitsprüfung: zurückgehalten"] : [],
  };
}
