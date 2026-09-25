# Tasks

## 1. Design tokens and Shadcn primitive set

- [x] 1.1 Add radius, elevation, and shadcn oklch tokens to `app/app/globals.css` and verify tokens resolve in a scratch page with no hardcoded palette values
- [x] 1.2 Add `components.json` and CLI-generate the Shadcn/Base-UI set (card, badge, skeleton, spinner, progress, dialog, alert-dialog, tooltip, toast, alert, empty, input, textarea, select, sheet, breadcrumb, separator, popover) and verify each file exists under `app/components/ui`
- [x] 1.3 Hard-switch toasts from `sonner` to Base-UI `toast.add()` on every call site and verify success and error toasts appear once via the single root provider
- [x] 1.4 Hard-switch icons from `lucide-react` to HugeIcons on every call site and verify no `lucide-react` imports remain via grep
- [x] 1.5 Remove hand-rolled `Card`/`Badge`/`Empty`/`Skeleton`/`Progress` variants and migrate all usages to the shared primitives, then verify typecheck plus unit tests pass

## 2. Centralized shell and legal routes

- [x] 2.1 Implement root `Header` with brand, primary nav, session actions, and mobile burger `Sheet`, then verify desktop active-link state and mobile sheet navigation by manual route walk
- [x] 2.2 Implement shared `PageHeader` plus page-shell convention and apply it to home, upload, requests, and staff pages, then verify breadcrumb, title, description, and single-CTA layout on each
- [x] 2.3 Implement central `Footer` mounted once in the root layout and the `(recht)` route group (Kontakt, Impressum, Datenschutz, AGB, Widerruf) with shared layout, then verify all five links work from every top-level page

## 3. Upload dropzone keeping Door A semantics

- [x] 3.1 Replace the plain file input on `/upload` with a dropzone surface (click plus drag-and-drop, staged list with remove, keyboard operable) and verify multi-file staging and removal without network calls
- [x] 3.2 Wire client validation with named inline rejections against server-enforced type and size rules and verify a mixed valid plus invalid selection keeps the valid files staged
- [x] 3.3 Keep the single overall `Progress` plus busy button labels across the unchanged draft, file upload, email OTP, and code verify sequence, then verify an end-to-end Door A upload reaches the request page

## 4. Staff finder views B and C

- [x] 4.1 Add the shared rollup helper (worst-of security plus printability) with tooltip precedence text and verify unit tests cover INFECTED, red, yellow, and clean ordering
- [x] 4.2 Add the shared finder filter and sort state (severity attention, trust, status, rollup, file count, age) plus mime-icon asset row component, then verify filtering and sorting behave identically for both views in component tests
- [x] 4.3 Build View B queue plus inspector reusing the existing staff list and request detail fetches, with asset sorting, findings accordion, and the frozen assistant note (same bullets and sources as the customer view, read-only, with a graceful empty state), then verify selecting a request keeps queue filters visible while showing its assets, note, and actions
- [x] 4.4 Build View C asset-first grid with sticky request headers and card-to-detail navigation, then verify every card renders under its request header with rollup context
- [x] 4.5 Add the B/C view toggle with session persistence and request-scoped actions (open detail, attach confirmation, record shipment) using dialog confirms, then verify both views act on the same filtered set and withheld files offer no download or preview

## 5. Verification and cleanup decision

- [x] 5.1 Run lint, typecheck, unit, component, and integration suites plus a manual German-copy and keyboard pass, and verify all green with no parallel toast, icon, or button systems remaining
- [x] 5.2 Record the keep-or-drop decision for View B versus View C with staff feedback and verify the losing view plus the legacy table are removed in a follow-up cleanup task

## Entscheidung 5.2 (2026-09-24)

Beide Sichten (B Liste+Details, C Assets) bleiben hinter der Session-Umschaltung vergleichbar; die Legacy-Tabelle ist bereits durch den Finder ersetzt. Die Streich-Entscheidung fällt nach Staff-Feedback in einem Follow-up (`/staff`-Bereinigung), nicht in diesem Change.
