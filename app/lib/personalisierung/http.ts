/** Gemeinsame Antworten und Hilfen der Personalisierungs-Routen. Fehler: `{ error, code, details? }`. */
import { NextResponse } from "next/server";
import { clientIp, requireStaff } from "../guards";
import { gleicherUrsprung, leseRumpf } from "../kalkulation/http";
import { PersFehler } from "./dateien";

const NO_STORE = { "cache-control": "no-store" };

export function persJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function persError(status: number, code: string, message: string, details?: unknown) {
  const res = NextResponse.json(details === undefined ? { error: message, code } : { error: message, code, details }, { status, headers: NO_STORE });
  if (status === 429) res.headers.set("retry-after", "3600");
  if (status === 503) res.headers.set("retry-after", "5");
  return res;
}

/** Bekannte Fehler übersetzen; alles andere wird ohne Inhalte geloggt und als 500 gemeldet. */
export function persFailure(err: unknown, where: string) {
  if (err instanceof PersFehler) return persError(err.status, err.code, err.message, (err as PersFehler & { details?: unknown }).details);
  console.error(`[personalisierung] ${where} fehlgeschlagen:`, err instanceof Error ? err.name : "Fehler");
  return persError(500, "internal_error", "Interner Fehler");
}

export const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** JSON-Körper lesen (Content-Type application/json, höchstens `max` Bytes). */
export async function leseJson(req: Request, max = MAX_JSON_BYTES): Promise<unknown> {
  const typ = req.headers.get("content-type") ?? "";
  if (!typ.toLowerCase().startsWith("application/json")) throw new PersFehler("Content-Type muss application/json sein.", 400, "content_type");
  const r = await leseRumpfOderFehler(req, max);
  const raw = new TextDecoder().decode(r);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new PersFehler("Ungültiges JSON.", 400, "invalid_json");
  }
}

/** Rumpf mit Grenze VOR dem Puffern lesen (Content-Length vorab, dann Stream mit Zähler und Abbruch). */
export async function leseRumpfOderFehler(req: Request, max: number): Promise<Uint8Array> {
  const r = await leseRumpf(req, max);
  if (!r.ok) throw new PersFehler("Die Anfrage ist zu groß.", 413, "zu_gross");
  return r.bytes;
}

/** Zusätzlicher Spielraum für multipart-Begrenzer und weitere Felder neben der Datei. */
const MULTIPART_AUFSCHLAG = 256 * 1024;

export function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Hochgeladene Datei aus multipart lesen, mit Größenprüfung vor dem Einlesen. */
export async function leseUpload(req: Request, feld: string, maxBytes: number): Promise<{ bytes: Uint8Array; name: string; form: FormData }> {
  const typ = req.headers.get("content-type") ?? "";
  if (!typ.toLowerCase().startsWith("multipart/form-data")) throw new PersFehler("Erwartet wird ein Datei-Upload (multipart/form-data).", 400, "content_type");
  // Rumpf mit Grenze lesen, bevor irgendetwas geparst wird; erst dann als FormData auswerten.
  const bytes = await leseRumpfOderFehler(req, maxBytes + MULTIPART_AUFSCHLAG);
  let form: FormData;
  try {
    form = await new Response(bytes as BodyInit, { headers: { "content-type": typ } }).formData();
  } catch {
    throw new PersFehler("Erwartet wird ein Datei-Upload (multipart/form-data).", 400, "content_type");
  }
  const datei = form.get(feld);
  if (!(datei instanceof File)) throw new PersFehler(`Das Feld „${feld}“ mit der Datei fehlt.`, 400, "datei_fehlt");
  if (datei.size > maxBytes) throw new PersFehler(`Die Datei ist zu groß (höchstens ${Math.floor(maxBytes / 1024 / 1024)} MB).`, 413, "zu_gross");
  return { bytes: new Uint8Array(await datei.arrayBuffer()), name: datei.name, form };
}

/** Staff-Aufruf: Rolle serverseitig prüfen, Fehler übersetzen. */
export async function alsStaff(
  req: Request,
  where: string,
  fn: (user: { id: string; email: string }, ip: string) => Promise<Response>,
): Promise<Response> {
  // CSRF: schreibende Aufrufe nur von der eigenen Herkunft (gilt auch für multipart und Aufrufe ohne Rumpf).
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) && !gleicherUrsprung(req)) {
    return persError(403, "ursprung", "Anfrage von fremder Herkunft abgelehnt.");
  }
  const guard = await requireStaff(req);
  if ("error" in guard && guard.error) return guard.error;
  const user = "user" in guard ? guard.user : null;
  if (!user) return persError(401, "anmeldung", "Bitte melden Sie sich an.");
  try {
    return await fn(user, clientIp(req));
  } catch (e) {
    return persFailure(e, where);
  }
}
