/** Begrenzung des öffentlichen Richtpreises je IP-Adresse (wie bei den INQUIRY-Grenzen). */
import { appendAudit } from "../auditLog";
import { clientIp } from "../guards";
import { config } from "../config";
import { query } from "../db";

/**
 * Berechnungen (POST): gezählt über audit_log (gilt über alle Instanzen). Unbekannte IP zählt in
 * einem gemeinsamen Eimer „unknown“ – lieber zu streng als gar nicht begrenzt.
 * Ergebnis: true = erlaubt (und gezählt), false = Grenze erreicht.
 */
export async function zaehleBerechnung(req: Request): Promise<boolean> {
  const limit = config.richtpreis.perIpPerHour;
  const ip = clientIp(req);
  if (limit > 0) {
    const r = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_log
        WHERE action = 'richtpreis_requested' AND ip = $1 AND created_at > now() - interval '1 hour'`,
      [ip],
    );
    if (Number(r.rows[0]?.n ?? 0) >= limit) return false;
  }
  // keine personenbezogenen Daten außer der IP-Adresse, die für die Begrenzung nötig ist
  await appendAudit({ action: "richtpreis_requested", actorType: "system", ip, detail: {} });
  return true;
}

// Im Speicher gezählte Grenzen (billig, je Instanz): Abrufe der Artikelliste, Entwurf-Speichern u. a.
// Der Speicher ist begrenzt: abgelaufene Fenster werden regelmäßig entfernt, und bei Überlauf fliegen
// zuerst die ältesten Einträge raus (lieber ein Zähler zu früh vergessen als unbegrenztes Wachstum).
const fenster = new Map<string, { start: number; n: number }>();
const STUNDE = 3_600_000;
const MAX_EINTRAEGE = 10_000;
const AUFRAEUM_ALLE_MS = 60_000;
let letzteBereinigung = 0;

function bereinige(jetzt: number, dauer: number): void {
  if (jetzt - letzteBereinigung < AUFRAEUM_ALLE_MS && fenster.size <= MAX_EINTRAEGE) return;
  letzteBereinigung = jetzt;
  for (const [k, v] of fenster) if (jetzt - v.start >= dauer) fenster.delete(k);
  // Map behält die Einfügereihenfolge: die ältesten stehen vorn.
  for (const k of fenster.keys()) {
    if (fenster.size <= MAX_EINTRAEGE) break;
    fenster.delete(k);
  }
}

/**
 * Zählt einen Aufruf unter `schluessel` im Fenster `dauerMs` (Standard eine Stunde).
 * Ergebnis: true = erlaubt, false = Grenze überschritten. limit <= 0 = unbegrenzt.
 */
export function zaehleImSpeicher(schluessel: string, limit: number, jetzt = Date.now(), dauerMs = STUNDE): boolean {
  if (limit <= 0) return true;
  bereinige(jetzt, dauerMs);
  const f = fenster.get(schluessel);
  if (!f || jetzt - f.start >= dauerMs) {
    fenster.delete(schluessel);
    fenster.set(schluessel, { start: jetzt, n: 1 });
    return true;
  }
  f.n += 1;
  return f.n <= limit;
}

export function zaehleAbruf(req: Request, jetzt = Date.now()): boolean {
  return zaehleImSpeicher(`abruf:${clientIp(req)}`, config.richtpreis.artikelPerIpPerHour, jetzt);
}

/** Nur für Tests. */
export function abrufZaehlerLeeren(): void {
  fenster.clear();
  letzteBereinigung = 0;
}

/** Nur für Tests. */
export function speicherGroesse(): number {
  return fenster.size;
}
