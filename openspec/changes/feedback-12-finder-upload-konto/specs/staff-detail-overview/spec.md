# Spec Delta

## Purpose

Turns the staff request detail into a complete workbench — preview, insights, process position, and the AI result in one place, closing the gap that the note existed only via API.

## ADDED Requirements

### Requirement: Prozess-Timeline

The system SHALL render on the staff request detail a process timeline derived from the request status and event ledger, showing completed stages, the current stage, and the remaining stages up to shipment.

#### Scenario: Stand jederzeit klar

- **WHEN** staff open a request in `IN_REVIEW`
- **THEN** the timeline marks received as done, review as current, and approval, production, and shipment as remaining.

### Requirement: KI-Hinweis auf der Detailseite

The system SHALL render the frozen assistant note (bullets with sources) on the staff request detail page, identically to the customer view, with a plain empty state when no note exists.

#### Scenario: Hinweis sichtbar

- **WHEN** staff open a request that has a generated note
- **THEN** the same bullets the customer sees appear in a dedicated card.

### Requirement: Insights aus Befunden

The system SHALL present per-file insights on the staff detail page — severity badges, finding summaries, uniformity deviations, and security reasons — grouped per file beneath its preview.

#### Scenario: Befunde je Datei

- **WHEN** staff expand a file's insights
- **THEN** printability findings, uniformity deviations, and security reasons for exactly that file are shown.
