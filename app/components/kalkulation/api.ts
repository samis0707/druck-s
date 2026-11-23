/** Aufrufe der Mitarbeiter-Schnittstelle der Kalkulation (nur im Browser, Sitzungs-Cookie). */
export const KALK_API = "/api/staff/kalkulation";

export type ApiAntwort<T> = { ok: true; daten: T } | { ok: false; status: number; meldung: string; details?: unknown };

export async function kalkApi<T>(pfad: string, init?: { method?: string; body?: unknown }): Promise<ApiAntwort<T>> {
  try {
    const res = await fetch(`${KALK_API}${pfad}`, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json = (await res.json().catch(() => ({}))) as { fehler?: string; error?: string; details?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        meldung: json.fehler ?? json.error ?? `Fehler ${res.status}`,
        details: json.details,
      };
    }
    return { ok: true, daten: json as T };
  } catch {
    return { ok: false, status: 0, meldung: "Keine Verbindung zum Server." };
  }
}

/** Fehlertext inklusive Einzelheiten (z. B. Prüfmeldungen), für die Anzeige. */
export function fehlerText(a: { meldung: string; details?: unknown }): string {
  const d = a.details;
  if (Array.isArray(d) && d.length > 0) {
    const teile = d.map((x) => (typeof x === "string" ? x : typeof x === "object" && x !== null && "meldung" in x ? String((x as { meldung: unknown }).meldung) : "")).filter(Boolean);
    if (teile.length > 0) return `${a.meldung}: ${teile.join("; ")}`;
  }
  return a.meldung;
}
