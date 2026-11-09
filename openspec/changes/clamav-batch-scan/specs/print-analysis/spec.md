# Spec Delta

## Purpose

Die Signaturprüfung darf zeitversetzt laufen, ohne den Ablauf zu blockieren und ohne INFECTED-Dateien auszuliefern, sobald sie erkannt sind.

## MODIFIED Requirements

### Requirement: Security screening and quarantine

The system SHALL malware-scan every uploaded file, either synchronously at intake (`CLAMAV_MODE=daemon`, default) or in a later batch run (`CLAMAV_MODE=batch`), flag PDF JavaScript, embedded files, and launch actions, flag Office macros, OLE objects, external links, and extension-versus-MIME mismatches, and assign security CLEAN, SUSPICIOUS, INFECTED, or — while the batch scan is outstanding — PENDING. Files scored INFECTED SHALL be hidden from staff and customer from the moment of detection with the verdict recorded in the audit log; the uploader SHALL be told to provide a fresh export. A PENDING scan SHALL NOT block preview, download, approval, or production (fail-open, like an unreachable scanner). The system SHALL NOT attempt to clean or repair files.

#### Scenario: Infected file quarantined

- **WHEN** a file triggers a malware signature
- **THEN** staff cannot preview or download it, the audit log records the verdict, and the uploader sees a fresh-copy request.

#### Scenario: Batch scan outstanding

- **WHEN** a file is uploaded with `CLAMAV_MODE=batch`
- **THEN** its report shows „Virenprüfung läuft“ instead of „Manuell prüfen“, staff can preview it, and the request proceeds normally.

#### Scenario: Batch run finds a signature

- **WHEN** the scan job finds a signature in a file that was PENDING
- **THEN** the report becomes INFECTED with `malware signature: <name>`, downloads are refused from then on, and `malware_detected` is audited.

#### Scenario: Batch scan keeps failing

- **WHEN** a file cannot be scanned in `SCAN_MAX_ATTEMPTS` runs
- **THEN** it becomes SUSPICIOUS with „malware scan unavailable — manual check“ and `malware_scan_unavailable` is audited.

#### Scenario: Macro flagged but visible

- **WHEN** an xlsx contains macros
- **THEN** the file stays visible to staff with security SUSPICIOUS and the macro reason attached.
