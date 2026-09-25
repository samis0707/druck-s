# Spec Delta

## Purpose

Gives customers an honest first signal of printability and gives staff a shared working basis for checking, without ever blocking an upload on automated findings.

## ADDED Requirements

### Requirement: Per-file printability report

The system SHALL produce a per-file printability report for every received file: PDF files get page size and count, bleed and trim-box presence, color mode (RGB/CMYK/spot mix), font embedding state, and minimum image resolution; raster images get dimensions, DPI, and color mode; Office files (docx, xlsx, pptx) get readability, page or sheet counts, and placed-image counts. Reports SHALL use severity CLEAN, SUSPICIOUS (manual check needed), or action-guiding printability colors green, yellow, red.

#### Scenario: PDF report lists concrete findings

- **WHEN** a 4-page PDF with zero bleed and mixed RGB plus CMYK is analyzed
- **THEN** the report states page size per page, bleed 0mm, mixed color modes with the deviating page identified, font embedding state, and lowest image DPI.

#### Scenario: Office file gets shallow report

- **WHEN** a docx is analyzed
- **THEN** the report states readable state plus page count and flags that full PDF-grade preflight is not possible, with severity SUSPICIOUS meaning manual check.

### Requirement: Multi-page uniformity check

The system SHALL check technical uniformity across pages of multi-page PDFs (trim size consistency, bleed consistency, color-mode consistency) and SHALL list every deviating page number. The system SHALL NOT perform visual or semantic sameness judgments.

#### Scenario: Deviating page flagged

- **WHEN** page 57 of a 130-page PDF is 2mm narrower than the rest
- **THEN** the report states mixed sizes and identifies page 57 with its measured size.

#### Scenario: Intentional mix reported without judgment

- **WHEN** one PDF contains A5 and A3 pages by design
- **THEN** the report states mixed sizes factually and keeps severity neutral about intent.

### Requirement: Security screening and quarantine

The system SHALL malware-scan every uploaded file, flag PDF JavaScript, embedded files, and launch actions, flag Office macros, OLE objects, external links, and extension-versus-MIME mismatches, and assign security CLEAN, SUSPICIOUS, or INFECTED. Files scored INFECTED SHALL be hidden from staff with the reason logged; the uploader SHALL be told to provide a fresh export. The system SHALL NOT attempt to clean or repair files.

#### Scenario: Infected file quarantined

- **WHEN** a file triggers a malware signature
- **THEN** staff cannot preview or download it, the audit log records the verdict, and the uploader sees a fresh-copy request.

#### Scenario: Macro flagged but visible

- **WHEN** an xlsx contains macros
- **THEN** the file stays visible to staff with security SUSPICIOUS and the macro reason attached.

### Requirement: Shared report, nudge never gate

The system SHALL store the analysis report on the file as the single shared truth rendered in plain customer wording and detailed staff wording, and SHALL allow Send, approval, and production to proceed regardless of severity. Green SHALL be worded as first indication only, never as a print guarantee.

#### Scenario: Red upload still sendable

- **WHEN** a customer sends a red-severity PDF
- **THEN** the upload completes, the report is shown with plain-language guidance, and staff triage proceeds normally.
