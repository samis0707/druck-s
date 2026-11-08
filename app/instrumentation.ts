/**
 * Hintergrund-Job im App-Prozess: Partner-Webhooks aus der Outbox zustellen
 * (lib/partners/webhook.ts). Mehrere Instanzen sind sicher (Zeilen werden mit SKIP LOCKED
 * reserviert). Abschalten mit PARTNER_WEBHOOK_WORKER=off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { config } = await import("./lib/config");
  if (!config.partner.webhookWorker) return;
  const { runPartnerWebhookWorker } = await import("./lib/partners/webhook");
  const everyMs = Math.max(5, config.partner.webhookIntervalSeconds) * 1000;
  const timer = setInterval(() => void runPartnerWebhookWorker(), everyMs);
  timer.unref?.();
}
