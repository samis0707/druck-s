-- Base data model (task 1.3). Up section runs on migrate; DOWN section on `node db/migrate.js down 002_schema.sql`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

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

--DOWN--
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS history_imports;
DROP TABLE IF EXISTS assistant_notes;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS confirmation_bundles;
DROP TABLE IF EXISTS analysis_reports;
DROP TABLE IF EXISTS request_files;
DROP TABLE IF EXISTS request_events;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS upload_links;
DROP TABLE IF EXISTS otp_challenges;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS identities;
