/** Gemeinsames UI-Vokabular: gleiche Status, Kunden- vs. Staff-Wording (deutsch). */

export const CUSTOMER_STATUS: Record<string, string> = {
  DRAFT: "Entwurf",
  RECEIVED: "Eingegangen — wir prüfen es in Kürze",
  IN_REVIEW: "In Prüfung",
  WAITING_APPROVAL: "Wartet auf Ihre Freigabe",
  IN_PROGRESS: "In Produktion",
  SHIPPED: "Versendet",
  WITHDRAWN: "Zurückgezogen",
};

export const STAFF_STATUS: Record<string, string> = {
  DRAFT: "Entwurf",
  RECEIVED: "Eingegangen",
  IN_REVIEW: "In Prüfung",
  WAITING_APPROVAL: "Wartet auf Freigabe",
  IN_PROGRESS: "In Produktion",
  SHIPPED: "Versendet",
  WITHDRAWN: "Zurückgezogen",
};

export const STATUS_TONE: Record<string, "gray" | "blue" | "yellow" | "green"> = {
  DRAFT: "gray",
  RECEIVED: "blue",
  IN_REVIEW: "blue",
  WAITING_APPROVAL: "yellow",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  WITHDRAWN: "gray",
};

/**
 * Herkunfts-Badge im Staff-Bereich: Partner-Aufträge zeigen den Partnernamen
 * („Über Seeräuber digital“), sonst Vertrauensstufe (verifiziert / per Link).
 */
export function originBadge(
  trust: string,
  partnerName?: string | null,
): { label: string; tone: "green" | "yellow" | "blue" } {
  if (partnerName) return { label: `Über ${partnerName}`, tone: "blue" };
  return trust === "VERIFIED" ? { label: "Verifiziert", tone: "green" } : { label: "Per Link", tone: "yellow" };
}

export const PRODUCT_HINTS = [
  { value: "name-tag", label: "Namensschild" },
  { value: "flyer", label: "Flyer" },
  { value: "brochure", label: "Broschüre" },
  { value: "poster", label: "Poster" },
  { value: "business-card", label: "Visitenkarte" },
  { value: "letterhead", label: "Briefpapier" },
  { value: "sticker", label: "Aufkleber" },
  { value: "banner", label: "Banner" },
  { value: "campaign", label: "Kampagne (gemischt)" },
  { value: "other", label: "Sonstiges (unten beschreiben)" },
];

/** Slug → deutsches Label; unbekannte Werte fallen auf den Rohwert zurück. */
export function productLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PRODUCT_HINTS.find((h) => h.value === value)?.label ?? value;
}

export function severityTone(s: string): "green" | "yellow" | "red" | "gray" {
  if (s === "green" || s === "CLEAN") return "green";
  if (s === "yellow" || s === "SUSPICIOUS") return "yellow";
  if (s === "red" || s === "INFECTED") return "red";
  return "gray";
}

export function severityLabel(s: string): string {
  if (s === "green") return "OK";
  if (s === "yellow") return "Bitte prüfen";
  if (s === "red") return "Problem";
  if (s === "CLEAN") return "Sauber";
  if (s === "SUSPICIOUS") return "Manuell prüfen";
  if (s === "INFECTED") return "Zurückgehalten";
  return s;
}
