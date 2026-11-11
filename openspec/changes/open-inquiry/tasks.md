# Tasks

## 1. Datenmodell
- [x] 1.1 Migration `009_open_inquiry.sql` inkl. DOWN; apply/rollback/apply verifiziert
- [x] 1.2 Drizzle-Schema, Typen (`RequestOrigin`, `InquiryContact`), Event `inquiry_confirmed`, Audit-Aktionen

## 2. Lib
- [x] 2.1 `lib/inquiry/validate.ts` (alle Fehler in einem Zug), `codes.ts` (HMAC, Versuche, einmalig)
- [x] 2.2 `lib/inquiry/intake.ts` (Entwurf, Code-Versand mit Grenzen, Bestätigung in einer Transaktion, Mails)
- [x] 2.3 `ensureProspect` in `lib/identities.ts`
- [x] 2.4 Mail-Vorlagen: Code, Eingangsbestätigung, Team-Hinweis

## 3. Schnittstelle und Seiten
- [x] 3.1 `/api/v1/products`, `/api/v1/inquiries`, `…/[id]`, `…/files`, `…/code`, `…/confirm`
- [x] 3.2 OpenAPI 3.1 (`lib/openapi.ts`, `/api/v1/openapi.json`) und Swagger unter `/api/docs`
- [x] 3.3 Seiten `/anfrage` und `/anfrage/[id]`; `/upload` leitet unbekannte Adressen weiter
- [x] 3.4 Staff: Kennzeichen „Interessent“; Kundendaten des Interessenten im Detail

## 4. Inhalte und Betrieb
- [x] 4.1 `llms.txt`, Hilfe (Fragen, Lektion „Kunden & Links“), robots.txt, Sitemap, Statistik-Pfad
- [x] 4.2 `docs/anfrage-api.md`, README, `.env.example`
- [x] 4.3 Tests: Einheit (`lib/inquiry`), Beschreibung (`tests/openapi.test.ts`), Ende zu Ende (`tests/inquiry.test.ts`)
- [ ] 4.4 Hilfe-Screenshots neu erzeugen (Filter heißt jetzt „Per Link / Interessent“)
- [ ] 4.5 Datenschutzseite um die offene Anfrage ergänzen (Firmenfreigabe)
- [ ] 4.6 Nach dem Deploy: Testfälle aus `docs/anfrage-testfaelle.md` gegen Produktion prüfen
