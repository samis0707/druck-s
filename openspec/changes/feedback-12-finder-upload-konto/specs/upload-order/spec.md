# Spec Delta

## Purpose

Führt Kunden in der natürlichen Reihenfolge durch den Upload — erst Dateien, dann Beschreibung, dann Produkt — und kennzeichnet die Referenz als freiwillig.

## ADDED Requirements

### Requirement: Datei-zuerst-Reihenfolge

The system SHALL render the upload form (Door A and Door B link upload) in the order files dropzone, then description, then product selection, then optional reference. Validation, draft flow, and OTP steps SHALL remain unchanged.

#### Scenario: Upload beginnt mit Dateien

- **WHEN** a customer opens `/upload` or a Door B link
- **THEN** the first block is the file dropzone, followed by the description field, then the product selection, then the reference field.

### Requirement: Referenz als optional gekennzeichnet

The system SHALL label the reference field as optional and SHALL accept empty submissions without warning.

#### Scenario: Leere Referenz ist gültig

- **WHEN** a customer sends a request with an empty reference field
- **THEN** the submission succeeds exactly as with a filled reference.
