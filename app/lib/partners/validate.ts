/**
 * Prüfung des Partner-Auftrags (`POST /api/partner/requests`). Handgeschrieben wie die übrigen
 * Route-Handler des Projekts (kein Schema-Validator im Stack). Vertrag: Seeräuber digital,
 * `src/lib/druck/druck-s.ts` (`PartnerAuftrag`), dokumentiert in docs/partner-api.md.
 */
import { MAX_FILE_BYTES } from "../limits";
import { PRODUCT_HINTS } from "../ui-text";

export interface PartnerRequestBody {
  partnerRef: string;
  customer: { email: string; name: string; organisation: string; phone: string | null };
  product: {
    hint: string;
    label: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    sides: 1 | 2;
    paper: string | null;
  };
  quantity: number;
  wishDate: string | null;
  delivery: { mode: "abholung" | "lieferung"; address: string | null };
  note: string | null;
  event: string | null;
  printerCheck: boolean;
  preflight: "ok" | "warnung" | "fehler" | null;
  file: { url: string; name: string; mime: string; size: number; sha256: string };
  source: { system: string; publication: string | null; link: string | null };
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]{2,}$/;
const PARTNER_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MIME = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const HINTS = new Set(PRODUCT_HINTS.map((h) => h.value));
const CONTROL = /[\u0000-\u001f\u007f]/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Gültiges Kalenderdatum `YYYY-MM-DD`. */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Dateiname ohne Pfadanteile und Steuerzeichen (landet im S3-Key und in der Staff-Ansicht). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned.slice(0, 200) : "partner-datei";
}

class Collector {
  errors: string[] = [];
  fail(msg: string) {
    this.errors.push(msg);
  }
  /** Pflicht-Text (getrimmt, nicht leer, max. Länge, keine Steuerzeichen außer bei `multiline`). */
  text(v: unknown, field: string, max: number, multiline = false): string {
    if (typeof v !== "string" || !v.trim()) {
      this.fail(`${field} is required`);
      return "";
    }
    return this.checkText(v.trim(), field, max, multiline);
  }
  /** Optionaler Text: null/undefined/"" → null. */
  optText(v: unknown, field: string, max: number, multiline = false): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") {
      this.fail(`${field} must be a string or null`);
      return null;
    }
    const t = v.trim();
    return t ? this.checkText(t, field, max, multiline) : null;
  }
  private checkText(t: string, field: string, max: number, multiline: boolean): string {
    if (t.length > max) this.fail(`${field} is longer than ${max} characters`);
    const probe = multiline ? t.replace(/[\r\n\t]/g, " ") : t;
    if (CONTROL.test(probe)) this.fail(`${field} contains control characters`);
    return t;
  }
  num(v: unknown, field: string, min: number, max: number, integer = false): number {
    if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v)) || v < min || v > max) {
      this.fail(`${field} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`);
      return 0;
    }
    return v;
  }
  oneOf<T extends string>(v: unknown, field: string, values: readonly T[]): T {
    if (typeof v !== "string" || !(values as readonly string[]).includes(v)) {
      this.fail(`${field} must be one of ${values.join(", ")}`);
      return values[0];
    }
    return v as T;
  }
  obj(v: unknown, field: string): Record<string, unknown> {
    if (!isObject(v)) {
      this.fail(`${field} must be an object`);
      return {};
    }
    return v;
  }
}

export function validatePartnerRequest(input: unknown): Validation<PartnerRequestBody> {
  const c = new Collector();
  if (!isObject(input)) return { ok: false, errors: ["body must be a JSON object"] };

  const partnerRef = typeof input.partnerRef === "string" ? input.partnerRef.trim() : "";
  if (!PARTNER_REF.test(partnerRef)) {
    c.fail("partnerRef is required (1-120 characters: letters, digits, . _ : -)");
  }

  const cu = c.obj(input.customer, "customer");
  const email = c.text(cu.email, "customer.email", 254).toLowerCase();
  if (email && !EMAIL.test(email)) c.fail("customer.email is not a valid email address");
  const customer = {
    email,
    name: c.text(cu.name, "customer.name", 200),
    organisation: c.text(cu.organisation, "customer.organisation", 200),
    phone: c.optText(cu.phone, "customer.phone", 60),
  };

  const p = c.obj(input.product, "product");
  const hint = typeof p.hint === "string" ? p.hint : "";
  if (!HINTS.has(hint)) c.fail(`product.hint must be one of ${[...HINTS].join(", ")}`);
  let sides: 1 | 2 = 1;
  if (p.sides === 1 || p.sides === 2) sides = p.sides;
  else c.fail("product.sides must be 1 or 2");
  const product = {
    hint,
    label: c.text(p.label, "product.label", 200),
    widthMm: c.num(p.widthMm, "product.widthMm", 1, 10000),
    heightMm: c.num(p.heightMm, "product.heightMm", 1, 10000),
    bleedMm: c.num(p.bleedMm, "product.bleedMm", 0, 50),
    sides,
    paper: c.optText(p.paper, "product.paper", 200),
  };

  const quantity = c.num(input.quantity, "quantity", 1, 1_000_000, true);

  let wishDate: string | null = null;
  if (input.wishDate !== null && input.wishDate !== undefined) {
    if (typeof input.wishDate === "string" && isIsoDate(input.wishDate)) wishDate = input.wishDate;
    else c.fail("wishDate must be YYYY-MM-DD or null");
  }

  const d = c.obj(input.delivery, "delivery");
  const mode = c.oneOf(d.mode, "delivery.mode", ["abholung", "lieferung"] as const);
  const delivery = {
    mode,
    address: mode === "lieferung" ? c.text(d.address, "delivery.address", 500, true) : null,
  };

  const note = c.optText(input.note, "note", 4000, true);
  const event = c.optText(input.event, "event", 500, true);
  let printerCheck = false;
  if (input.printerCheck === undefined || typeof input.printerCheck === "boolean") {
    printerCheck = input.printerCheck === true;
  } else c.fail("printerCheck must be a boolean");
  let preflight: PartnerRequestBody["preflight"] = null;
  if (input.preflight !== null && input.preflight !== undefined) {
    preflight = c.oneOf(input.preflight, "preflight", ["ok", "warnung", "fehler"] as const);
  }

  const f = c.obj(input.file, "file");
  const url = c.text(f.url, "file.url", 4096);
  if (url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      c.fail("file.url is not a valid URL");
    }
    if (parsed && parsed.protocol !== "https:") c.fail("file.url must use https");
    if (parsed && (parsed.username || parsed.password)) c.fail("file.url must not contain credentials");
  }
  const rawName = c.text(f.name, "file.name", 255);
  const mime = c.text(f.mime, "file.mime", 200).toLowerCase();
  if (mime && !MIME.test(mime)) c.fail("file.mime is not a valid MIME type");
  const sha256 = typeof f.sha256 === "string" ? f.sha256.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(sha256)) c.fail("file.sha256 must be 64 hex characters");
  const file = {
    url,
    name: rawName ? safeFileName(rawName) : "",
    mime,
    size: c.num(f.size, "file.size", 1, MAX_FILE_BYTES, true),
    sha256,
  };

  const s = c.obj(input.source, "source");
  const source = {
    system: c.text(s.system, "source.system", 100),
    publication: c.optText(s.publication, "source.publication", 200),
    link: c.optText(s.link, "source.link", 2000),
  };

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return {
    ok: true,
    value: {
      partnerRef,
      customer,
      product,
      quantity,
      wishDate,
      delivery,
      note,
      event,
      printerCheck,
      preflight,
      file,
      source,
    },
  };
}
