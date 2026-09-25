# Spec Delta

## Purpose

Lets staff onboard customers by email and lets customers act with inbox-proved one-time codes instead of passwords, covering both returning logins and staff-vouched prospect uploads.

## ADDED Requirements

### Requirement: Staff provisioning with prospect maturation

The system SHALL let staff create and disable identity records by email, starting as prospect and maturing to customer on the same record with history preserved. Only onboarded emails SHALL be able to verify uploads or log in; unknown emails SHALL be rejected at verification with guidance to contact the firm.

#### Scenario: Prospect matures preserving history

- **WHEN** staff converts a prospect email that already has vouched requests into a customer
- **THEN** the same record gains login ability and all prior requests and history stay attached.

#### Scenario: Unknown email rejected

- **WHEN** an unlisted email attempts OTP verification on the generic upload page
- **THEN** verification is refused and the uploader is told to contact the firm; no request is bound.

### Requirement: Generic URL plus OTP login

The system SHALL offer one generic upload and login entry where upload form filling needs no session, while Send verification requires entering the onboarded email, receiving a single-use OTP code, and entering it within its lifetime. Codes SHALL be short-lived, single-use, and rate-limited with cooldown and audit on failures.

#### Scenario: Login binds draft on valid code

- **WHEN** a draft sender enters a correct unused code within its lifetime
- **THEN** the draft binds to that customer, a session is created, and full analysis runs.

#### Scenario: Brute force throttled

- **WHEN** five consecutive wrong codes are entered for one challenge
- **THEN** the challenge locks into cooldown, attempts are audit-logged, and no further guesses are accepted until cooldown ends.

### Requirement: One-time staff upload links

The system SHALL let staff generate per-email one-time upload links that are random, upload-only, bound to one email record, consumable by exactly one request Submit, expiring 7 days after creation, and revocable by staff at any time. Consumed, expired, or revoked links SHALL explain themselves and point to requesting a new link or using the generic page. Link use SHALL be audit-logged with creator, email, creation, and consumption timestamps.

#### Scenario: Link dies on Submit

- **WHEN** a prospect submits a request through an active staff link
- **THEN** the request is RECEIVED as vouched and the same link immediately stops working for any further submit.

#### Scenario: Expired link refused with guidance

- **WHEN** a link older than 7 days without Submit is opened
- **THEN** upload is refused with an expired message directing the visitor to ask the firm for a new link or use the generic page.

### Requirement: Sessions, revocation, and audit

The system SHALL issue short-lived revocable sessions on successful OTP verification, require a live session for viewing one's own requests and a live session plus fresh OTP for approval, and SHALL log identity-relevant events (view, download, verify, approve, link create, consume, revoke, disable) with actor, timestamp, and client metadata.

#### Scenario: Disabled customer loses access

- **WHEN** staff disables a customer with an active session
- **THEN** the session stops authorizing views and approvals immediately while the request history remains intact for staff.

#### Scenario: Approval needs fresh code even with live session

- **WHEN** a logged-in customer with a day-old session attempts approval with the original Send code
- **THEN** approval is refused and a fresh OTP challenge is required.
