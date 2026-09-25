-- Better Auth migration (section 9): identity moves onto the Better Auth user
-- (role/status/firm); hand-rolled identities/staff/sessions/otp_challenges go away.
-- Table DDL below was generated with `npx drizzle-kit generate` from
-- lib/db/schema/* (file lib/db/generated/0000_talented_gressill.sql) plus three
-- hand-added constraints at the end. Local test data does not survive this
-- migration by design (there is no production yet).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS analysis_reports;
DROP TABLE IF EXISTS assistant_notes;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS confirmation_bundles;
DROP TABLE IF EXISTS request_files;
DROP TABLE IF EXISTS request_events;
DROP TABLE IF EXISTS history_imports;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS upload_links;
DROP TABLE IF EXISTS otp_challenges;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS identities;

CREATE TABLE "analysis_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"printability" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uniformity" jsonb,
	"security" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"measured_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_reports_file_id_unique" UNIQUE("file_id")
);
CREATE TABLE "assistant_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"bundle_version" bigint,
	"input_hash" text NOT NULL,
	"bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history_state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"action" text NOT NULL,
	"actor_type" text,
	"actor_id" text,
	"request_id" uuid,
	"ip" text,
	"user_agent" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "confirmation_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version" bigint NOT NULL,
	"confirmation_key" text NOT NULL,
	"print_file_keys" text[] DEFAULT '{}' NOT NULL,
	"reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "history_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" text NOT NULL,
	"raw_key" text NOT NULL,
	"derived_keys" text[] DEFAULT '{}' NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"order_count" bigint DEFAULT 0 NOT NULL
);
CREATE TABLE "request_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "request_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event" text NOT NULL,
	"actor_type" text,
	"actor_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL
);
CREATE TABLE "request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text,
	"prospect_email" text,
	"trust" text NOT NULL,
	"origin" text NOT NULL,
	"link_id" uuid,
	"product_hint" text NOT NULL,
	"reference_text" text,
	"free_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "requests_trust_check" CHECK ("requests"."trust" IN ('VERIFIED','VOUCHED')),
	CONSTRAINT "requests_origin_check" CHECK ("requests"."origin" IN ('door_a','door_b'))
);
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"invoice_key" text NOT NULL,
	"tracking_number" text,
	"special_delivery_date" date,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_request_id_unique" UNIQUE("request_id")
);
CREATE TABLE "upload_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"consumed_by_request_id" uuid,
	CONSTRAINT "upload_links_token_hash_unique" UNIQUE("token_hash")
);
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"firm" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_file_id_request_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."request_files"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "assistant_notes" ADD CONSTRAINT "assistant_notes_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "confirmation_bundles" ADD CONSTRAINT "confirmation_bundles_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "history_imports" ADD CONSTRAINT "history_imports_identity_id_user_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "requests" ADD CONSTRAINT "requests_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "upload_links" ADD CONSTRAINT "upload_links_identity_id_user_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "audit_log_request_idx" ON "audit_log" USING btree ("request_id");
CREATE INDEX "request_events_request_idx" ON "request_events" USING btree ("request_id");
CREATE INDEX "request_files_request_idx" ON "request_files" USING btree ("request_id");
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");
CREATE INDEX "requests_customer_idx" ON "requests" USING btree ("customer_id");
-- Hand-added constraints drizzle-kit does not express here:
CREATE UNIQUE INDEX "confirmation_bundles_request_version_unique" ON "confirmation_bundles" ("request_id", "version");
ALTER TABLE "upload_links" ADD CONSTRAINT "upload_links_state_check" CHECK ("state" IN ('active', 'consumed', 'expired', 'revoked'));
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_bundle_check" CHECK ("tracking_number" IS NOT NULL OR "special_delivery_date" IS NOT NULL);

--DOWN--
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "account";
DROP TABLE IF EXISTS "audit_log";
DROP TABLE IF EXISTS "history_imports";
DROP TABLE IF EXISTS "assistant_notes";
DROP TABLE IF EXISTS "shipments";
DROP TABLE IF EXISTS "confirmation_bundles";
DROP TABLE IF EXISTS "analysis_reports";
DROP TABLE IF EXISTS "request_files";
DROP TABLE IF EXISTS "request_events";
DROP TABLE IF EXISTS "requests";
DROP TABLE IF EXISTS "upload_links";
DROP TABLE IF EXISTS "user";

CREATE TABLE identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  display_name TEXT,
  firm TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'customer', 'disabled')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID REFERENCES identities(id),
  staff_id UUID REFERENCES staff(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  CHECK (identity_id IS NOT NULL OR staff_id IS NOT NULL)
);
CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);

CREATE TABLE otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID REFERENCES identities(id),
  staff_id UUID REFERENCES staff(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('send_verify', 'approve', 'login')),
  request_id UUID,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_identity_idx ON otp_challenges(identity_id);

CREATE TABLE upload_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id),
  token_hash TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'consumed', 'expired', 'revoked')),
  created_by UUID NOT NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_request_id UUID
);

CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES identities(id),
  prospect_email CITEXT,
  trust TEXT NOT NULL CHECK (trust IN ('VERIFIED', 'VOUCHED')),
  origin TEXT NOT NULL CHECK (origin IN ('door_a', 'door_b')),
  link_id UUID REFERENCES upload_links(id),
  product_hint TEXT NOT NULL,
  reference_text TEXT,
  free_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX requests_status_idx ON requests(status);
CREATE INDEX requests_customer_idx ON requests(customer_id);

CREATE TABLE request_events (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor_type TEXT,
  actor_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX request_events_request_idx ON request_events(request_id);

CREATE TABLE request_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX request_files_request_idx ON request_files(request_id);

CREATE TABLE analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID UNIQUE NOT NULL REFERENCES request_files(id) ON DELETE CASCADE,
  printability TEXT NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]',
  uniformity JSONB,
  security JSONB NOT NULL DEFAULT '{}',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE confirmation_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  confirmation_key TEXT NOT NULL,
  print_file_keys TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  created_by UUID NOT NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, version)
);

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  invoice_key TEXT NOT NULL,
  tracking_number TEXT,
  special_delivery_date DATE,
  created_by UUID NOT NULL REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tracking_number IS NOT NULL OR special_delivery_date IS NOT NULL)
);

CREATE TABLE assistant_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  bundle_version INTEGER,
  input_hash TEXT NOT NULL,
  bullets JSONB NOT NULL DEFAULT '[]',
  history_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE history_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  raw_key TEXT NOT NULL,
  derived_keys TEXT[] NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor_type TEXT,
  actor_id UUID,
  request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  ip TEXT,
  user_agent TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_request_idx ON audit_log(request_id);
