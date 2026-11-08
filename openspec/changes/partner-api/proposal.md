# Proposal

## Why

Seeräuber digital (Gemeindeblatt-/Vereinsplattform) vermittelt Druckaufträge von Gemeinschaften an DMP. Heute gehen sie per E-Mail ein und werden in druck-s/Pagina abgetippt; Status meldet niemand zurück. druck-s hat keine maschinelle Schnittstelle: alle Routen hängen an Browser-Session, OTP oder Einmal-Link. Der Client auf Seeräuber-Seite ist fertig (`src/lib/druck/druck-s.ts`) und definiert den Vertrag.

## What Changes

- Dritte Tür in dieselbe Pipeline: `origin = 'partner'`, `trust = VOUCHED`, Kunde über `prospect_email` bzw. bestehendes Kundenkonto. Analyse, Virenscan, KI-Notiz, Auftragsbestätigung, OTP-Freigabe, Versand bleiben unverändert.
- Partner mit API-Key (nur SHA-256-Hash gespeichert), erlaubten Datei-Hosts, Webhook-URL und verschlüsseltem Webhook-Secret (Migration 007, Skript `scripts/partner-key.mjs`).
- Routen `POST /api/partner/requests` (201/200 idempotent über `partnerRef`), `GET /api/partner/requests/[ref]`, `POST /api/partner/requests/[ref]/cancel`.
- Zustandsmaschine: Event `partner_submitted` (DRAFT → RECEIVED), Event `withdrawn` + Status `WITHDRAWN` (nur aus RECEIVED/IN_REVIEW).
- Status-Webhooks über eine Outbox (gleiche Transaktion wie der Statuswechsel), HMAC-Signatur `x-druck-s-signature`, Retry mit Backoff, Worker in `instrumentation.ts`.
- Staff-Sicht: Herkunft „Über <Partner>“ in Liste/Detail, Partner-Karte mit lesbaren Metadaten.

## Capabilities

### New Capabilities
- `partner-intake`: Anlage, Validierung, Datei-Download mit SSRF-Schutz, Idempotenz, Freitext, Storno.
- `partner-webhooks`: Outbox, Signatur, Zustellung, Retry.
- `partner-access`: Partner-Keys, Rotation, Rate-Limit, Staff-Anzeige.

### Modified Capabilities
- `print-request`: neue Events `partner_submitted`, `withdrawn`; neuer Endzustand `WITHDRAWN`; Herkunft `partner`.

## Impact

- DB: Migration `007_partner_api.sql` (Tabellen `partners`, `partner_webhook_outbox`; Spalten `requests.partner_id/partner_ref/partner_meta`).
- Neuer Hintergrund-Job im App-Prozess (`instrumentation.ts`), abschaltbar per `PARTNER_WEBHOOK_WORKER=off`.
- Docker-Image enthält `scripts/partner-key.mjs`.
- Datenschutzseite: Empfang von Aufträgen über Partner ergänzen (Firmenfreigabe nötig, nicht Teil dieses Changes).
