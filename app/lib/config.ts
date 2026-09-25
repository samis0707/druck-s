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
  smtp: {
    host: required("SMTP_HOST", "localhost"),
    port: numberVar("SMTP_PORT", 1025),
    secure: optional("SMTP_SECURE", "false") === "true",
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
    from: optional("SMTP_FROM", "DAM <dam@example.com>"),
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
  ttl: {
    otpMinutes: numberVar("OTP_TTL_MINUTES", 10),
    sessionHours: numberVar("SESSION_TTL_HOURS", 24),
    draftMinutes: numberVar("DRAFT_TTL_MINUTES", 45),
    uploadLinkDays: numberVar("UPLOAD_LINK_TTL_DAYS", 7),
  },
};
