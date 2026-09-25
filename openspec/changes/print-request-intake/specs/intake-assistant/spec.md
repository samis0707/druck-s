# Spec Delta

## Purpose

Adds one explainable data-shaping hint per request that reconciles what the customer wrote with what they uploaded and what they ordered before, without touching commerce or workflow.

## ADDED Requirements

### Requirement: Single frozen data-shaping note

The system SHALL generate exactly one assistant note per request version after Send from the frozen inputs (verbatim files, verbatim free text, per-file analysis JSON, per-customer history bundle), show the identical note to customer and staff, version it with the files it refers to, and regenerate it only when the customer re-uploads before staff preview. The note SHALL be annotation only: it SHALL NOT edit files or text, move status, or send mail.

#### Scenario: Note frozen and shared

- **WHEN** a request is submitted with files, text, analysis, and history present
- **THEN** one note appears identically on customer and staff views, stays unchanged through review and approval, and a re-upload before preview replaces it as a new version.

#### Scenario: Note never acts

- **WHEN** the note observes that the text count differs from the file row count
- **THEN** it states the gap as a question and changes nothing: no file edits, no status move, no notification.

### Requirement: Content allowlist and blocklist

The note SHALL address only data shaping: counted quantities (rows, sheets, pages, files), gaps between stated and counted numbers, normalization quirks (variant spellings, empty cells, header issues), resemblance to past orders, and printability findings affecting shaping. It SHALL NEVER mention prices, discounts, conditions, delivery promises, cost estimates, or time estimates, and SHALL use past tense with sources when referencing history.

#### Scenario: Price-blind resemblance

- **WHEN** history contains past prices for a similar order
- **THEN** the note may name the past product, quantity, and date but states no price, condition, or promise about the current request.

### Requirement: Citations and graceful degradation

Every factual claim in the note SHALL cite its source (file name plus sheet or page, analysis field, or history line), and the note SHALL state plainly when history is absent or stale instead of inventing an order reference. Deterministic counts used in the note SHALL come from measured artifacts, never from model invention.

#### Scenario: Missing history disclosed

- **WHEN** no history bundle exists for the customer
- **THEN** the note states that no history was on file and limits itself to files, text, and analysis.

#### Scenario: Every number traceable

- **WHEN** the note says an xlsx has 150 rows
- **THEN** the claim links the file name, sheet, and counted rows as measured.

### Requirement: History dump ingestion

The system SHALL accept a manually provided per-customer MIS history bundle keeping the raw XML immutable and versioned by import date, with deterministic derived artifacts (compact per-order JSONL for exact fields plus short markdown summaries preserving staff-written product labels) used as the note's only history source.

#### Scenario: Bundle stored with derivations

- **WHEN** staff or an importer provides a customer XML dump
- **THEN** the raw file is retained versioned by date and the derived JSONL plus markdown are produced deterministically without model involvement for the note to read.
