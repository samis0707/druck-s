# Proposal

## Why

The DAM intake flow works (Door A + Door B, linear request lifecycle, per-file analysis), but the UI lags behind the reference app (druck-app): no shared shell, hand-rolled UI primitives instead of Shadcn, a plain file input instead of a dropzone, and a thin staff table that hides the asset-level analysis staff need for triage. Staff need an asset-forward "finder" without losing request metadata, and the app needs header/navigation/footer/imprint like any public-facing portal.

## What Changes

- **BREAKING** Hard switch to the Shadcn/Base-UI system: replace `sonner` toasts with Base-UI `toast`, `lucide-react` icons with HugeIcons, and hand-rolled `Card`/`Badge`/`Empty`/`Skeleton`/`Progress` with CLI-generated Shadcn components; add missing primitives (`card`, `badge`, `skeleton`, `spinner`, `progress`, `dialog`, `alert-dialog`, `tooltip`, `toast`, `alert`, `empty`, `input`, `textarea`, `select`, `sheet`, `breadcrumb`, `separator`, `popover`). Add `components.json`, `--radius` + `shadow-e1/e2/e3` tokens, and semantic color usage. Remove dual button/badge worlds.
- Add a small centralized shell: root `Header` (brand + Upload / Requests / Staff, session-aware, mobile `Sheet` burger), per-page `PageHeader` (breadcrumb + title + description + actions), central `Footer` (Kontakt, Impressum, Datenschutz, AGB, Widerruf) mounted once in the root layout, and an `(recht)` route group with shared layout for the four legal pages plus Kontakt.
- Replace the plain file input on `/upload` with a dropzone-styled picker that keeps Door A semantics and the single `Progress` indicator (10/45/100). Client validation reuses DAM `lib/boundaries.ts`; no silent staging, no anonymous drop-off adoption, no per-file sum-bar, no `AnalyseFortschritt` phase machine.
- Rework staff triage into a DAM-sized "finder": build **both** View B (queue + inspector: compact request list left, selected-request asset inspector right) and View C (asset-first grid grouped by request with sticky request headers) behind a view toggle so staff can compare and one can be kept. Add an analysis rollup column (worst-of severity, sortable), severity/trust filters, asset sorting (severity/name/size) inside the inspector, and per-file findings accordion. No T-machine, no project/catalog/pricing/payment logic.
- Keep the request lifecycle untouched (6 statuses, event ledger, VERIFIED/VOUCHED trust, INFECTED withholding).

## Capabilities

### New Capabilities
- `app-shell`: shared layout shell — header/nav, page header, footer, legal routes, toast provider, design tokens and Shadcn primitive set.
- `upload-dropzone`: Door A file picker as dropzone with drag+drop, validation messaging, and single progress — same draft/OTP flow.
- `staff-finder`: staff triage as finder — queue+inspector view, asset-grid view, analysis rollup, filters/sorting, asset inspection with findings, row actions.

### Modified Capabilities
- None (no durable specs exist yet; request lifecycle and analysis behavior are unchanged).

## Impact

- Affected code: `app/app/layout.tsx`, `app/app/page.tsx`, `app/app/upload/page.tsx`, `app/app/staff/**`, `app/app/requests/**`, `app/components/ui/**`, `app/app/globals.css`, new `app/app/(recht)/**` and shell components.
- Dependencies: adds `@base-ui/react`, HugeIcons, `shadcn` CLI-managed components, `tw-animate-css`-adjacent animation tokens as needed; removes `sonner` and `lucide-react` usage.
- Systems: no API contract changes, no DB migrations, no worker/outbox, no auth flow changes; purely presentational plus client-side filtering/sorting.
