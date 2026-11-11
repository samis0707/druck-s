# Spec Delta

## Purpose

Wer kein Kundenkonto hat, kann eine Druckanfrage stellen; ein Assistent kann sie vorbereiten. Zugang zum Portal gibt weiterhin nur die Druckerei.

## ADDED Requirements

### Requirement: Anfrage in vier Schritten

The system SHALL accept an inquiry without a session through `POST /api/v1/inquiries`, optional `POST …/files`, `POST …/code`, and `POST …/confirm`. A draft SHALL NOT appear in the staff queue. Only a successful confirm SHALL move it to RECEIVED and assign a request number.

#### Scenario: Interessent bestätigt

- **WHEN** an unknown email confirms with the code from its inbox
- **THEN** the request is RECEIVED with `origin = 'inquiry'`, `prospect_email` set, a prospect record exists, the sender gets a receipt mail and `FIRM_INBOX` a notice.

#### Scenario: Kundin bestätigt

- **WHEN** the email belongs to an activated customer
- **THEN** the request is bound to that account as VERIFIED and no session cookie is set.

### Requirement: Bestätigungscode

The system SHALL bind the code to one draft, store only an HMAC, expire it after `OTP_TTL_MINUTES`, allow at most `INQUIRY_CODE_ATTEMPTS` wrong attempts, invalidate it when a new code is sent, and consume it on success. The code SHALL NOT create a session or work as a login or approval code.

#### Scenario: Fünf Fehlversuche

- **WHEN** five wrong codes were entered
- **THEN** the correct code answers 410 `code_expired` and a new code is required.

### Requirement: Kein Zugang ohne Freischaltung

A prospect created by an inquiry SHALL NOT be able to log in, view requests, or approve. After staff matures the prospect, the inquiries of that email SHALL belong to the customer account.

### Requirement: Grenzen

The system SHALL answer 429 `rate_limited` with `Retry-After` when drafts per IP and hour, codes per draft, codes per email and hour, or codes per IP and hour exceed their configured limits.

### Requirement: Sichtbarkeit

`GET /api/v1/inquiries/{id}` SHALL show content, files, and the masked contact email only while the inquiry is a draft, afterwards only number and status. One-time-link and partner requests SHALL answer 404.

### Requirement: Beschreibung

The system SHALL serve an OpenAPI 3.1 document at `/api/v1/openapi.json` and a Swagger UI at `/api/docs` from local assets, and SHALL allow both in robots.txt. A test SHALL fail when a described route is missing, an `/api/v1` route is undescribed, or an error code is not listed.
