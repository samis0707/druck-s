# Spec Delta

## Purpose

Gives the request queue the full width on wide screens until a selection exists, so triage never loses columns to an empty inspector placeholder.

## ADDED Requirements

### Requirement: Volle Breite ohne Auswahl

The system SHALL render the finder queue at full content width while no request is selected, and SHALL only split into queue plus inspector columns once a selection exists.

#### Scenario: Tabelle behält Breite

- **WHEN** staff open `/staff` without selecting a request
- **THEN** the queue table spans the full width and no placeholder panel occupies a column.

#### Scenario: Spalte erscheint bei Auswahl

- **WHEN** staff select a request
- **THEN** the inspector column appears beside the queue without reloading the list.
