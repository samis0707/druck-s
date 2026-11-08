function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function numberVar(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Env var ${name} must be a number`);
  return parsed;
}

export type MailTransportName = "brevo" | "smtp";

/**
 * MAIL_TRANSPORT=brevo|smtp. Ohne Angabe: brevo, sobald BREVO_API_KEY gesetzt ist, sonst smtp
 * (Mailpit lokal/in Tests). Reine Funktion, damit die Auswahl ohne Modul-Neuladen testbar ist.
 */
export function resolveMailTransport(env: Record<string, string | undefined> = process.env): MailTransportName {
  const raw = (env.MAIL_TRANSPORT ?? "").trim().toLowerCase();
  if (raw === "brevo" || raw === "smtp") return raw;
  if (raw !== "") throw new Error(`Env var MAIL_TRANSPORT must be "brevo" or "smtp" (got "${raw}")`);
  return (env.BREVO_API_KEY ?? "").trim() !== "" ? "brevo" : "smtp";
}

function optionalMb(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Env var ${name} must be a positive number`);
  return Math.floor(parsed * 1024 * 1024);
}

export const config = {
  appBaseUrl: optional("APP_BASE_URL", "http://localhost:3000"),
  firmInbox: optional("FIRM_INBOX", "print@example.com"),
  auth: {
    secret: required("BETTER_AUTH_SECRET", "dev-secret-change-in-prod"),
    url: optional("BETTER_AUTH_URL", optional("APP_BASE_URL", "http://localhost:3000")),
    trustedProxies: optional("BETTER_AUTH_TRUSTED_PROXIES", "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  },
  databaseUrl: required("DATABASE_URL", "postgres://dam:dam@localhost:5432/dam"),
  s3: {
    endpoint: required("S3_ENDPOINT", "http://localhost:9000"),
    region: optional("S3_REGION", "us-east-1"),
    bucket: optional("S3_BUCKET", "dam"),
    accessKey: optional("S3_ACCESS_KEY", "minioadmin"),
    secretKey: optional("S3_SECRET_KEY", "minioadmin"),
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  },
  mail: {
    transport: resolveMailTransport(),
    /** Absender „Name <adresse>“; fällt auf SMTP_FROM zurück (bisherige Konfiguration). */
    from: optional("MAIL_FROM") || optional("SMTP_FROM") || "DAM <dam@example.com>",
    /** Optionale Antwortadresse für alle ausgehenden Mails (leer = Antworten gehen an den Absender). */
    replyTo: optional("MAIL_REPLY_TO"),
    brevo: {
      apiKey: optional("BREVO_API_KEY").trim(),
      apiBase: optional("BREVO_API_BASE", "https://api.brevo.com/v3"),
    },
    /** Überschreibt die Anhang-Grenzen des Transports (MB; leer = Standard des Transports). */
    maxAttachmentsTotalBytes: optionalMb("MAIL_MAX_ATTACHMENTS_MB"),
    maxAttachmentBytes: optionalMb("MAIL_MAX_ATTACHMENT_MB"),
  },
  /** Nur für MAIL_TRANSPORT=smtp (lokal: Mailpit). */
  smtp: {
    // Leer gesetzt (z. B. auf Railway mit Brevo) zählt wie nicht gesetzt.
    host: optional("SMTP_HOST") || "localhost",
    port: numberVar("SMTP_PORT", 1025),
    secure: optional("SMTP_SECURE", "false") === "true",
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
  },
  mistral: {
    baseUrl: optional("MISTRAL_API_BASE", "https://api.eu.mistral.ai/v1"),
    apiKey: optional("MISTRAL_API_KEY"),
    model: optional("MISTRAL_MODEL", "mistral-medium-3.5"),
  },
  clamav: {
    host: optional("CLAMAV_HOST", "localhost"),
    port: numberVar("CLAMAV_PORT", 3310),
  },
  partner: {
    /** Neue Partner-Aufträge je Partner und Stunde (0 = unbegrenzt). */
    rateLimitPerHour: numberVar("PARTNER_RATE_LIMIT_PER_HOUR", 120),
    /** Zeitlimit für das Laden der Partner-Datei (unter dem 60-s-Timeout des Seeräuber-Clients halten). */
    fileTimeoutSeconds: numberVar("PARTNER_FILE_TIMEOUT_SECONDS", 45),
    /** Webhook-Worker im App-Prozess (instrumentation.ts); "off" schaltet ihn ab. */
    webhookWorker: optional("PARTNER_WEBHOOK_WORKER", "on") !== "off",
    webhookIntervalSeconds: numberVar("PARTNER_WEBHOOK_INTERVAL_SECONDS", 15),
  },
  ttl: {
    otpMinutes: numberVar("OTP_TTL_MINUTES", 10),
    sessionHours: numberVar("SESSION_TTL_HOURS", 24),
    draftMinutes: numberVar("DRAFT_TTL_MINUTES", 45),
    uploadLinkDays: numberVar("UPLOAD_LINK_TTL_DAYS", 7),
  },
};
