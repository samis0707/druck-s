# Design

## Context

See proposal.md Why. Current state: upload form asks product → reference → text → files; request detail shows results inline only; `productHint` renders as raw slug; header nav contains Staff; no standalone customer login or account page (only embedded OTP inside `requests/[id]`); finder splits queue/inspector columns even with no selection; no file previews; identities list has no dump info; staff detail renders findings flat and never the assistant note. Constraints: `lib/boundaries.ts` (client only via `app/api`), event-ledger lifecycle untouched, INFECTED files never served.

## Goals / Non-Goals

**Goals:**
- Upload in user order without touching intake semantics or validation.
- One result moment after send that tolerates async analysis.
- Agent category as validated first-class note data, German labels everywhere.
- Customer self-service (login + account) reusing existing auth APIs.
- Finder and detail as visual upgrades over existing endpoints plus two small read APIs.

**Non-Goals:**
- No lifecycle, pricing, catalog, or payment changes.
- No staff editing of category suggestion (read-only display).
- No full PDF viewer (native embed only); no video/audio previews.

## Decisions

### 1. Upload-Reihenfolge ist reine JSX-Umstellung
Blöcke in `upload/page.tsx` und `u/[token]/page.tsx` umsortieren (Dropzone → Text → Produkt → Referenz mit „optional"-Label). State, `send()`/`submit()` und Validierung bleiben unangetastet.
Alternative: Schritt-Assistent — verworfen, ein Scroll-Formular genügt.

### 2. Ergebnis-Dialog mit sessionStorage-Flag und Polling
Upload-Seite setzt vor `router.push` ein `sessionStorage`-Flag (`dam-neuer-auftrag=<id>`); die Detailseite öffnet den `Dialog` genau einmal, wenn Flag und ID passen, und löscht das Flag. Offener Dialog pollt `GET /api/requests/[id]` alle 3 s (max. 2 min) bis Reports + Note vollständig sind; Timeout → Hinweis auf Detailseite. Kein neuer Endpoint, kein WebSocket.
Alternative: Server-Sent Events — verworfen, Polling genügt für einen Einmal-Moment.

### 3. Kategorie als Note-Spalte mit Migration
Neue nullable Spalte `suggested_category` auf `assistant_notes` (Migration, kein Rewrite bestehender Zeilen). Prompt ergänzt: genau eine Kategorie aus der Hint-Werteliste vorschlagen; Validierung wie Bullets (ein Retry, danach null statt invalid). Anzeige beidseitig neben dem gewählten Hint. Deutsch-Mapping via `PRODUCT_HINTS`-Lookup in `lib/ui-text.ts` (client-safe, bereits importiert) und Ersetzen aller Rohwert-Renderings.
Alternative: Vorschlag in Bullets kodieren — verworfen, nicht filter-/darstellbar.

### 4. Nav/Footer-Tausch, Konto-Seiten auf Bestand-APIs
Header: Links Upload, Aufträge, Konto (`/login` bzw. `/konto`); Staff-Link raus (Desktop + Sheet). Footer: Staff-Login dazu. `/login` nutzt `POST /api/login/otp|verify` (identischer Flow wie eingebetteter Login, als Seite). `/konto` liest neuen `GET /api/account` (eigene Identität aus Session: E-Mail, Name, Firma, Status) plus bestehenden `GET /api/requests`; anonym → Redirect `/login`.
Alternative: Better-Auth-Client-Session im Header — verworfen, serverseitige Guards genügen.

### 5. Finder-Breite per bedingtem Grid
Grid `lg:grid-cols-[7fr_5fr]` nur rendern, wenn Auswahl existiert; sonst volle Breite. Kein State-Umbau, nur Layout-Branch.
Alternative: Overlay-Drawer — verworfen, Spalte ist bei Auswahl gewünscht.

### 6. Vorschau über bestehende Datei-Endpoints
Bild → `<img>`, PDF → `<embed>` mit den vorhandenen authentifizierten Routen (Cookies werden mitgesendet); sonst Icon+Meta-Fallback. INFECTED → kein Preview-Element, nur Gründe (Server wirft ohnehin `WithheldError`). Komponente einmal bauen (`components/finder/FilePreview.tsx`), in Inspektor und Staff-Detail wiederverwenden.
Alternative: eigene Preview-Thumbnails serverseitig — verworfen, Mehraufwand ohne Nutzen.

### 7. Dump-Sichtbarkeit ohne neue Speicher-Logik
`GET /api/staff/identities` um neueste Import-Metadaten je Identität erweitern (Datum, Auftragsanzahl, vorhanden ja/nein; ein aggregierender Join, kein N+1). Inhalt: neuer Staff-Endpoint liefert das abgeleitete Markdown (gekürzt + vollständig auf Abruf) via bestehendem `latestHistoryImport`; XML roh bleibt außen vor.
Alternative: Dump-Bytes an Liste hängen — verworfen, zu groß und falsches Format.

### 8. Staff-Detail: Timeline aus Status ableiten
Stufen `RECEIVED → IN_REVIEW → WAITING_APPROVAL → IN_PROGRESS → SHIPPED` aus `STATUSES`/`TRANSITIONS`; Index aus aktuellem Status, Rest als verbleibend. Note-Card identisch zur Kundenansicht (API liefert `note` bereits). Insights gruppieren vorhandene Report-Felder je Datei unter deren Vorschau.
Alternative: Timeline aus Events berechnen — verworfen, Status reicht für lineare Anzeige.

## Risks / Trade-offs

- [Risk] Polling verpasst langsame Notes (Mistral-Ausfall) → Mitigation: Timeout-Text plus Detailseite zeigt alles sobald vorhanden.
- [Risk] Kategorie-Vorschlag halluziniert trotz Validierung → Mitigation: Allowlist-Check + Retry + null-Fallback, Anzeige als Vorschlag nicht Fakt.
- [Risk] PDF-Embed groß/schwer bei 100-MB-Dateien → Mitigation: Embed lädt nativ progressiv; Fallback-Link zum Download bleibt.
- [Risk] Neue `suggested_category`-Spalte vs. alte Notes → Mitigation: nullable, alte Zeilen zeigen „kein Vorschlag".
- [Risk] `/api/account` legt Identitätsfelder offen → Mitigation: nur eigene Session-Identität, kein Fremdzugriff.

## Migration Plan

1. DB-Migration `suggested_category` (nullable, rückwärtskompatibel).
2. UI-Änderungen deployen (Upload, Dialog, Nav, Konto, Finder, Preview, Detail).
3. Rollback: UI-Revert genügt; Spalte darf bleiben (nullable, ungenutzt).

## Open Questions

- Soll der Kategorie-Vorschlag später vom Staff übernehmbar sein (Hint korrigieren)? Zurückgestellt — Anzeige ist read-only.
- PDF-Vorschau nur erste Seite vs. ganzes Dokument? Nativ-Embed zeigt alles; bei Bedarf einschränkbar.
