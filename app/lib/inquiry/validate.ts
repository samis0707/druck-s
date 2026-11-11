/**
 * Eingaben der offenen Anfrage prüfen (docs/anfrage-api.md). Alle Fehler werden gesammelt,
 * damit ein Mensch im Swagger oder ein Assistent sie in einem Zug beheben kann.
 */
import type { InquiryContact } from "../requests/types";
import { PRODUCT_HINTS } from "../ui-text";

export const PRODUCT_VALUES: string[] = PRODUCT_HINTS.map((p) => p.value);

export const INQUIRY_LIMITS = {
  description: 5000,
  reference: 300,
  name: 120,
  organisation: 160,
  phone: 40,
  email: 254,
} as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Steuerzeichen außer Zeilenumbruch und Tabulator. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface InquiryBody {
  product: string;
  description: string;
  reference: string | null;
  contact: InquiryContact | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Einzeiliger Text: getrimmt, ohne Steuerzeichen und Zeilenumbrüche. */
function line(
  value: unknown,
  field: string,
  max: number,
  errors: string[],
  required: boolean,
): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  const cleaned = value.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  if (cleaned.length > max) {
    errors.push(`${field} must be at most ${max} characters`);
    return null;
  }
  return cleaned;
}

export function validateContact(input: unknown, path = "contact"): Validated<InquiryContact> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: [`${path} must be an object`] };
  const name = line(input.name, `${path}.name`, INQUIRY_LIMITS.name, errors, true);
  const rawEmail = line(input.email, `${path}.email`, INQUIRY_LIMITS.email, errors, true);
  const email = rawEmail?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) errors.push(`${path}.email must be a valid email address`);
  const organisation = line(input.organisation, `${path}.organisation`, INQUIRY_LIMITS.organisation, errors, false);
  const phone = line(input.phone, `${path}.phone`, INQUIRY_LIMITS.phone, errors, false);
  if (phone && !/^[0-9+()/\-. ]{4,}$/.test(phone)) errors.push(`${path}.phone must be a phone number`);
  if (errors.length > 0 || !name || !email) return { ok: false, errors };
  return { ok: true, value: { name, email, organisation, phone } };
}

export function validateInquiry(input: unknown): Validated<InquiryBody> {
  if (!isRecord(input)) return { ok: false, errors: ["body must be a JSON object"] };
  const errors: string[] = [];
  let product: string | null = null;
  if (typeof input.product !== "string" || !PRODUCT_VALUES.includes(input.product)) {
    errors.push(`product must be one of: ${PRODUCT_VALUES.join(", ")}`);
  } else {
    product = input.product;
  }
  let description: string | null = null;
  if (typeof input.description !== "string" || !input.description.trim()) {
    errors.push("description is required");
  } else {
    const cleaned = input.description.replace(CONTROL, "").trim();
    if (cleaned.length > INQUIRY_LIMITS.description) {
      errors.push(`description must be at most ${INQUIRY_LIMITS.description} characters`);
    } else {
      description = cleaned;
    }
  }
  const reference = line(input.reference, "reference", INQUIRY_LIMITS.reference, errors, false);
  let contact: InquiryContact | null = null;
  if (input.contact !== undefined && input.contact !== null) {
    const parsed = validateContact(input.contact);
    if (parsed.ok) contact = parsed.value;
    else errors.push(...parsed.errors);
  }
  if (errors.length > 0 || !product || !description) return { ok: false, errors };
  return { ok: true, value: { product, description, reference, contact } };
}

/** Code aus der E-Mail: genau sechs Ziffern (Leerzeichen dazwischen werden toleriert). */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** „a•••@example.org“: genug zum Wiedererkennen, ohne die Adresse offenzulegen. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}
