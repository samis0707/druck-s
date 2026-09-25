import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUser } from "./auth";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("requests_trust_check", sql`${t.trust} IN ('VERIFIED','VOUCHED')`),
    check("requests_origin_check", sql`${t.origin} IN ('door_a','door_b')`),
    index("requests_status_idx").on(t.status),
    index("requests_customer_idx").on(t.customerId),
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

export const analysisReports = pgTable("analysis_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id")
    .notNull()
    .unique()
    .references(() => requestFiles.id, { onDelete: "cascade" }),
  printability: text("printability").notNull(),
  findings: jsonb("findings").notNull().default([]),
  uniformity: jsonb("uniformity"),
  security: jsonb("security").notNull().default({}),
  measuredAt: timestamp("measured_at").notNull().defaultNow(),
});

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
