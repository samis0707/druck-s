# Spec Delta

## Purpose

Nur eingerichtete, aktive Partner nutzen die Schnittstelle; Staff erkennt Partner-Aufträge.

## ADDED Requirements

### Requirement: Partner-Keys

The system SHALL authenticate partner routes with `Authorization: Bearer dmp_<64 hex>`, store only the SHA-256 hash and a non-secret prefix, compare in constant time, and answer 401 for missing, wrong, or deactivated keys. Keys and webhook secrets SHALL be shown only once by the management script.

#### Scenario: Fremder Auftrag

- **WHEN** partner B asks for partner A's `partnerRef`
- **THEN** the response is 404.

### Requirement: Rate-Limit

The system SHALL refuse more than `PARTNER_RATE_LIMIT_PER_HOUR` new requests per partner within 60 minutes with 429; idempotent repeats SHALL not count.

### Requirement: Staff-Herkunft

The system SHALL show partner requests in staff list and detail with the partner name instead of the trust badge and SHALL render the partner metadata (reference, organisation, contact, product, quantity, wish date, delivery, note, file, source) readable on the detail page.

#### Scenario: Seeräuber-Auftrag in der Liste

- **WHEN** staff opens the queue
- **THEN** the request shows „Über Seeräuber digital“.
