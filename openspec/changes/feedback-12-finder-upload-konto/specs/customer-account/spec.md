# Spec Delta

## Purpose

Lets customers sign in without uploading first and see their own data — personal info plus their requests — in one small account area.

## ADDED Requirements

### Requirement: Standalone-Login

The system SHALL provide a customer login page (`/login`) using email plus OTP via the existing login API, redirecting already signed-in customers to their account, and SHALL link it from the header Konto entry and the empty request-list state.

#### Scenario: Login ohne Upload

- **WHEN** a customer without any upload opens `/login` and completes email plus code
- **THEN** they land signed-in on their account page.

### Requirement: Kontoseite mit persönlichen Infos

The system SHALL provide an account page (`/konto`) showing the signed-in customer's personal information (email, display name, firm, customer status) from a new `GET /api/account` endpoint plus their own requests, and SHALL redirect anonymous visitors to `/login`.

#### Scenario: Eigene Daten einsehbar

- **WHEN** a signed-in customer opens `/konto`
- **THEN** they see their email, name, firm, and status exactly as stored, plus their request list.

#### Scenario: Anonym wird umgeleitet

- **WHEN** an anonymous visitor opens `/konto`
- **THEN** they are redirected to `/login`.
