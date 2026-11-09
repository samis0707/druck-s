-- Batch-Virenscan (CLAMAV_MODE=batch, docs/virenscan.md, openspec/changes/clamav-batch-scan).
-- Der Scan-Status lebt im Bericht (analysis_reports.security.scan: status, attempts, signature, …),
-- damit Daemon- und Batch-Modus dieselbe gespeicherte Wahrheit haben. Der Cron-Job
-- (scripts/scan-pending.mjs) holt die ältesten PENDING-Berichte; dieser Teilindex hält das billig.
-- Ohne den Index funktioniert alles weiter (nur langsamer), daher kein Datenumbau.
CREATE INDEX IF NOT EXISTS analysis_reports_scan_pending_idx
  ON analysis_reports (measured_at)
  WHERE (security -> 'scan' ->> 'status') = 'PENDING';

--DOWN--
DROP INDEX IF EXISTS analysis_reports_scan_pending_idx;
