-- Partner-Schnittstelle (Server-zu-Server, z. B. Seeräuber digital). Siehe docs/partner-api.md
-- und openspec/changes/partner-api. Partner-Aufträge sind eine dritte Tür (origin = 'partner')
-- in dieselbe Pipeline; Status ändert sich weiterhin nur über request_events (appendEventTx).

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL,
  -- API-Key "dmp_<64 hex>": gespeichert nur als SHA-256 (hex) plus nicht geheimes Präfix zur Anzeige/Suche.
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text NOT NULL,
  key_rotated_at timestamptz,
  -- Webhook-Ziel und HMAC-Secret. Das Secret muss zum Signieren im Klartext verfügbar sein und liegt
  -- deshalb verschlüsselt vor (AES-256-GCM, Schlüssel per HKDF aus BETTER_AUTH_SECRET; lib/partners/secrets.ts).
  webhook_url text,
  webhook_secret_enc text,
  -- Erlaubte Hosts für file.url (exakter Hostname, nur HTTPS; SSRF-Schutz).
  file_hosts text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partners_key_prefix_idx ON partners (key_prefix);

ALTER TABLE requests ADD COLUMN partner_id uuid REFERENCES partners(id);
ALTER TABLE requests ADD COLUMN partner_ref text;
ALTER TABLE requests ADD COLUMN partner_meta jsonb;
CREATE UNIQUE INDEX requests_partner_ref_unique ON requests (partner_id, partner_ref) WHERE partner_id IS NOT NULL;
ALTER TABLE requests DROP CONSTRAINT requests_origin_check;
ALTER TABLE requests ADD CONSTRAINT requests_origin_check CHECK (origin IN ('door_a', 'door_b', 'partner'));
ALTER TABLE requests ADD CONSTRAINT requests_partner_check CHECK (
  (origin = 'partner') = (partner_id IS NOT NULL) AND (partner_id IS NULL) = (partner_ref IS NULL)
);

-- Outbox für Status-Webhooks: Eintrag entsteht in derselben Transaktion wie der Statuswechsel,
-- Zustellung mit HMAC-Signatur und Backoff durch den Worker (instrumentation.ts).
CREATE TABLE partner_webhook_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES partners(id),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  last_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_webhook_outbox_due_idx ON partner_webhook_outbox (next_attempt_at)
  WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE INDEX partner_webhook_outbox_request_idx ON partner_webhook_outbox (request_id, id);

--DOWN--
-- Schlägt bewusst fehl, solange Partner-Aufträge existieren (kein stiller Datenverlust).
DROP TABLE IF EXISTS partner_webhook_outbox;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_partner_check;
ALTER TABLE requests DROP CONSTRAINT requests_origin_check;
ALTER TABLE requests ADD CONSTRAINT requests_origin_check CHECK (origin IN ('door_a', 'door_b'));
DROP INDEX IF EXISTS requests_partner_ref_unique;
ALTER TABLE requests DROP COLUMN IF EXISTS partner_meta;
ALTER TABLE requests DROP COLUMN IF EXISTS partner_ref;
ALTER TABLE requests DROP COLUMN IF EXISTS partner_id;
DROP TABLE IF EXISTS partners;
