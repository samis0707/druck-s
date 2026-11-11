-- Offene Anfrage (Interessenten-Einstieg). Siehe docs/anfrage-api.md und
-- openspec/changes/open-inquiry. Eine vierte Tür in dieselbe Pipeline: Wer noch kein
-- Kundenkonto hat, bestätigt seine Anfrage mit einem Code aus dem E-Mail-Postfach.
-- Der Auftrag landet als origin = 'inquiry' mit prospect_email; Zugang zum Portal
-- gibt es weiterhin erst nach der Freischaltung durch die Druckerei.

-- Kontakt, wie er vor der Bestätigung angegeben wurde: { name, email, organisation, phone }.
ALTER TABLE requests ADD COLUMN inquiry_contact jsonb;

ALTER TABLE requests DROP CONSTRAINT requests_origin_check;
ALTER TABLE requests ADD CONSTRAINT requests_origin_check
  CHECK (origin IN ('door_a', 'door_b', 'partner', 'inquiry'));

-- Bestätigungscode je Entwurf. Kein Login: der Code gilt nur für genau diese Anfrage.
-- Gespeichert ist ein HMAC-SHA256 über Entwurf und Code (Schlüssel aus BETTER_AUTH_SECRET).
CREATE TABLE inquiry_codes (
  request_id uuid PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

-- Die Mengenbegrenzung der offenen Anfrage zählt Einträge im Audit-Log.
CREATE INDEX audit_log_action_created_idx ON audit_log (action, created_at);

--DOWN--
-- Schlägt bewusst fehl, solange Anfragen mit origin = 'inquiry' existieren (kein stiller Datenverlust).
DROP INDEX IF EXISTS audit_log_action_created_idx;
DROP TABLE IF EXISTS inquiry_codes;
ALTER TABLE requests DROP CONSTRAINT requests_origin_check;
ALTER TABLE requests ADD CONSTRAINT requests_origin_check CHECK (origin IN ('door_a', 'door_b', 'partner'));
ALTER TABLE requests DROP COLUMN IF EXISTS inquiry_contact;
