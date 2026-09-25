import { requestRef } from "@/lib/requestNumber";
import { severityLabel, severityTone } from "@/lib/ui-text";
import type { PreviewItem } from "@/components/finder/preview";

export type Audience = "customer" | "staff";

export interface DetailReport {
  printability: string;
  findings: { check: string; summary: string }[];
  uniformity?: { aspect: string; consistent: boolean; deviatingPages: { page: number; value: string }[] }[] | null;
  security: { verdict: string; reasons: string[] };
}

export interface DetailFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  report: DetailReport | null;
}

export interface DetailBundleFile {
  name: string;
  mimeType: string;
  url: string;
}

export interface DetailBundle {
  id: string;
  version: number;
  reason: string | null;
  createdAt: string;
  confirmation: DetailBundleFile;
  printFiles: DetailBundleFile[];
}

export interface DetailCustomer {
  email: string | null;
  displayName: string | null;
  firm: string | null;
}

export interface DetailShipment {
  trackingNumber: string | null;
  specialDeliveryDate: string | null;
  invoiceUrl: string;
}

/** Antwort von `GET /api/requests/[id]` (Kunde und Staff sehen dieselben Daten). */
export interface RequestDetail {
  request: {
    id: string;
    number: string | null;
    ref: string;
    status: string;
    trust: string;
    productHint: string;
    referenceText?: string | null;
    freeText: string;
    createdAt?: string;
  };
  customer: DetailCustomer;
  files: DetailFile[];
  bundles: DetailBundle[];
  shipment: DetailShipment | null;
  /** Staff: Rechnung wurde bereits angehängt, Versand steht noch aus. */
  invoicePending?: boolean;
  note: {
    bullets: { text: string; sources: { kind: string; ref: string }[] }[];
    suggestedCategory: string | null;
  } | null;
}

/** Anzeige-Referenz eines geladenen Detail-Datensatzes (Auftragsnummer, sonst Kurz-ID). */
export function detailRef(detail: Pick<RequestDetail, "request">): string {
  return detail.request.ref || requestRef(detail.request);
}

/** Kompakte Kundenzeile: Staff „Name · Firma · E-Mail“, Kunde „Firma · E-Mail“. */
export function customerLine(customer: DetailCustomer, audience: Audience): string {
  const parts = audience === "staff" ? [customer.displayName, customer.firm, customer.email] : [customer.firm, customer.email];
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

/** Bundles nach Version, neueste zuerst. */
export function bundlesNewestFirst(bundles: DetailBundle[]): DetailBundle[] {
  return [...bundles].sort((a, b) => b.version - a.version);
}

export function isWithheld(file: DetailFile): boolean {
  return file.report?.security.verdict === "INFECTED";
}

/** `2026-09-30` → `30.09.2026`; alles andere bleibt unverändert. */
export function formatIsoDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

export const previewIds = {
  file: (id: string) => `file:${id}`,
  confirmation: (version: number) => `bundle:${version}:confirmation`,
  print: (version: number, index: number) => `bundle:${version}:print-${index}`,
  invoice: "invoice",
} as const;

/**
 * Alle blätterbaren Dateien eines Auftrags in fester Reihenfolge:
 * Kundendateien, dann je Version (neueste zuerst) Auftragsbestätigung + Druckdateien, zuletzt die Rechnung.
 * `fileHref` liefert die rollenspezifische Download-URL einer Kundendatei.
 */
export function buildPreviewItems(
  detail: RequestDetail,
  audience: Audience,
  fileHref: (fileId: string) => string,
): PreviewItem[] {
  const items: PreviewItem[] = detail.files.map((f) => {
    const badges: PreviewItem["badges"] = [];
    if (f.report) badges.push({ label: severityLabel(f.report.printability), tone: severityTone(f.report.printability) });
    if (audience === "staff" && f.report) {
      badges.push({ label: severityLabel(f.report.security.verdict), tone: severityTone(f.report.security.verdict) });
    }
    return {
      id: previewIds.file(f.id),
      name: f.fileName,
      mimeType: f.mimeType,
      src: fileHref(f.id),
      sizeBytes: f.sizeBytes,
      group: "Kundendatei",
      badges,
      withheld: isWithheld(f),
      withholdReasons: isWithheld(f) ? ["Sicherheitsprüfung: zurückgehalten"] : [],
    };
  });
  for (const b of bundlesNewestFirst(detail.bundles)) {
    items.push({
      id: previewIds.confirmation(b.version),
      name: b.confirmation.name,
      mimeType: b.confirmation.mimeType,
      src: b.confirmation.url,
      group: `Auftragsbestätigung · Version ${b.version}`,
    });
    b.printFiles.forEach((p, i) =>
      items.push({
        id: previewIds.print(b.version, i),
        name: p.name,
        mimeType: p.mimeType,
        src: p.url,
        group: `Druckdatei · Version ${b.version}`,
      }),
    );
  }
  if (detail.shipment) {
    items.push({
      id: previewIds.invoice,
      name: "Rechnung.pdf",
      mimeType: "application/pdf",
      src: detail.shipment.invoiceUrl,
      group: "Rechnung",
    });
  }
  return items;
}
