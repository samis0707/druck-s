# Spec Delta

## Purpose

Gives customers an immediate, understandable landing after sending — one dialog with status, agent note, and per-file results instead of a bare detail page.

## ADDED Requirements

### Requirement: Ergebnis-Dialog nach Send

The system SHALL open a result dialog automatically when a customer arrives on their request detail page directly after sending (Door A verify or Door B submit). The dialog SHALL show the request status, the agent note (when available), and per-file results, and SHALL offer a single close action plus navigation to the full detail.

#### Scenario: Frischer Auftrag öffnet Dialog

- **WHEN** a customer completes sending and lands on `/requests/[id]`
- **THEN** a result dialog opens once, showing status and whatever results already exist.

#### Scenario: Kein Dialog bei späterem Besuch

- **WHEN** a customer revisits the same request page later (reload or navigation)
- **THEN** no dialog opens automatically.

### Requirement: Warten auf Analyse und Hinweis

The system SHALL poll the request detail endpoint while the dialog is open until analysis reports and the agent note are present (or a timeout expires), showing an in-progress state ("wird analysiert") meanwhile, and SHALL update the dialog content when results arrive.

#### Scenario: Hinweis erscheint nachträglich

- **WHEN** the dialog is open and the agent note is not yet generated
- **THEN** the dialog shows a loading state and fills in the note automatically once available without reload.

#### Scenario: Timeout bleibt lesbar

- **WHEN** analysis or note are still missing after the timeout
- **THEN** the dialog states plainly that results are pending and points to the full detail page.
