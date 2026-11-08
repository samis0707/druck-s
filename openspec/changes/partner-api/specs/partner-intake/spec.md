# Spec Delta

## Purpose

Partnersysteme liefern Druckaufträge maschinell in dieselbe Pipeline wie Door A/B ein.

## ADDED Requirements

### Requirement: Partner-Auftrag anlegen

The system SHALL accept `POST /api/partner/requests` from an authenticated partner, validate the body against the partner contract, download the file only via HTTPS from the partner's allowed hosts (no redirects, no private or local addresses, at most 100 MB), verify size and SHA-256, and create one request with `origin = 'partner'`, `trust = VOUCHED`, the file, and the events `draft_created` and `partner_submitted` in one transaction, ending in RECEIVED with a request number. Analysis, malware scan, and the assistant note SHALL run as for Door A/B.

#### Scenario: Neuer Auftrag

- **WHEN** a partner posts a valid body with an unknown `partnerRef`
- **THEN** the response is 201 with `{ request: { id, number, status: "RECEIVED" } }` and staff sees the request.

#### Scenario: Idempotente Wiederholung

- **WHEN** the same partner posts again with the same `partnerRef` (also concurrently)
- **THEN** the response is 200 with the existing request and no second request or file is created.

#### Scenario: Datei passt nicht

- **WHEN** the downloaded file differs from `file.size` or `file.sha256`, or the host is not allowed
- **THEN** the response is 422 (mismatch) or 400 (host) and nothing is stored.

### Requirement: Kunde und Freitext

The system SHALL bind the request to an active customer account with the given email, otherwise record it under `prospect_email`; a disabled account SHALL be refused with 422. The free text SHALL contain product, format, quantity, wish date, delivery, event, contact, preflight, printer check, and note in German.

#### Scenario: Gemeinschaft noch ohne Konto

- **WHEN** the email has no account
- **THEN** the request is stored with `prospect_email` and later binds on staff activation.

### Requirement: Zurückziehen

The system SHALL let the owning partner withdraw a request only from RECEIVED or IN_REVIEW via the `withdrawn` event (status WITHDRAWN, terminal); later states SHALL answer 409; repeating on WITHDRAWN SHALL answer 200.

#### Scenario: Zu spät

- **WHEN** the partner cancels a request in WAITING_APPROVAL
- **THEN** the response is 409 and the status stays WAITING_APPROVAL.
