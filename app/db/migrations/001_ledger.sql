-- Bootstrap migration ledger. Real tables arrive in task 1.3.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--DOWN--
DROP TABLE IF EXISTS schema_migrations;
