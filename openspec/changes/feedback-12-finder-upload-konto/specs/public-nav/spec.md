# Spec Delta

## Purpose

Keeps the public navigation customer-focused (Upload, Aufträge, Konto) while staff access remains reachable exactly once from the central footer.

## ADDED Requirements

### Requirement: Staff nur im Footer

The system SHALL NOT show any staff link in the header navigation (desktop or mobile sheet) and SHALL expose the staff login link in the central footer on every page.

#### Scenario: Kein Staff in der Navigation

- **WHEN** a user opens the header navigation on desktop or mobile
- **THEN** only Upload, Aufträge, and Konto/Login appear — no staff entry.

#### Scenario: Staff über Footer erreichbar

- **WHEN** a user clicks the staff link in the footer from any page
- **THEN** the staff login page opens.
