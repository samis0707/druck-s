-- Härtung: Zugriffs-Links der Personalisierung werden zusätzlich verschlüsselt gespeichert (AES-256-GCM,
-- Schlüssel aus PERS_LINK_KEY bzw. abgeleitet aus BETTER_AUTH_SECRET), damit Mitarbeiter denselben Link
-- erneut kopieren können. Die Prüfung läuft weiter über token_hash. Bestehende Links bleiben gültig,
-- sind aber nicht erneut anzeigbar (token_enc ist NULL).
ALTER TABLE pers_access_links ADD COLUMN token_enc text;

-- Aufbewahrung: der Anonymisierungs-Sweep des audit_log sucht nach Alter.
CREATE INDEX audit_log_created_idx ON audit_log (created_at);

--DOWN--
DROP INDEX IF EXISTS audit_log_created_idx;
ALTER TABLE pers_access_links DROP COLUMN IF EXISTS token_enc;
