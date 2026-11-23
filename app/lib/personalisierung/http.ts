/** Gemeinsame Antworten und Hilfen der Personalisierungs-Routen. Fehler: `{ error, code, details? }`. */
import { NextResponse } from "next/server";
import { clientIp, requireStaff } from "../guards";
import { PersFehler } from "./dateien";

const NO_STORE = { "cache-control": "no-store" };

export function persJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function persError(status: number, code: string, message: string, details?: unknown) {
  const res = NextResponse.json(details === undefined ? { error: message, code } : { error: message, code, details }, { status, headers: NO_STORE });
  if (status === 429) res.headers.set("retry-after", "3600");
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
  const raw = await req.text();
  if (Buffer.byteLength(raw) > max) throw new PersFehler("Die Anfrage ist zu groß.", 413, "zu_gross");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new PersFehler("Ungültiges JSON.", 400, "invalid_json");
  }
}

export function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Hochgeladene Datei aus multipart lesen, mit Größenprüfung vor dem Einlesen. */
export async function leseUpload(req: Request, feld: string, maxBytes: number): Promise<{ bytes: Uint8Array; name: string; form: FormData }> {
  let form: FormData;
  try {
    form = await req.formData();
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
