/**
 * Darstellung eines Partner-Auftrags in druck-s: Freitext (wie ihn Door A/B vom Kunden bekommen),
 * gespeicherte Metadaten (`requests.partner_meta`, ohne signierte Datei-URL) und lesbare Zeilen
 * für die Staff-Ansicht. Rein, ohne DB.
 */
import type { PartnerRequestBody } from "./validate";

const PREFLIGHT_LABEL: Record<"ok" | "warnung" | "fehler", string> = {
  ok: "passt",
  warnung: "mit Hinweisen",
  fehler: "Probleme gefunden",
};

function deDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function mm(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export function productLine(p: PartnerRequestBody["product"]): string {
  const parts = [
    `${mm(p.widthMm)} × ${mm(p.heightMm)} mm`,
    `${mm(p.bleedMm)} mm Beschnitt`,
    p.sides === 2 ? "beidseitig" : "einseitig",
  ];
  if (p.paper) parts.push(p.paper);
  return `${p.label} – ${parts.join(", ")}`;
}

export function deliveryLine(d: PartnerRequestBody["delivery"]): string {
  return d.mode === "lieferung" ? `Lieferung an ${d.address ?? "–"}` : "Abholung";
}

/**
 * Freitext für `requests.free_text`: alle Angaben, die ein Kunde sonst ins Textfeld schreibt.
 * Die KI-Notiz und die Staff-Ansicht arbeiten damit ohne Sonderfall.
 */
export function partnerFreeText(b: PartnerRequestBody, partnerName: string): string {
  const lines: (string | null)[] = [
    `Auftrag über ${partnerName}${b.source.publication ? ` (${b.source.publication})` : ""} für ${b.customer.organisation}`,
    `Produkt: ${productLine(b.product)}`,
    `Auflage: ${b.quantity.toLocaleString("de-DE")} Stück`,
    `Wunschtermin: ${b.wishDate ? deDate(b.wishDate) : "–"}`,
    `Übergabe: ${deliveryLine(b.delivery)}`,
    b.event ? `Termin: ${b.event}` : null,
    `Kontakt: ${[b.customer.name, b.customer.email, b.customer.phone].filter(Boolean).join(", ")}`,
    `Druckvorbereitung beim Partner: ${b.preflight ? PREFLIGHT_LABEL[b.preflight] : "–"}`,
    b.printerCheck ? "Bitte Datei prüfen und bei der Kundin/dem Kunden melden." : null,
    b.note ? `Hinweis: ${b.note}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Gespeicherte Metadaten: Vertrag ohne `file.url` (signierte URL, enthält ein Token). */
export type PartnerMeta = Omit<PartnerRequestBody, "file"> & {
  file: Omit<PartnerRequestBody["file"], "url"> & { host: string };
};

export function partnerMeta(b: PartnerRequestBody): PartnerMeta {
  const { url, ...file } = b.file;
  return { ...b, file: { ...file, host: new URL(url).hostname } };
}

/** Lesbare Zeilen für die Staff-Detailansicht (robust gegen ältere/teilweise Metadaten). */
export function partnerMetaRows(meta: unknown): { label: string; value: string }[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Partial<PartnerMeta>;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim()) rows.push({ label, value: String(value) });
  };
  add("Organisation", m.customer?.organisation);
  add(
    "Kontakt",
    m.customer ? [m.customer.name, m.customer.email, m.customer.phone].filter(Boolean).join(", ") : null,
  );
  if (m.product) add("Produkt", productLine(m.product));
  if (typeof m.quantity === "number") add("Auflage", `${m.quantity.toLocaleString("de-DE")} Stück`);
  add("Wunschtermin", m.wishDate ? deDate(m.wishDate) : null);
  if (m.delivery) add("Übergabe", deliveryLine(m.delivery));
  add("Termin", m.event);
  add("Druckvorbereitung", m.preflight ? PREFLIGHT_LABEL[m.preflight] : null);
  if (m.printerCheck) add("Bitte", "Datei prüfen und melden");
  add("Hinweis", m.note);
  if (m.file) add("Datei", `${m.file.name} (${m.file.mime}, SHA-256 ${m.file.sha256?.slice(0, 12)}…)`);
  add("Publikation", m.source?.publication);
  add("Quelle", m.source?.link);
  return rows;
}
