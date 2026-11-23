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

// Abrufe der Artikelliste: im Speicher gezählt (billig, je Instanz; die Liste ist öffentlich).
const fenster = new Map<string, { start: number; n: number }>();
const STUNDE = 3_600_000;

export function zaehleAbruf(req: Request, jetzt = Date.now()): boolean {
  const limit = config.richtpreis.artikelPerIpPerHour;
  if (limit <= 0) return true;
  const ip = clientIp(req);
  const f = fenster.get(ip);
  if (!f || jetzt - f.start >= STUNDE) {
    if (fenster.size > 10_000) for (const [k, v] of fenster) if (jetzt - v.start >= STUNDE) fenster.delete(k);
    fenster.set(ip, { start: jetzt, n: 1 });
    return true;
  }
  f.n += 1;
  return f.n <= limit;
}

/** Nur für Tests. */
export function abrufZaehlerLeeren(): void {
  fenster.clear();
}
