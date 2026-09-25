# Spec Delta

## Purpose

Lets customers submit print files through a familiar drag-and-drop surface while keeping the verified Door A intake flow and its single overall progress indicator.

## ADDED Requirements

### Requirement: Dropzone file picker inside Door A form

The system SHALL present the file step of the Door A form as a dropzone surface supporting click-to-browse and drag-and-drop for multiple files, showing the staged file list with name and size and allowing removal before send. The draft creation, file upload, email OTP, and code verification flow SHALL remain unchanged.

#### Scenario: Drag and drop stages files

- **WHEN** a customer drags two allowed files onto the dropzone in step `form`
- **THEN** both files appear in the staged list with name and size and can be removed individually before sending.

#### Scenario: Door A flow unchanged after staging

- **WHEN** a customer with staged files clicks send and completes email plus code verification
- **THEN** the system creates exactly one draft, uploads the staged files, verifies the OTP, and navigates to the created request.

### Requirement: Consistent client validation messaging

The system SHALL validate staged files client-side against the same type and size rules the server enforces and SHALL report rejections inline by file name with reason, without discarding the valid staged files.

#### Scenario: Invalid file rejected by name

- **WHEN** a customer stages one valid PDF and one disallowed file
- **THEN** the valid PDF stays staged and an inline message names the rejected file with its reason.

### Requirement: Single overall progress indicator

The system SHALL indicate send progress with one overall progress indicator and busy-state button labels, and SHALL NOT show per-file progress bars, per-file phase badges, or aggregate analyzed-count bars.

#### Scenario: Sending shows one progress

- **WHEN** a customer clicks send with staged files
- **THEN** one progress indicator advances and the send button shows a busy label until the draft plus file upload step completes or fails.
