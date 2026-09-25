# Spec Delta

## Purpose

Structures fuzzy email-style print intake into one generic request container whose lifecycle is derived from work events, preserving the firm's flexibility for campaigns and special orders.

## ADDED Requirements

### Requirement: Generic request container

The system SHALL represent one upload procedure as one print request containing an arbitrary file mix, a product hint from a small most-common dropdown, an optional reference text, and a first-class free-text intent field kept verbatim. The system SHALL NOT infer order items, quantities, or product splits from file counts or names.

#### Scenario: Campaign upload stays one request

- **WHEN** a customer uploads 3 PDFs, 1 docx, and 1 xlsx with hint "campaign" and free text
- **THEN** the system stores exactly one request with all 5 files, the hint, and the verbatim text, and creates zero order items.

#### Scenario: Content never normalized on write

- **WHEN** free text contains "130 total, 20 blanko" and files contain placeholders
- **THEN** the stored text and files are byte-identical to what was sent; no parsing, counting, or rewriting occurs at intake.

### Requirement: Dual intake with trust annotation

The system SHALL accept requests through Door A (generic URL, email plus OTP verification at Send) and Door B (staff one-time link, no uploader verification), and SHALL annotate every received request as VERIFIED or VOUCHED with its origin (door, link id and creator for Door B). Unverified Door A drafts SHALL remain invisible to staff and expire automatically.

#### Scenario: Verified intake binds customer

- **WHEN** an onboarded customer completes email plus OTP after Send
- **THEN** the request becomes RECEIVED, is bound to that customer, and becomes visible to staff.

#### Scenario: Vouched intake flagged but visible

- **WHEN** a prospect submits through an active staff link without OTP
- **THEN** the request becomes RECEIVED annotated VOUCHED with the link id and bound to the prospect email record.

#### Scenario: Abandoned draft evaporates

- **WHEN** a Door A draft passes its time-to-live without OTP completion
- **THEN** the system deletes the staged files and the draft never appears in staff triage.

### Requirement: Event-sourced lifecycle with no manual status control

The system SHALL derive request status exclusively from events: Submit to RECEIVED; first authenticated staff preview to IN REVIEW; confirmation plus print-file attach to WAITING APPROVAL; customer approval to IN PROGRESS; invoice plus tracking-or-date bundle to SHIPPED. The system SHALL expose no control that sets status directly, and SHALL reject out-of-order transitions (for example invoice upload from IN REVIEW SHALL NOT yield SHIPPED).

#### Scenario: Preview moves Received to In Review

- **WHEN** a staff member opens the in-app file preview of a RECEIVED request
- **THEN** status becomes IN REVIEW; customer preview, bot fetch, or download alone does not trigger it twice.

#### Scenario: Invalid shipped transition rejected

- **WHEN** staff uploads an invoice while the request is IN REVIEW
- **THEN** status remains IN REVIEW and the system reports that approval is required first.

### Requirement: Confirmation versioning

The system SHALL version every confirmation plus print-file bundle (v1, v2, ...) and retain superseded versions viewable alongside the current one, recording which version each approval or resend refers to.

#### Scenario: Replaced bundle bumps version

- **WHEN** staff replaces the confirmation documents on a WAITING APPROVAL request with a reason
- **THEN** the request keeps v1 viewable, publishes v2 with the reason and timestamp, and stays WAITING APPROVAL on v2.
