/** Reine Logik der Vollbild-Vorschau: Items, Typ-Erkennung, URL-Varianten, Blättern. */

export type PreviewTone = "gray" | "green" | "yellow" | "red" | "blue";

/** Eine blätterbare Datei im Vollbild-Quicklook (Kundendatei, Staff-Datei, Bestätigung, Druckdatei, Rechnung). */
export interface PreviewItem {
  id: string;
  name: string;
  mimeType: string;
  /** Download-URL ohne `?inline=1`; die Anzeige hängt den Parameter selbst an. */
  src: string;
  sizeBytes?: number | string;
  /** Herkunft, z. B. „Auftragsbestätigung · Version 2“. */
  group?: string;
  badges?: { label: string; tone: PreviewTone }[];
  withheld?: boolean;
  withholdReasons?: string[];
}

function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function isPdf(mimeType: string, name: string): boolean {
  return mimeType === "application/pdf" || extensionOf(name) === "pdf";
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Bilder und PDFs zeigt der Browser selbst; alles andere bekommt Icon + Download. */
export function isPreviewable(mimeType: string, name: string): boolean {
  return isImage(mimeType) || isPdf(mimeType, name);
}

/** Hängt `inline=1` an (Anzeige statt Download), auch wenn die URL schon Parameter trägt. */
export function inlineSrc(src: string): string {
  if (/[?&]inline=1(?:&|$)/.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}inline=1`;
}

/** Nächster Index beim Blättern; bleibt an den Rändern stehen (kein Umbruch). */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), length - 1);
}

/** Position eines Items in der Liste; -1 wenn nicht enthalten. */
export function indexOfItem(items: PreviewItem[], id: string): number {
  return items.findIndex((item) => item.id === id);
}
