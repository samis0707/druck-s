import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUser } from "./auth";

/** Partner für die Server-zu-Server-Schnittstelle (Migration 007, docs/partner-api.md). */
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    keyRotatedAt: timestamp("key_rotated_at", { withTimezone: true }),
    webhookUrl: text("webhook_url"),
    webhookSecretEnc: text("webhook_secret_enc"),
    fileHosts: text("file_hosts").array().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("partners_key_prefix_idx").on(t.keyPrefix)],
);

/**
 * App tables. Identity lives on the Better Auth user (role/status/firm);
 * requests and links reference it. The old hand-rolled identities/staff/
 * sessions/otp_challenges tables are gone (migration 003).
 */
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").unique(),
    customerId: text("customer_id").references(() => authUser.id),
    prospectEmail: text("prospect_email"),
    trust: text("trust").notNull(),
    origin: text("origin").notNull(),
    linkId: uuid("link_id"),
    productHint: text("product_hint").notNull(),
    referenceText: text("reference_text"),
    freeText: text("free_text").notNull().default(""),
    status: text("status").notNull().default("DRAFT"),
    partnerId: uuid("partner_id").references(() => partners.id),
    partnerRef: text("partner_ref"),
    partnerMeta: jsonb("partner_meta"),
    /** Offene Anfrage: Kontakt vor der Bestätigung ({ name, email, organisation, phone }). */
    inquiryContact: jsonb("inquiry_contact"),
    /** Offene Anfrage: Richtpreis-Angaben ({ artikel, antworten, auflagen }) bis zur Bestätigung. */
    inquiryQuote: jsonb("inquiry_quote"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("requests_trust_check", sql`${t.trust} IN ('VERIFIED','VOUCHED')`),
    check("requests_origin_check", sql`${t.origin} IN ('door_a','door_b','partner','inquiry')`),
    index("requests_status_idx").on(t.status),
    index("requests_customer_idx").on(t.customerId),
    uniqueIndex("requests_partner_ref_unique")
      .on(t.partnerId, t.partnerRef)
      .where(sql`${t.partnerId} IS NOT NULL`),
  ],
);

export const requestEvents = pgTable(
  "request_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    actorType: text("actor_type"),
    actorId: text("actor_id"),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId)],
);

export const requestFiles = pgTable(
  "request_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("request_files_request_idx").on(t.requestId)],
);

export const analysisReports = pgTable(
  "analysis_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .unique()
      .references(() => requestFiles.id, { onDelete: "cascade" }),
    printability: text("printability").notNull(),
    findings: jsonb("findings").notNull().default([]),
    uniformity: jsonb("uniformity"),
    /** SecurityFinding (lib/analysis.ts) inkl. `scan` (Status der Virenprüfung, Batch-Zähler). */
    security: jsonb("security").notNull().default({}),
    measuredAt: timestamp("measured_at").notNull().defaultNow(),
  },
  // Warteschlange des Batch-Virenscans (Migration 008, scripts/scan-pending.mjs).
  (t) => [
    index("analysis_reports_scan_pending_idx")
      .on(t.measuredAt)
      .where(sql`(${t.security} -> 'scan' ->> 'status') = 'PENDING'`),
  ],
);

export const confirmationBundles = pgTable("confirmation_bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  version: bigint("version", { mode: "number" }).notNull(),
  confirmationKey: text("confirmation_key").notNull(),
  printFileKeys: text("print_file_keys").array().notNull().default([]),
  reason: text("reason"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  invoiceKey: text("invoice_key").notNull(),
  trackingNumber: text("tracking_number"),
  specialDeliveryDate: date("special_delivery_date"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const assistantNotes = pgTable("assistant_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  bundleVersion: bigint("bundle_version", { mode: "number" }),
  inputHash: text("input_hash").notNull(),
  bullets: jsonb("bullets").notNull().default([]),
  historyState: text("history_state").notNull(),
  suggestedCategory: text("suggested_category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const historyImports = pgTable("history_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityId: text("identity_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  rawKey: text("raw_key").notNull(),
  derivedKeys: text("derived_keys").array().notNull().default([]),
  importedAt: timestamp("imported_at").notNull().defaultNow(),
  orderCount: bigint("order_count", { mode: "number" }).notNull().default(0),
});

export const uploadLinks = pgTable("upload_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityId: text("identity_id")
    .notNull()
    .references(() => authUser.id),
  tokenHash: text("token_hash").notNull().unique(),
  state: text("state").notNull().default("active"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  consumedByRequestId: uuid("consumed_by_request_id"),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    action: text("action").notNull(),
    actorType: text("actor_type"),
    actorId: text("actor_id"),
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_request_idx").on(t.requestId)],
);

export const requestNumberCounters = pgTable("request_number_counters", {
  day: date("day").primaryKey(),
  lastSeq: integer("last_seq").notNull().default(0),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const appSettingsHistory = pgTable(
  "app_settings_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("app_settings_history_key_idx").on(t.key, t.id)],
);

/** Status-Webhooks an Partner (Outbox, Zustellung mit Retry in lib/partners/webhook.ts). */
export const partnerWebhookOutbox = pgTable(
  "partner_webhook_outbox",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("partner_webhook_outbox_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.deliveredAt} IS NULL AND ${t.failedAt} IS NULL`),
    index("partner_webhook_outbox_request_idx").on(t.requestId, t.id),
  ],
);

// ---------------------------------------------------------------------------
// Kalkulation (Migration 010, openspec/changes/kalkulation-richtpreis)

/** Aktueller Stand je Datenbereich der kalpri-Werkbank (Text, Version = optimistische Sperre). */
export const kalkulationBereiche = pgTable("kalkulation_bereiche", {
  schluessel: text("schluessel").primaryKey(),
  json: text("json").notNull(),
  version: integer("version").notNull(),
  geaendertAm: timestamp("geaendert_am", { withTimezone: true }).notNull().defaultNow(),
  geaendertVon: text("geaendert_von").notNull(),
});

/** Nur anhängend (Trigger verbietet UPDATE/DELETE). */
export const kalkulationVerlauf = pgTable(
  "kalkulation_verlauf",
  {
    nr: bigint("nr", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    schluessel: text("schluessel").notNull(),
    version: integer("version").notNull(),
    json: text("json").notNull(),
    zeit: timestamp("zeit", { withTimezone: true }).notNull().defaultNow(),
    von: text("von").notNull(),
    anlass: text("anlass").notNull(),
  },
  (t) => [index("kalkulation_verlauf_schluessel_idx").on(t.schluessel, t.version)],
);

/** Metadaten der Stammdaten-Dateien; der Inhalt liegt im S3-Speicher (speicher_key). */
export const kalkulationDateien = pgTable("kalkulation_dateien", {
  id: text("id").primaryKey(),
  groesse: bigint("groesse", { mode: "number" }).notNull(),
  typ: text("typ").notNull(),
  name: text("name").notNull(),
  speicherKey: text("speicher_key").notNull(),
  angelegtAm: timestamp("angelegt_am", { withTimezone: true }).notNull().defaultNow(),
  von: text("von").notNull(),
});

/** API-Schlüssel für Maschinenzugriff (nur Hash + Präfix, Scope). */
export const kalkulationApiKeys = pgTable(
  "kalkulation_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: text("scopes").array().notNull().default(["kalkulation"]),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("kalkulation_api_keys_prefix_idx").on(t.keyPrefix)],
);

/** Richtpreis-Snapshot zu einer Anfrage (Eingaben, Ergebnis, damalige Einstellungen). */
export const requestQuotes = pgTable(
  "request_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    artikelId: text("artikel_id").notNull(),
    antworten: jsonb("antworten").notNull().default({}),
    auflagen: integer("auflagen").array().notNull(),
    ergebnis: jsonb("ergebnis").notNull(),
    preisEinstellungen: jsonb("preis_einstellungen").notNull(),
    kalpriHerkunft: jsonb("kalpri_herkunft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_quotes_request_idx").on(t.requestId, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Personalisierung (Migration 011, lib/personalisierung, openspec/changes/personalisierung)

export const persFiles = pgTable("pers_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  pages: integer("pages"),
  widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
  heightMm: numeric("height_mm", { precision: 8, scale: 2 }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  importSource: text("import_source").unique(),
  scanStatus: text("scan_status").notNull().default("CLEAN"),
  scanAttempts: integer("scan_attempts").notNull().default(0),
  scanDetail: text("scan_detail"),
});

export const persFonts = pgTable(
  "pers_fonts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    family: text("family").notNull(),
    style: text("style").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    importSource: text("import_source").unique(),
    scanStatus: text("scan_status").notNull().default("CLEAN"),
    scanAttempts: integer("scan_attempts").notNull().default(0),
    scanDetail: text("scan_detail"),
  },
  (t) => [uniqueIndex("pers_fonts_family_style_key").on(t.family, t.style)],
);

export const persColors = pgTable("pers_colors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  c: numeric("c", { precision: 5, scale: 2 }).notNull(),
  m: numeric("m", { precision: 5, scale: 2 }).notNull(),
  y: numeric("y", { precision: 5, scale: 2 }).notNull(),
  k: numeric("k", { precision: 5, scale: 2 }).notNull(),
  spotName: text("spot_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  importSource: text("import_source").unique(),
});

export const persTemplates = pgTable("pers_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("entwurf"),
  visibility: text("visibility").notNull().default("mitarbeiter"),
  currentVersion: integer("current_version").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  importSource: text("import_source").unique(),
  workingSpec: jsonb("working_spec"),
  workingUpdatedAt: timestamp("working_updated_at", { withTimezone: true }),
});

export const persTemplateVersions = pgTable(
  "pers_template_versions",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => persTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    spec: jsonb("spec").notNull(),
    colors: jsonb("colors").notNull().default([]),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pers_template_versions_pk").on(t.templateId, t.version)],
);

export const persTemplateCustomers = pgTable(
  "pers_template_customers",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => persTemplates.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pers_template_customers_pk").on(t.templateId, t.customerId)],
);

export const persAccessLinks = pgTable("pers_access_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => persTemplates.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const persDrafts = pgTable(
  "pers_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    linkId: uuid("link_id").references(() => persAccessLinks.id, { onDelete: "set null" }),
    accessHash: text("access_hash").notNull(),
    records: jsonb("records").notNull().default([]),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    requestId: uuid("request_id"),
  },
  (t) => [index("pers_drafts_expires_idx").on(t.expiresAt)],
);

export const persRequestOutputs = pgTable(
  "pers_request_outputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => persTemplates.id, { onDelete: "set null" }),
    templateVersion: integer("template_version").notNull(),
    pdfFileId: uuid("pdf_file_id").references(() => requestFiles.id, { onDelete: "set null" }),
    dataFileId: uuid("data_file_id").references(() => requestFiles.id, { onDelete: "set null" }),
    mode: text("mode").notNull(),
    recordCount: integer("record_count").notNull(),
    nutzenCount: integer("nutzen_count").notNull(),
    pageCount: integer("page_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pers_request_outputs_request_idx").on(t.requestId)],
);
