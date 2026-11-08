# Spec Delta

## Purpose

Partner erfahren jeden Statuswechsel ihrer Aufträge zuverlässig und prüfbar.

## ADDED Requirements

### Requirement: Outbox im Statuswechsel

The system SHALL record exactly one outbox entry per real status change of a partner request (from ≠ to, never DRAFT) in the same transaction as the event, if the partner has a webhook URL.

#### Scenario: Wiederholte Vorschau

- **WHEN** staff previews a partner request twice
- **THEN** exactly one entry for IN_REVIEW exists.

### Requirement: Signierte Zustellung mit Retry

The system SHALL POST `{ event: "status_changed", partnerRef, number, status, occurredAt[, trackingNumber, specialDeliveryDate] }` with `x-druck-s-timestamp` and `x-druck-s-signature: v1=HMAC-SHA256(secret, "${timestamp}.${body}")`, keep per-request order, retry non-2xx with backoff up to 10 attempts, give up immediately on 400/410/422, and audit given-up deliveries without logging URL or secret.

#### Scenario: Partner kurz nicht erreichbar

- **WHEN** the partner answers 503
- **THEN** the entry is retried later and delivered once the partner answers 2xx.
