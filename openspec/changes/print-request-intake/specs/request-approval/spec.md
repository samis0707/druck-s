# Spec Delta

## Purpose

Moves the order-confirmation handshake out of scattered email threads into versioned attach-to-send and one-click approval, while keeping discussion itself wherever staff and customers already talk.

## ADDED Requirements

### Requirement: Attach triggers approval request mail

The system SHALL transition a request to WAITING APPROVAL when staff attaches the confirmation PDF plus final print files, and SHALL immediately mail the customer with the PDFs attached and linked, the request reference, approve and request-changes actions, and a note that discussion may happen anywhere but formal approval is the button.

#### Scenario: Attach sends mail and moves status

- **WHEN** staff attaches confirmation v1 plus print files to an IN REVIEW request
- **THEN** status becomes WAITING APPROVAL and the customer receives one mail containing the PDFs, the request reference, and both decision actions.

### Requirement: Change request stays in Waiting Approval

The system SHALL offer a request-changes action that opens the customer's mail client addressed to the firm inbox with the request reference prefilled, and SHALL keep the request in WAITING APPROVAL annotated with the change-request intent and timestamp. Closing the mail client without sending SHALL change nothing.

#### Scenario: Change intent logged without status move

- **WHEN** a customer clicks request-changes on a WAITING APPROVAL request
- **THEN** status remains WAITING APPROVAL with a logged change-requested annotation; no new version is created until staff replaces documents.

### Requirement: Replace with reason resends versioned mail

The system SHALL require staff replacing confirmation documents to confirm the resend with an optional reason, bump the bundle version, keep prior versions viewable, and mail the customer a resend notice stating the new version, the change-from-previous note including the reason when given, the new PDFs, and fresh decision actions.

#### Scenario: Resend states reason and version

- **WHEN** staff replaces v1 with v2 giving reason "paper changed to 170g"
- **THEN** the customer mail states version v2, includes the reason, attaches v2 PDFs, and the request stays WAITING APPROVAL on v2 with v1 retained.

### Requirement: OTP-gated approval with receipts

The system SHALL move a WAITING APPROVAL request to IN PROGRESS only on an approval action backed by a live customer session plus a fresh single-use OTP code, and SHALL then immediately mail an approval receipt to the customer (what was approved: version, files, timestamp, approver) plus a notice to staff including approver identity and client metadata. Double approval clicks SHALL be idempotent.

#### Scenario: Approval without fresh code rejected

- **WHEN** an approval action arrives with an expired session or a reused OTP code
- **THEN** status stays WAITING APPROVAL and the system reports that a fresh code is required.

#### Scenario: Approval notifies both sides

- **WHEN** a valid approval lands on confirmation v2
- **THEN** status becomes IN PROGRESS, the customer receipt names v2 with timestamp and approver, and staff receive the approval notice.

### Requirement: Shipped on invoice plus delivery evidence

The system SHALL move an IN PROGRESS request to SHIPPED only when staff uploads the invoice together with either a tracking number (shipped via carrier) or a special-delivery date (firm delivers directly). Either path without the invoice, or the bundle from any earlier state, SHALL NOT move status.

#### Scenario: Carrier shipment completes

- **WHEN** staff uploads the invoice plus a tracking number on an IN PROGRESS request
- **THEN** status becomes SHIPPED with both artifacts attached and visible.

#### Scenario: Self-delivery completes on date

- **WHEN** staff uploads the invoice plus a special-delivery date on an IN PROGRESS request
- **THEN** status becomes SHIPPED with the date recorded and visible.
