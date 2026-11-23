# Spec Delta

## Purpose

Kosten und unverbindliche Richtpreise für Druckprodukte, aus Stammdaten der kalpri-Engine; für Mitarbeiter, Maschinen und (eingeschränkt) Besucher.

## ADDED Requirements

### Requirement: Zugriffsschutz

The system SHALL check the role server-side in every handler: staff routes require a staff session, machine routes a valid API key with scope `kalkulation`, only the richtpreis routes are public.

#### Scenario: Kunde ruft Staff-Route
- **WHEN** a customer session calls `/api/staff/kalkulation/…`
- **THEN** the response is 403; without session 401.

#### Scenario: Schlüssel ohne Scope
- **WHEN** a key lacks scope `kalkulation`
- **THEN** the response is 403.

### Requirement: Optimistische Sperre

The system SHALL write a data area only with the version the writer knows and answer 409 otherwise; every stored state SHALL be appended to an append-only history.

#### Scenario: Gleichzeitiges Schreiben
- **WHEN** two staff members write the same version at once
- **THEN** exactly one succeeds and the other gets 409.

### Requirement: Richtpreis

The system SHALL compute costs plus overhead, profit, minimum price, rounding, range and VAT using integer arithmetic, and label it „unverbindlicher Richtpreis“. If the calculation is incomplete (open questions, not complete, lines without cost) it SHALL return „Preis auf Anfrage“ with reasons and no price.

#### Scenario: Unvollständig
- **WHEN** a question is unanswered
- **THEN** the result has status `auf_anfrage` and no amounts.

### Requirement: Öffentlicher Richtpreis

The system SHALL offer `GET /api/v1/richtpreis/artikel` and `POST /api/v1/richtpreis` without login, only for shop-released articles, with strict German validation, 1–6 runs, a per-IP hourly limit, and without costs or personal data in responses.

#### Scenario: Limit erreicht
- **WHEN** an IP exceeds `RICHTPREIS_PER_IP_PER_HOUR`
- **THEN** the response is 429 with `Retry-After`.

### Requirement: Import mit Vorschau

The system SHALL preview a werkbank-sicherung (status per area) and import it only after confirmation, with an audit entry.

### Requirement: Richtpreis-Snapshot

The system SHALL store inputs, result, price settings and engine origin per request in `request_quotes` and show it to staff.
