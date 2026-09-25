# Tasks

## 1. Project setup

- [x] 1.1 Scaffold TypeScript Next.js app (App Router) with Postgres client, S3 client, and SMTP mailer wired by env config, and verify a clean boot plus migration run succeeds.
- [x] 1.2 Create module skeleton (requests, identities, links, sessions, analysis, approval, assistant, history, mail, audit) behind `app/api` Route Handlers with no DB/storage clients imported from client components, and verify the app starts with health check green.
- [x] 1.3 Define base data model (users/prospects, requests, events, files, links, sessions, OTP challenges, reports, bundles, notes, history imports) and verify migrations apply and roll back cleanly.
- [x] 1.4 Provide Docker Compose files (local profile with Postgres, MinIO, Mailpit; production profile without dev services) and verify the full local stack boots and the app reaches each service.

## 2. Event-sourced request core

- [x] 2.1 Implement append-only event log with guarded transition table (Received, In Review, Waiting Approval, In Progress, Shipped) and verify illegal transitions fail without side effects in unit tests.
- [x] 2.2 Implement request container (file set plus hint dropdown plus verbatim free text, no order-item inference) and verify a 5-file campaign upload persists as exactly one request with byte-identical content.
- [x] 2.3 Implement staff-only preview trigger (first authenticated staff preview moves Received to In Review) and verify customer views and bot fetches do not trigger it.
- [x] 2.4 Implement confirmation bundle versioning (v1, v2 retained viewable) and verify replacement publishes a new version while keeping prior versions readable.

## 3. Dual intake doors

- [x] 3.1 Build generic upload form with shadcn/ui (hint dropdown, reference, free text, multi-file) with cheap pre-send checks and verify draft staging works with no session required.
- [x] 3.2 Implement Door A Send plus email OTP verification (allowlisted emails only, short-lived single-use codes, unverified TTL with auto-delete) and verify valid codes bind drafts to customers while unknown emails are refused.
- [x] 3.3 Implement staff one-time upload links (hashed tokens, email binding, consume-on-Submit, 7-day expiry, revoke) and verify a consumed link is immediately dead and an expired link shows guidance.
- [x] 3.4 Implement prospect-to-customer maturation preserving request history and verify vouched requests follow the record across conversion.

## 4. Analysis pipeline

- [x] 4.1 Implement quarantine plus malware and MIME screening with INFECTED withholding against S3-backed storage (MinIO locally, Hetzner in prod, same AWS SDK v3 client) and verify an infected fixture is hidden from staff while the uploader is told to re-export.
- [x] 4.2 Implement PDF analyzer (size/count, bleed/trim, color mode, font embedding, resolution) and verify a mixed fixture reports per-page findings with deviating pages identified.
- [x] 4.3 Implement raster and Office analyzers (dimensions/DPI; readability plus page/sheet counts) and verify Office files report shallow results flagged for manual check.
- [x] 4.4 Implement uniformity check (size/bleed/color consistency with deviating pages) without visual judgments and verify an intentional mixed-size file reports neutrally.
- [x] 4.5 Implement shared report storage with customer and staff renderings and verify both views read the same report and red severity never blocks Send or approval.

## 5. Approval and shipping flow

- [x] 5.1 Implement attach-to-send (confirmation plus print files attach moves to Waiting Approval and enqueues exactly one mail with PDFs, ref, and both actions) and verify mail content and idempotent attach behavior.
- [x] 5.2 Implement change-request mailto handoff (prefilled ref, stay in Waiting Approval with logged intent) and verify abandoned drafts change nothing.
- [x] 5.3 Implement replace-with-reason resend (version bump, retained history, resend mail stating version and reason) and verify v1 stays viewable and v2 becomes current.
- [x] 5.4 Implement OTP-gated approval (live session plus fresh single-use code, idempotent, receipts to customer and notice to staff) and verify reused or expired codes are rejected with status unchanged.
- [x] 5.5 Implement shipped bundle (invoice plus tracking number or special-delivery date, valid only from In Progress) and verify early-bundle uploads are rejected without status change.

## 6. Access, sessions, and audit

- [x] 6.1 Implement OTP issuance and verification with rate limiting, cooldown, and audit logging and verify five wrong guesses lock the challenge.
- [x] 6.2 Implement short-lived revocable sessions with staff disable taking effect immediately and verify disabled users lose view and approve rights while history persists.
- [x] 6.3 Implement audit trail for identity-relevant events (verify, view, download, approve, link create/consume/revoke, disable) and verify entries carry actor, timestamp, and client metadata.
- [x] 6.4 Build customer file-explorer views and minimal staff backoffice with shadcn/ui data-table plus command search (search and order by request, file, type) and verify both roles see the same states in their own wording.

## 7. Intake assistant and history

- [x] 7.1 Implement history-bundle import (raw XML retained versioned by date plus deterministic JSONL and markdown derivations) and verify derivations contain no model involvement.
- [x] 7.2 Implement deterministic measurers (rows, sheets, pages, counts) feeding the note and verify every produced number matches a measured artifact.
- [x] 7.3 Implement single frozen note generation via Mistral (`@mistralai/mistralai`, model `mistral-medium-3-5-26-04`, EU endpoint, structured JSON output) identical both sides, versioned with inputs, price-blind, cited, regenerating only on pre-preview re-upload, and verify the note performs no edits, transitions, or sends.
- [x] 7.4 Implement content filter and citation checks (allowlist shaping topics only, no prices/conditions/estimates, every claim sourced, missing history disclosed) and verify violating drafts are rejected before display.

## 8. Mail, deploy, and rollout verification

- [x] 8.1 Implement outbound-only SMTP mailer (env-configured relay; Mailpit locally) with templates (approval request, resend with reason, approval receipt, staff notice, OTP codes) and verify each template renders with correct refs, versions, and attachments in the Mailpit UI.
- [x] 8.2 Run end-to-end verification across both doors (generic OTP intake and staff-link prospect intake through preview, approval, and shipped) and verify statuses, mails, versions, and audit entries match the specs.
- [x] 8.3 Review mail copy and applied durations (OTP lifetime, unverified TTL, link 7 days, session length) with the firm and verify chosen values are recorded in configuration.
- [ ] 8.4 Deploy via Docker Compose on Coolify (EU server) to staging, evaluate the EU-SaaS fallback only if self-hosting is dropped, and verify the staged app talks to Postgres, Hetzner storage, SMTP, and Mistral EU successfully.

## 9. Better-Auth-Migration (entschieden: Deutsch, Drizzle, Custom-Gastflow)

- [x] 9.1 Install `better-auth`, `drizzle-orm`, `drizzle-kit` (pg bleibt darunter) und verifiziere sauberen Boot mit Better-Auth-Tabellen (`user`, `session`, `account`, `verification`).
- [x] 9.2 Portiere das App-Schema nach Drizzle (user mit Rolle/Status/Firma, requests, events, files, links, reports, bundles, shipments, notes, history, audit); drizzle-kit generiert das SQL, der bestehende Runner mit DOWN-Support führt es aus (drizzle-kit migrate hätte keinen Rollback); verifiziere apply plus rollback.
- [x] 9.3 Baue die Auth-Instanz (`emailOTP`: expiresIn 600, allowedAttempts 5, hashed, disableSignUp; `admin`-Rollen customer/staff; `nextCookies()` zuletzt) plus `app/api/auth/[...all]`-Route und verifiziere Sign-in-OTP gegen Mailpit.
- [x] 9.4 Ersetze OTP-/Session-Libs und Guards (Send-Verify und Approve als zweckgebundene Verification-OTPs, Sessions via `auth.api.getSession`, Allowlist-Onboarding bleibt) und verifiziere Lockout, Single-Use, frischen Approve-Code und sofortigen Disable.
- [x] 9.5 Stelle UI auf Deutsch um (Token-Theme, Dialog/Toast/Empty/Skeleton/Progress, Datei-Explorer mit Suche/Sortierung, Backoffice) und verifiziere Build plus beide Rollen-Sichten mit eigenem Wording.
- [ ] 9.6 Hole Firmenfreigabe für Brand-Farben und deutsche Mail-/UI-Texte ein und hinterlege `trustedProxies` für den Coolify/Traefik-Hop; verifiziere volle Suite plus Mailpit-Reverify.
