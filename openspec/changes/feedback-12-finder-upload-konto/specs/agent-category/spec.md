# Spec Delta

## Purpose

Lets the agent propose the fitting product category from the existing list and guarantees customers and staff always read German category names instead of technical slugs.

## ADDED Requirements

### Requirement: Kategorie-Vorschlag des Agenten

The system SHALL have the assistant note suggest exactly one category from the existing product-hint value set, stored as a first-class note field, validated against the allowed values, and displayed identically on customer and staff views next to the customer-chosen hint.

#### Scenario: Vorschlag erscheint beidseitig

- **WHEN** a note is generated for a request with hint "other" and files resembling flyers
- **THEN** customer and staff views show the same suggested category alongside the chosen hint.

#### Scenario: Ungültiger Vorschlag wird verworfen

- **WHEN** the model returns a category outside the allowed value set
- **THEN** note generation retries once and, on repeated failure, stores no suggestion instead of an invalid one (bullets still validated as before).

### Requirement: Deutsche Kategorie-Anzeige

The system SHALL display product hint and suggested category via their German labels everywhere (customer detail, staff detail, finder queue/grid/inspector, request lists) and SHALL never render the raw slug value to users.

#### Scenario: Slug wird übersetzt

- **WHEN** a request carries productHint "business-card"
- **THEN** every view shows "Visitenkarte".
