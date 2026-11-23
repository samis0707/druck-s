/** Client-Hilfen für die Personalisierungs-Routen: einheitliche Fehler mit verständlichem Text. */

export class ApiFehler extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiFehler";
  }
}

export const STAFF_API = "/api/personalisierung/staff";
export const KUNDE_API = "/api/personalisierung/z";

/** JSON-Aufruf; Fehlerantworten der Routen (`{ error, code, details }`) werden zu `ApiFehler`. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiFehler("Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.", 0, "netz");
  }
  if (!res.ok) {
    let body: { error?: string; code?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* kein JSON */
    }
    const fallback = res.status === 401 ? "Bitte melden Sie sich an." : res.status === 429 ? "Zu viele Anfragen. Bitte warten Sie einen Moment." : "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.";
    throw new ApiFehler(body.error || fallback, res.status, body.code ?? "fehler", body.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : "Unbekannter Fehler";
}

export async function ladeBytes(url: string, init?: RequestInit): Promise<Uint8Array> {
  const res = await fetch(url, init);
  if (!res.ok) throw new ApiFehler("Die Datei konnte nicht geladen werden.", res.status, "datei");
  return new Uint8Array(await res.arrayBuffer());
}

/** Zwischenablage mit Rückfall (ältere Browser, unsichere Kontexte). */
export async function kopiere(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function vorSekunden(zeit: number | null, jetzt = Date.now()): string {
  if (!zeit) return "";
  const s = Math.max(0, Math.round((jetzt - zeit) / 1000));
  if (s < 5) return "gerade eben";
  if (s < 60) return `vor ${s} Sekunden`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  return `vor ${Math.round(m / 60)} Std.`;
}
