# Spec Delta

## Purpose

Gives staff an asset-forward finder for triage that keeps request metadata visible, so files and their analysis results drive attention without losing who, what, and what-state context.

## ADDED Requirements

### Requirement: Finder view toggle with two comparable views

The system SHALL offer the staff request overview as a finder with a view toggle between View B (queue plus inspector) and View C (asset-first grid grouped by request), persisting the selected view for the session.

#### Scenario: Staff compare both finder views

- **WHEN** staff switch the view toggle between queue-plus-inspector and asset grid
- **THEN** the same filtered request set appears in both presentations with identical metadata and analysis rollups.

### Requirement: Queue plus inspector view

The system SHALL render View B as a compact sortable and filterable request queue on one side and an inspector for the selected request on the other, showing the selected request's metadata, its asset list with per-file severity badges, per-file findings, and the request actions.

#### Scenario: Selecting a request shows its assets without losing the queue

- **WHEN** staff select a request in the queue
- **THEN** the inspector shows that request's product hint, customer, status, trust, age, file list with severity badges, and available actions while the queue with its filters remains visible.

#### Scenario: Inspector assets can be sorted and expanded

- **WHEN** staff change asset sorting or expand a file's findings in the inspector
- **THEN** assets reorder by severity, name, or size and findings show printability summaries, uniformity deviations, and security reasons.

### Requirement: Assistant note visible in inspector

The system SHALL show the frozen assistant note in the inspector for the selected request, identical in content to the customer view, read-only, with its bullets and sources, and SHALL state plainly when no note exists instead of blocking triage.

#### Scenario: Staff see the same note as the customer

- **WHEN** staff select a request that has a generated assistant note
- **THEN** the inspector shows the same bullets and sources the customer sees, without edit, regenerate, or workflow controls.

#### Scenario: Missing note disclosed gracefully

- **WHEN** the selected request has no assistant note yet or generation failed validation
- **THEN** the inspector states that no note is available and still shows assets, rollup, and actions.

### Requirement: Asset-first grid view

The system SHALL render View C as asset cards grouped under sticky request headers, where each header carries the request reference, product, customer, status, trust, age, and analysis rollup, and each card shows file name, mime icon, size, and severity badge linking to the request detail.

#### Scenario: Asset grid never hides request context

- **WHEN** staff browse the asset grid
- **THEN** every asset card appears under its request header and navigating from a card opens that request with the file in focus.

### Requirement: Analysis rollup and finder filters

The system SHALL compute a worst-of analysis rollup per request from security verdict and printability severity, display it as a sortable column and badge, and SHALL let staff filter by severity attention, trust, and status plus sort by rollup, file count, and age.

#### Scenario: Attention-needing requests surface first

- **WHEN** staff sort by analysis rollup or filter to needs-attention
- **THEN** requests with withheld or problematic files rank above clean ones and clean requests can be hidden by the filter.

### Requirement: Request-scoped actions only

The system SHALL expose only request-scoped staff actions (open detail, attach confirmation for review states, record shipment for production state) with dialog confirmation where destructive or state-changing, and SHALL NOT introduce position-level transitions, pricing, catalog, or payment actions.

#### Scenario: Staff act on a request from the finder

- **WHEN** staff trigger attach-confirmation or record-shipment from either finder view
- **THEN** the system runs the existing request transition and refreshes rollup, status, and asset state without exposing any project or catalog concepts.

### Requirement: Withheld files stay protected in the finder

The system SHALL NOT offer download or preview bytes for files withheld by the security verdict, and SHALL show their badge and reasons instead.

#### Scenario: Withheld file shows reasons not bytes

- **WHEN** the inspector or grid renders a file whose security verdict withholds it
- **THEN** no download or preview control is offered and the security reasons are shown.
