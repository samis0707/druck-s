# Tasks

## 1. Datenmodell
- [x] 1.1 Migration `007_partner_api.sql` (partners, partner_webhook_outbox, requests.partner_*, origin `partner`) inkl. DOWN; apply/rollback/apply verifiziert
- [x] 1.2 Drizzle-Schema nachziehen (`lib/db/schema/app.ts`)
- [x] 1.3 Zustandsmaschine: `partner_submitted`, `withdrawn`, Status `WITHDRAWN`; Audit-Aktionen; UI-Labels

## 2. Lib
- [x] 2.1 `lib/partners/keys.ts` + `auth.ts` (`requirePartner`, Präfix-Suche, `timingSafeEqual`)
- [x] 2.2 `lib/partners/validate.ts` (handgeschriebene Validierung wie im Projekt üblich)
- [x] 2.3 `lib/partners/fetchFile.ts` (HTTPS, Host-Freigabe, keine privaten IPs, Limit, SHA-256)
- [x] 2.4 `lib/partners/intake.ts` (Anlage idempotent, Kundenbindung, Rate-Limit, Storno) + `freeText.ts`
- [x] 2.5 `lib/partners/webhook.ts` (Outbox in `appendEventTx`, Signatur, Zustellung, Backoff) + `instrumentation.ts`
- [x] 2.6 `lib/partners/secrets.ts` (AES-256-GCM, Schlüssel aus BETTER_AUTH_SECRET)

## 3. Routen und UI
- [x] 3.1 `POST /api/partner/requests`, `GET …/[ref]`, `POST …/[ref]/cancel`
- [x] 3.2 Staff-Liste/-Detail: Herkunft „Über <Partner>“, Partner-Karte, Status „Zurückgezogen“, Filter

## 4. Betrieb
- [x] 4.1 `scripts/partner-key.mjs` (create, rotate-key, rotate-webhook-secret, update, (de)activate, list) + Dockerfile
- [x] 4.2 Env in `.env.example` und Prod-Compose; Doku `app/docs/partner-api.md`, README-Link
- [ ] 4.3 Datenschutzseite um Partner-Eingang ergänzen (Firmenfreigabe)
- [ ] 4.4 Partner „seeraeuber“ in Produktion anlegen, Werte bei Seeräuber digital hinterlegen, Ende-zu-Ende gegen Staging prüfen

## 5. Verifikation
- [x] 5.1 Unit-Tests `lib/partners/partners.test.ts`
- [x] 5.2 Integrationstests `tests/partner.test.ts` (Compose-Stack)
- [x] 5.3 lint, tsc, vitest, build; Vertragsprobe mit dem echten Seeräuber-Client (GET/Storno/Webhook-Prüfung)
