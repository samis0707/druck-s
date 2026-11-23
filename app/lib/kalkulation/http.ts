/** Gemeinsame HTTP-Helfer der Kalkulations-Routen (Antworten, Rumpf lesen, Ursprungsprüfung). */
import { NextResponse } from "next/server";
import { config } from "../config";

const KOPF = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export function kalkJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...KOPF, ...extra } });
}

export const RUMPF_MAX = 64 * 1024;
export const RUMPF_MAX_WERKBANK = 32 * 1024 * 1024;

/** Rumpf höchstens `max` Bytes lesen (Content-Length vorab, dann beim Lesen mitzählen). */
export async function leseRumpf(
  req: Request,
  max: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: 413 }> {
  const laenge = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(laenge) && laenge > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  const teile: Uint8Array[] = [];
  let summe = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    summe += value.byteLength;
    if (summe > max) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413 };
    }
    teile.push(value);
  }
  const bytes = new Uint8Array(summe);
  let pos = 0;
  for (const t of teile) {
    bytes.set(t, pos);
    pos += t.byteLength;
  }
  return { ok: true, bytes };
}

/** JSON-Rumpf lesen. Leer = undefined. */
export async function leseJson(
  req: Request,
  max = RUMPF_MAX,
): Promise<{ ok: true; wert: unknown } | { ok: false; status: number; meldung: string }> {
  const r = await leseRumpf(req, max);
  if (!r.ok) return { ok: false, status: 413, meldung: "Anfrage zu groß" };
  if (r.bytes.byteLength === 0) return { ok: true, wert: undefined };
  try {
    return { ok: true, wert: JSON.parse(new TextDecoder().decode(r.bytes)) };
  } catch {
    return { ok: false, status: 400, meldung: "Rumpf ist kein gültiges JSON" };
  }
}

/**
 * CSRF-Schutz für schreibende Mitarbeiter-Routen (Cookie-Sitzung): Browser senden bei
 * Cross-Site-Anfragen einen Origin-Header, der zur eigenen Adresse passen muss. Ohne Origin
 * (Skripte, gleiche Herkunft bei GET) wird Sec-Fetch-Site geprüft, sonst durchgelassen.
 */
export function gleicherUrsprung(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const erlaubt = new Set<string>();
    for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) {
      if (h) erlaubt.add(h.split(",")[0].trim());
    }
    try {
      erlaubt.add(new URL(config.appBaseUrl).host);
    } catch {
      /* APP_BASE_URL ungültig: nur Host-Header zählt */
    }
    return erlaubt.has(host);
  }
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
