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
 * („Über Seeräuber digital“), offene Anfragen „Interessent“, sonst Vertrauensstufe (verifiziert / per Link).
 */
export function originBadge(
  trust: string,
  partnerName?: string | null,
  origin?: string | null,
): { label: string; tone: "green" | "yellow" | "blue" } {
  if (partnerName) return { label: `Über ${partnerName}`, tone: "blue" };
  // Offene Anfrage: E-Mail-Adresse per Code bestätigt, aber noch kein Kundenkonto.
  if (origin === "inquiry") return { label: "Interessent", tone: "yellow" };
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
  if (s === "PENDING") return SCAN_PENDING_LABEL;
  return s;
}

/** Batch-Virenscan (CLAMAV_MODE=batch) steht noch aus — für Staff und Kunde gleich formuliert. */
export const SCAN_PENDING_LABEL = "Virenprüfung läuft";

interface SecurityLike {
  verdict: string;
  reasons: string[];
  scan?: { status: string } | null;
}

/** Sicherheitszeilen unter „Befunde“: Gründe plus „Virenprüfung läuft“, solange der Batch-Scan aussteht. */
export function securityNotes(security: SecurityLike): string[] {
  return security.scan?.status === "PENDING" ? [...security.reasons, SCAN_PENDING_LABEL] : security.reasons;
}

/**
 * Sicherheits-Badges einer Datei. Staff: Urteil (plus „Virenprüfung läuft“, wenn das Urteil wegen
 * struktureller Befunde schon „Manuell prüfen“ ist). Kunde: nur „Zurückgehalten“ oder „Virenprüfung läuft“.
 */
export function securityBadges(
  security: SecurityLike,
  audience: "customer" | "staff",
): { label: string; tone: "green" | "yellow" | "red" | "gray" }[] {
  const pending = security.scan?.status === "PENDING";
  const out: { label: string; tone: "green" | "yellow" | "red" | "gray" }[] = [];
  if (audience === "staff" || security.verdict === "INFECTED") {
    out.push({ label: severityLabel(security.verdict), tone: severityTone(security.verdict) });
  }
  if (pending && !out.some((b) => b.label === SCAN_PENDING_LABEL)) {
    out.push({ label: SCAN_PENDING_LABEL, tone: "gray" });
  }
  return out;
}
