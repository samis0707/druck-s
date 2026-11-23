-- Personalisierung, Oberfläche: Arbeitskopie (Autospeichern ohne neue Version), Virenscan-Status für
-- Design-PDFs/Schriften/Bilder im Batch-Modus, Verknüpfung Entwurf <-> Anfrage (Absenden mit Code).

-- Arbeitskopie: der Editor speichert hier laufend. Erst „Veröffentlichen“ macht daraus eine Version.
ALTER TABLE pers_templates ADD COLUMN working_spec jsonb;
ALTER TABLE pers_templates ADD COLUMN working_updated_at timestamptz;

-- Virenscan: Altbestand gilt als geprüft (CLEAN); neue Dateien setzt die App je nach CLAMAV_MODE.
ALTER TABLE pers_files ADD COLUMN scan_status text NOT NULL DEFAULT 'CLEAN' CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'UNAVAILABLE'));
ALTER TABLE pers_files ADD COLUMN scan_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE pers_files ADD COLUMN scan_detail text;
ALTER TABLE pers_fonts ADD COLUMN scan_status text NOT NULL DEFAULT 'CLEAN' CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'UNAVAILABLE'));
ALTER TABLE pers_fonts ADD COLUMN scan_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE pers_fonts ADD COLUMN scan_detail text;
CREATE INDEX pers_files_scan_pending_idx ON pers_files (created_at) WHERE scan_status = 'PENDING';
CREATE INDEX pers_fonts_scan_pending_idx ON pers_fonts (created_at) WHERE scan_status = 'PENDING';

-- Gast-Entwurf, der gerade mit Code bestätigt wird: gehört zu genau einer (noch offenen) Anfrage.
ALTER TABLE pers_drafts ADD COLUMN request_id uuid REFERENCES requests(id) ON DELETE SET NULL;
CREATE INDEX pers_drafts_request_idx ON pers_drafts (request_id) WHERE request_id IS NOT NULL;

--DOWN--
DROP INDEX IF EXISTS pers_drafts_request_idx;
ALTER TABLE pers_drafts DROP COLUMN IF EXISTS request_id;
DROP INDEX IF EXISTS pers_fonts_scan_pending_idx;
DROP INDEX IF EXISTS pers_files_scan_pending_idx;
ALTER TABLE pers_fonts DROP COLUMN IF EXISTS scan_detail, DROP COLUMN IF EXISTS scan_attempts, DROP COLUMN IF EXISTS scan_status;
ALTER TABLE pers_files DROP COLUMN IF EXISTS scan_detail, DROP COLUMN IF EXISTS scan_attempts, DROP COLUMN IF EXISTS scan_status;
ALTER TABLE pers_templates DROP COLUMN IF EXISTS working_updated_at, DROP COLUMN IF EXISTS working_spec;
