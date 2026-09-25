# Spec Delta

## Purpose

Makes per-customer history transparent on the staff customer list — whether a dump exists, how old and large it is, and what it contains.

## ADDED Requirements

### Requirement: Dump-Status pro Kunde

The system SHALL show on `/staff/customers` for each identity whether a history dump is stored, with import date and order count, or plainly state that none exists.

#### Scenario: Status auf einen Blick

- **WHEN** staff open the customer list
- **THEN** every row shows dump state: date plus order count, or "kein Dump".

### Requirement: Dump-Inhalt einsehbar

The system SHALL let staff inspect the stored dump content (the derived markdown, truncated to a readable preview with full view on demand) for the selected customer without downloading raw XML.

#### Scenario: Inhalt prüfbar

- **WHEN** staff expand the dump preview for a customer with an import
- **THEN** they see the derived markdown content (truncated with full-view option) as the note would read it.
