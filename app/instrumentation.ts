/**
 * Hintergrund-Job im App-Prozess: Partner-Webhooks aus der Outbox zustellen
 * (lib/partners/webhook.ts). Mehrere Instanzen sind sicher (Zeilen werden mit SKIP LOCKED
 * reserviert). Abschalten mit PARTNER_WEBHOOK_WORKER=off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { config } = await import("./lib/config");
  // Vorschau-Umgebung (docs/vorschau.md): Beispieldaten anlegen; im Hintergrund, Fehler werden nur geloggt.
  if (config.preview.active) {
    void import("./lib/vorschau/seed").then((m) => m.seedVorschau()).catch((err) => console.error("[vorschau] Seed abgebrochen:", err));
  }
  // Aufräumen alle 10 Minuten, unabhängig vom Webhook-Worker: abgebrochene Gast-Anfragen (DRAFT, nach
  // DRAFT_TTL_MINUTES) samt Kontaktdaten und Dateien, abgelaufene Personalisierungs-Entwürfe (Personendaten),
  // Aufbewahrungsfristen der Druckdaten und Anonymisierung der IP-/E-Mail-Angaben im Audit-Log.
  const { laufeSweeps } = await import("./lib/aufbewahrung");
  const sweepTimer = setInterval(() => void laufeSweeps(), 10 * 60 * 1000);
  sweepTimer.unref?.();
  setTimeout(() => void laufeSweeps(), 30 * 1000).unref?.();
  if (!config.partner.webhookWorker) return;
  const { runPartnerWebhookWorker } = await import("./lib/partners/webhook");
  const everyMs = Math.max(5, config.partner.webhookIntervalSeconds) * 1000;
  const timer = setInterval(() => void runPartnerWebhookWorker(), everyMs);
  timer.unref?.();
}
