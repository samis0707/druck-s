/** Antworten der offenen Anfrage-Schnittstelle: Erfolg als JSON, Fehler als `{ error, code, details? }`. */
import { NextResponse } from "next/server";
import { leseRumpf } from "../kalkulation/http";
import { InquiryError } from "./intake";

const NO_STORE = { "cache-control": "no-store" };

export function inquiryJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function inquiryError(status: number, code: string, message: string, details?: string[]) {
  const res = NextResponse.json(details ? { error: message, code, details } : { error: message, code }, {
    status,
    headers: NO_STORE,
  });
  if (status === 429) res.headers.set("retry-after", "3600");
  return res;
}

/** Bekannte Fehler in Antworten übersetzen; alles andere wird geloggt und als 500 gemeldet. */
export function inquiryFailure(err: unknown, where: string) {
  if (err instanceof InquiryError) return inquiryError(err.status, err.code, err.message, err.details);
  console.error(`[inquiry] ${where} fehlgeschlagen:`, err instanceof Error ? err.message : err);
  return inquiryError(500, "internal_error", "Internal error");
}

export const MAX_JSON_BYTES = 64 * 1024;

/** JSON-Körper lesen (höchstens 64 KB). Leerer Körper ergibt `{}`. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  // Grenze vor dem Puffern: Content-Length prüfen und beim Lesen mitzählen.
  const r = await leseRumpf(req, MAX_JSON_BYTES);
  if (!r.ok) return { ok: false, response: inquiryError(413, "body_too_large", "Request body exceeds 64 KB") };
  const raw = new TextDecoder().decode(r.bytes);
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, response: inquiryError(400, "invalid_json", "Invalid JSON body") };
  }
}
