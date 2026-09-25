# Proposal

## Why

Customers send print assets and order intent mixed together via email (PDF with `<<placeholders>>`, xlsx row data, free-text math like "130 total"). Email loses structure, has attachment limits, and gives neither side a first signal of printability. A minimal intake that structures the container (not the content), adds a preflight nudge, and derives status from work done anyway replaces the worst of email with the smallest new burden on customers and staff.

## What Changes

- Generic upload portal: any file mix (pdf, docx, xlsx, images) plus a small product-hint dropdown of most-common items plus a first-class free-text field carrying real intent. One upload procedure equals one print request; the DAM never infers order items (campaign-safe, flexibility preserved).
- Dual intake doors merging into one pipeline: Door A (generic URL + email/OTP verification at Send) for onboarded customers; Door B (staff-generated one-time upload links, 7-day expiry, upload-only, consumed on Submit) for prospects/phone leads. Unverified uploads are quarantined, scanned, and auto-expire.
- Per-file analysis service with one shared report: printability (page size/count, bleed, color mode, font embedding, image resolution), multi-page uniformity (size/bleed consistency, deviating pages listed), security (malware signature scan, PDF JS/embedded-file flags, Office macro/OLE flags, MIME mismatch). Nudge, never gate; infected files hidden from staff.
- Event-sourced request states with no status buttons: Received (verified/vouched) -> In Review (first staff preview) -> Waiting Approval (confirmation + print files attached, tool mails customer) -> In Progress (session + fresh email-OTP approval, receipt mailed) -> Shipped (invoice + tracking number or special-delivery date). Change requests are a mailto handoff with auto request ref; status stays Waiting Approval; replacing docs prompts resend confirmation with reason and bumps version. Done/paid explicitly deferred.
- Passwordless access: staff-provisioned emails (prospect matures to customer on same record), magic-link-free login via email + OTP codes (short-lived, single-use, rate-limited, revocable sessions). Approval always requires live session plus fresh OTP. Inbox takeover out of scope; instant approval receipt to customer plus staff notice is the detective backstop.
- One frozen AI first note per request after Send: data-shaping only (counts, gaps between note and files, normalization quirks, resemblance to past orders with citations). No prices, conditions, edits, or transitions. History comes from a manually provided per-customer MIS dump (raw XML kept, derived JSONL + markdown summary); note cites sources and degrades gracefully when history is absent.

## Capabilities

### New Capabilities

- `print-request`: request container, dual intake doors, trust annotations (verified/vouched), event-sourced lifecycle, confirmation versioning, shipped bundle guards.
- `print-analysis`: per-file printability, uniformity, and security checks; shared customer/staff report rendering; quarantine and severity semantics.
- `request-approval`: confirmation attach-to-mail flow, change-request mailto handoff with stay-in-Waiting semantics, resend-with-reason versioning, OTP-gated approval, approval receipts, shipped transition.
- `customer-access`: staff provisioning (prospect/customer lifecycle), generic URL + OTP login, one-time staff upload links (bind, consume, expire, revoke), sessions, rate limits, audit.
- `intake-assistant`: single frozen post-Send data-shaping note from files plus free text plus history dump; allowlist/blocklist content rules; citation and no-action guarantees; dump ingestion format.

### Modified Capabilities

None — greenfield project, no existing specs.

## Impact

- New web surface: public upload form, request status views (customer wording vs staff wording on same states), staff triage/preview/download, confirmation attach, approval screens, shipped bundle upload.
- New services: file quarantine + malware scan, preflight analyzer per file type, notification mailer (outbound only: approval requests, approvals, resends, receipts), OTP issuer/verifier, one-time link issuer, history-bundle store + transform (XML kept, JSONL/MD derived).
- MIS stays system of record for orders, pricing, and production; this tool is an intake and proof companion with no inbound mail parsing, no live MIS API, and no payment handling in v1.
