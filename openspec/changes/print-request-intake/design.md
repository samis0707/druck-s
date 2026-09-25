# Design

## Context

Greenfield project: no code, no specs. Stack is pinned (see §8): TypeScript + Next.js (App Router + Route Handlers), Better Auth (emailOTP) + Drizzle + Postgres, shadcn/ui-style components, German UI, Hetzner S3-compatible storage, Mistral through the EU endpoint, SMTP mail, Docker Compose local and Coolify deploy. See proposal.md Why for motivation and `specs/*/spec.md` for behavior contracts. Specs stay provider-agnostic; this document names the concrete providers.

## Goals / Non-Goals

**Goals:**

- One request pipeline fed by two intake doors with a single trust annotation.
- Status that is always computable from the event log, with illegal transitions structurally impossible.
- Upload that stays open (generic form, staff links) while money-moments stay closed (session plus fresh OTP).
- Analysis and assistant outputs that are explainable, cited, and frozen.
- One Docker image plus managed Postgres deployable on Coolify (EU) with local parity via compose profiles.

**Non-Goals:**

- MIS integration beyond manual history-bundle import; inbound mail parsing; payment handling.
- Visual diffing, duplicate detection, or placeholder merging.

## Decisions

### 1. Event log as status source of truth

Request row carries a cached status plus append-only event log (`submitted`, `otp_verified`, `link_consumed`, `previewed`, `confirmation_attached`, `resent`, `change_requested`, `approved`, `shipped`, plus identity/link lifecycle events). Every transition is a guarded append: the transition table from `print-request` and `request-approval` specs is enforced in one place; any handler attempting an illegal move fails without side effects. Cached status is recomputed from the log, never written directly, so "no status button" holds by construction rather than convention. Alternative (writable status column with UI hiding the control) was rejected because it reintroduces the split-brain the exploration ruled out.

### 2. Passwordless via Better Auth (emailOTP), no custom OTP/session code

OTP issuance/verification and sessions come from Better Auth (`better-auth/minimal`, `emailOTP`, `admin`, `nextCookies` last). Config mirrors the locked spec behavior: `expiresIn: 600` (10 min), `allowedAttempts: 5`, `otpLength: 6`, `storeOTP: "hashed"`, sessions expire after 24h. `disableSignUp: true`: no foreign email can self-provision — staff onboarding (allowlist, prospect maturation) stays the only door in, enforced by creating users through staff flows only. Purpose separation Send vs. Approve is preserved: login/Send verification uses sign-in OTPs, approval uses a fresh verification OTP scoped to a purpose-bound identifier (`identity:request:approve`), single-use, verified immediately before the commit. Magic links survive only as staff-issued upload capabilities, never as identity. The custom `otp_challenges`/`sessions` tables and hand-rolled cookie code are removed; Better Auth sets `Secure` cookies only over HTTPS by default, which structurally prevents the dropped-session-over-HTTP failure seen in local testing. Alternative (keeping the custom OTP/session implementation) was rejected after that exact bug plus the maintenance burden; passwords/TOTP remain deferred as before.

### 3. One-time staff links as upload capabilities

Link token is 128-bit random, stored hashed, bound to one email record with creator and timestamps. Anonymous draft staging under the link may stage bytes, but Submit consumes the link exactly once and binds the resulting request as VOUCHED; expiry (7 days), revocation, and post-consumption opens all resolve to an explanatory dead-link page. Submit-time consumption (not first-byte) protects against dropped connections eating the link. "Forgot a file" after Submit intentionally needs a new link or a login upload, preserving one-link-equals-one-request auditability.

### 4. Quarantine-first, two-tier analysis

All bytes land in quarantine: MIME-versus-extension check plus malware signature scan run before any staff preview or download, with INFECTED files withheld but logged. Cheap checks (counts, sizes, readability) run pre-verification for instant feedback; expensive work (full preflight JSON, uniformity pass, assistant note with history) runs only after the request is RECEIVED, bounding anonymous compute abuse. Per-file-type analyzer depth (deep PDF, medium raster, shallow Office) is encoded in the report schema so customer and staff renderings share one truth. Reports never gate: severity travels with the file, production may proceed regardless.

### 5. Confirmation bundles as versioned mail triggers

Attaching confirmation plus print files is the send action: it versions the bundle, flips status, and enqueues exactly one outbound mail (PDFs attached and linked, request ref, both decision actions). Change-request is a mailto handoff that only annotates; replacement requires resend confirmation with optional reason, bumps the version, retains history, and mails the delta. Approval is idempotent on bundle version, so double clicks and stale links are safe. No inbound mail is read in v1, which is what keeps the mail model tractable.

### 6. Assistant note as frozen annotation over measured facts

Deterministic measurers (row, sheet, page, and preflight counters) produce the numbers; the model only words the gaps and resemblance against the history bundle, with every claim carrying a source pointer. The note is generated once per request version, stored beside the inputs, shown identically to both sides, and regenerated only on pre-preview re-upload. Content filter is allowlist-shaped (counts, gaps, normalization, resemblance, shaping-relevant printability) with prices, conditions, estimates, edits, and transitions structurally excluded from the prompt context, not just instructed away. Raw customer XML is retained versioned by import date; derived JSONL plus markdown are deterministic transforms and the note's only history source.

### 7. Logical deployment shape

Next.js application service (App Router UI plus `app/api` Route Handlers, see §8) plus Postgres for requests, events, identities, links, sessions, reports, bundles, and notes; S3-compatible object storage for originals (immutable) and derivatives; in-app job handling for scan, preflight, and note generation; outbound-only SMTP mail sender. History import is a file drop plus deterministic transform job. Local compose adds MinIO and Mailpit as dev-only services; production compose targets Coolify with managed Postgres.

### 8. Pinned stack

- **Language and app:** TypeScript throughout. Next.js App Router: customer portal and staff backoffice as server/client components, backend exclusively as Route Handlers under `app/api/**/route.ts` plus the Better Auth handler at `app/api/auth/[...all]/route.ts`. Hard boundary: client code never imports DB, storage, mail, or Mistral clients; every mutation and every data read goes through a Route Handler. A separate Express/Fastify backend was considered and rejected: one Docker image keeps the Coolify deploy to a single service plus Postgres.
- **Auth:** Better Auth (`better-auth/minimal`) with `emailOTP`, `admin` (roles: customer/staff), `nextCookies()` last. Drizzle adapter over the existing `pg` Pool — no second database driver, no Kysely. Better Auth owns `user`/`session`/`account`/`verification` tables; app tables (`identities` roles/status, requests, links, reports, bundles, notes, history, audit) live in the same Drizzle schema and reference Better Auth users. Migrations via drizzle-kit; the hand-written SQL runner is retired. Existing local sessions/OTPs are voided by the migration (test data only).
- **UI:** German throughout. Token theme (Tailwind 4 `@theme`: brand/signal/surface/ink/semantic tokens; firm colors defaulted, need sign-off) and an expanded component library: button, input, label, textarea, select, table, badge, card (done) plus dialog, toast, empty, skeleton, progress. Customer file-explorer views use the data-table pattern (TanStack Table: sort, filter, pagination) plus command-palette search across requests, files, and types; the minimal staff backoffice reuses the same components with staff wording on the same states. Mail templates stay typed string templates for v1 (react-email optional later).
- **Database:** Postgres (standard `postgres` image, version pinned in compose). Migrations versioned in repo; local and production share the migration path.
- **Object storage:** Hetzner Object Storage (EU location, e.g. fsn1) via AWS SDK v3 `S3Client` with custom endpoint and standard access-key credentials. Local parity via MinIO (`quay.io/minio/minio`, S3 API on 9000, console on 9001) with endpoint, path-style addressing, and dummy region swapped by env. Caveat carried from research: Hetzner addressing style (virtual-hosted vs path-style) is disputed in community reports — verify `forcePathStyle` behavior against the real bucket during implementation and record the working setting.
- **AI provider:** Mistral AI through the EU endpoint (`https://api.eu.mistral.ai/v1`, EU data residency) via the official `@mistralai/mistralai` client. Model pinned to `mistral-medium-3-5-26-04` (the exact API id behind the "medium 3.5" name; rolling alias `mistral-medium-latest` exists but is deliberately not used). Structured JSON output for the note's machine-checkable layer; model repins happen on purpose, never silently. Assumption recorded: per-token billing applies, no free tier for this model.
- **Mail:** SMTP via env-configured relay (host, port, TLS, credentials all env, no real delivery outside prod config). Local testing via Mailpit (`axllent/mailpit`, SMTP 1025, web UI 8025); every template verifiable in the Mailpit UI during development.
- **Deploy:** Docker Compose as the deploy artifact, Coolify on an EU (Hetzner) server as primary target; an EU-SaaS fallback is evaluated in the deploy task if self-hosting is dropped. Local compose profile includes Postgres, MinIO, and Mailpit; production profile wires the app to managed Postgres, Hetzner storage, and real SMTP.

## Risks / Trade-offs

- [Generic form invites junk compute] → two-tier analysis, rate limits, short unverified TTL with auto-delete.
- [VOUCHED uploads carry unverified identity] → quarantine plus scan before preview, VOUCHED flag end to end, approval impossible without onboarding plus fresh OTP.
- [Inbox takeover accepted out of scope] → instant receipts to customer plus staff notice, full audit trail, short code/session lifetimes; attacker action is noisy and staff can hold production on suspicion.
- [Assistant hallucinates order numbers or prices] → measured-facts-only numbers, mandatory citations, price-blind context, frozen note, human commits only.
- [Resend mail fatigue on many versions] → versions retained in-app so mail stays the notifier, not the archive; reason field keeps each resend intelligible.
- [Green preflight read as guarantee] → customer wording fixed as first indication with staff check pending; severity vocabulary shared and documented.
- [Better Auth version drift] → version pinned in package.json; repins are deliberate edits, verified by re-running the OTP/session/approval suites.
- [Coolify TLS termination] → record `trustedProxies` for the Coolify/Traefik hop at deploy time so rate-limit IPs are real; local HTTP stays unproxied.
- [Firm design sign-off outstanding] → default token theme ships; brand colors and German copy need firm review before first customer send (task 9.6).
- [Mistral model id drifts] → pinned exact id plus EU endpoint recorded here; repins are deliberate edits to config, verified by re-running the assistant checks.
- [Local/prod storage parity] → MinIO locally, Hetzner in prod, both behind the same S3 client abstraction; integration test uploads against both before first customer send.

## Migration Plan

No migration: greenfield, no data to move. Rollout order that de-risks: identities and intake doors first, then analysis pipeline, then approval and shipped flow, then assistant note behind its content filter, with outbound mail templates reviewed before first customer send. Rollback is feature-flag or route-level (disable assistant note, disable Door B link creation) without touching stored requests.

## Open Questions

- Exact TTL and session durations (proposed: OTP 10 min, unverified draft 30-60 min, staff link 7 days, session 24h) can be tuned in implementation without changing specs.
- Mail template copy and attachment size limits need prepress review during implementation.
- History-bundle size guard (when a customer exceeds prompt-fit orders and needs retrieval scoping) is deferred until real dumps are measured.
- EU-SaaS fallback choice (if Coolify self-hosting is dropped) is deferred to the deploy task, which evaluates and records it.
