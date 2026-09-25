# Design

## Context

See proposal.md Why. Current state: `app/app/layout.tsx` is a bare shell (children plus `sonner` Toaster); `components/ui/*` is 7 hand-rolled files on `rounded-md` gray styling with `lucide-react` icons; `/upload` uses a plain file input with a single fake-step `Progress`; `/staff` is a single `DataTable` with a status `<select>` and global string search over 7 columns; the staff detail renders findings as flat paragraphs. Reference behavior lives in druck-app (`Header` + mobile `Sheet`, central `Footer`, `PageHeader`, `EmptyState`, Base-UI `toast`/`sheet`/`dialog`, `AuftragPicker` dropzone shell, `FilterBar` URL-synced chips). Constraints: hard switch (no parallel systems), Door A flow unchanged, single progress, no T-machine/project/catalog/pricing, `lib/boundaries.ts` keeps client components off server modules (all data via `app/api` routes).

## Goals / Non-Goals

**Goals:**
- One Shadcn/Base-UI system with tokens that make future pages consistent by default.
- A small centralized shell so navigation and legal links never drift per page.
- A dropzone that feels modern but changes nothing about intake semantics.
- Two comparable finder views (B queue+inspector, C asset grid) over the same data so staff can pick a winner.

**Non-Goals:**
- No per-file analysis phasing, cancel/retry, or sum-bar on upload.
- No thumbnails or byte previews for files (mime icons only); withheld files never gain preview.
- No URL-synced finder filters, no bulk actions, no new APIs or migrations.

## Decisions

### 1. Base-UI Shadcn set via CLI, hard switch in one change
Adopt druck-app's primitive shape (`button` on Base-UI primitive with `rounded-2xl` variants; separate `card`, `badge`, `label`, `input`, `textarea`, `select`, `table`, `dialog`, `alert-dialog`, `tooltip`, `toast`, `alert`, `empty`, `skeleton`, `spinner`, `progress`, `sheet`, `breadcrumb`, `separator`, `popover`) plus `components.json` (`base-rhea`, HugeIcons, RSC). Replace all `sonner` call sites with `toast.add()` and all `lucide-react` icons with HugeIcons in the same change; delete the hand-rolled `Card`/`Badge` in `label.tsx` and `Empty`/`Skeleton`/`Progress` in `feedback.tsx` rather than wrapping them.
Alternative considered: gradual migration with both systems live — rejected because it recreates druck-app's two-button-world problem the plan explicitly bans.

### 2. Tokens first: radius, elevation, semantic colors
Add `--radius: 0.625rem` with derived shadcn radii, `shadow-e1/e2/e3`, and the `:root`/`.dark` oklch shadcn tokens alongside the existing brand/signal/paper/ink `@theme` palette (same values as druck-app). Migrate `globals.css` component classes to semantic utilities (`bg-card`, `border-border`, `text-muted-foreground`) and keep brand/signal tokens for status meaning only.
Alternative: keep Geist + gray styling and only swap components — rejected because Shadcn radii would render inconsistently without the token base.

### 3. Shell: root Header + PageHeader + central Footer
Mirror druck-app's structure at DAM scale: root layout mounts `Header` (brand + Upload/Requests/Staff links, session-aware actions, mobile burger `Sheet`), `Footer` (Kontakt/Impressum/Datenschutz/AGB/Widerruf), `TooltipProvider`, and Base-UI `Toaster` exactly once. Each content page uses a `Page-Shell` (`max-w-6xl mx-auto px-4 md:px-6 py-8`) plus `PageHeader` (breadcrumb + `text-2xl font-semibold tracking-tight` title + description + action slot, one primary CTA). Legal pages live under `app/(recht)/` with one shared layout and stub content.
Alternative: per-page headers/footers — rejected because reachability of legal links drifts.

### 4. Dropzone as styling + validation over the existing flow
Keep `app/upload/page.tsx` state machine (`form`/`email`/`code`) and the `POST /api/drafts` then `POST /api/drafts/[id]/files` sequence untouched. Swap only the file control for a `role=button` dashed dropzone (click + drag events, hidden input, drag-active style, keyboard Enter/Space) with a staged list (name + size + remove) and inline named rejections validated against the same rules the server enforces. Keep the single `Progress` (10/45/100) and busy button labels; no `AnalyseFortschritt`, no sum-bar, no staging-before-draft.
Alternative: full `AuftragPicker` port with immediate per-file analysis — rejected because DAM has no erkennn route and Door A must keep draft-then-OTP ordering.

### 5. Finder over existing APIs, rollup computed client-side
Reuse `GET /api/staff/requests` (extend only with trust/severity-relevant fields if already joined; no new endpoints) and `GET /api/requests/[id]` for the inspector. Compute worst-of rollup client-side (`INFECTED` > `red` > `yellow`/`SUSPICIOUS` > `green`/`CLEAN`) for a sortable column/badge; asset sorting (severity/name/size) and severity/trust/status filters are client-side over the loaded set. View B: left compact queue (existing `DataTable` narrowed to reference/product/customer/files/rollup/status/trust/age + severity dot, row selection), right inspector (metadata header + asset list with mime HugeIcon + badges + accordion findings + pinned request actions). View C: same data grouped under sticky request headers with asset cards; card activation selects the request and navigates to detail anchored at the file. Both views share one filter/sort state object and one rollup helper so behavior is identical.
Alternative: server-side rollup column + new finder API — rejected as unnecessary backend churn for a comparison prototype; can be added later if the set grows.

### 6. Actions stay request-scoped with dialog confirms
Finder actions call the existing transitions only (attach confirmation, record shipment) via the current route handlers and refresh the loaded request. State-changing actions use `alert-dialog` confirms; destructive customers-page `confirm()` calls migrate to the same. No `AktionButton`/T-event gating, no position logic.
Alternative: backoffice-style per-file actions — rejected because DAM lifecycle has no file-level transitions.

## Risks / Trade-offs

- [Risk] Hard switch touches every page at once → Mitigation: tokens + primitives land first, then shell, then pages; `pnpm verify`-style lint/typecheck/test per wave.
- [Risk] Two finder views double maintenance if both survive → Mitigation: shared filter/sort/rollup module and shared asset-row component; the toggle exists explicitly to pick one and delete the other.
- [Risk] Rollup semantics (worst-of) may surprise staff when uniformity deviations outrank printability reds → Mitigation: tooltip on the rollup badge explains precedence; ordering documented in spec scenario.
- [Risk] HugeIcons + Base-UI add bundle weight → Mitigation: no `motion` dependency for v1; icons imported per-icon.
- [Risk] Mobile two-pane finder collapses awkwardly → Mitigation: inspector becomes full-width section below queue under `md`, grid view is single column.

## Migration Plan

1. Tokens + `components.json` + CLI primitives + toast/icon swap (app still renders same routes).
2. Shell (Header/PageHeader/Footer/(recht) stubs) mounted in root layout.
3. Upload dropzone swap behind unchanged API flow.
4. Finder views B+C behind toggle on `/staff`, inspector reusing detail fetch; keep old table reachable until decision.
5. Remove loser view + old table, delete `sonner`/`lucide-react` deps.

## Open Questions

- Are mime icons sufficient for v1, or is an image-only lightweight preview wanted later (PDF rendering explicitly deferred)?
- Should the winning finder view later gain URL-synced filters for shareable triage links?
