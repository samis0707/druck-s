# Proposal

## Why

Die Kalkulation soll aus der Branchensoftware Pagina herausgelöst und per API sowie für Ad-hoc-Kalkulationen nutzbar werden. Zuerst als unverbindlicher Richtpreis für Kundenanfragen. Die Engine liegt im Repo kalpri (Artikel-first, nur Kosten); Stammdaten werden dort in der Werkbank gepflegt.

## What Changes

- Engine (units, layout-core, resources) wird unverändert nach `app/lib/kalpri/` übernommen (`scripts/kalpri-sync.mjs`, `HERKUNFT.json`).
- Persistenz in Postgres: Bereiche mit Version (optimistische Sperre, 409), anhängender Verlauf, Dateien (Metadaten in Postgres, Inhalt im S3-Speicher), Format der werkbank-sicherung bleibt kompatibel.
- Preisschicht `lib/kalkulation/richtpreis.ts`: Kosten → Gemeinkosten, Gewinn, Mindestpreis, Rundung, Spanne, MwSt; unvollständig = „Preis auf Anfrage“. Einstellungen in `app_settings`.
- Schnittstellen: Mitarbeiter `/api/staff/kalkulation/…` (Werkbank-Sync, Kalkulieren, Einstellungen, Import), Maschinen `/api/v1/kalkulation/…` (API-Schlüssel, Scope `kalkulation`), öffentlich `GET /api/v1/richtpreis/artikel` und `POST /api/v1/richtpreis` (Rate-Limit je IP).
- Mitarbeiterbereich: `/staff/kalkulation` (Ad-hoc), `/einstellungen`, `/stammdaten` (Import mit Vorschau), eingebettete Werkbank unter `/staff/kalkulation/werkbank/`.
- Richtpreis-Snapshot je Anfrage (`request_quotes`), Anzeige in `/staff/requests/[id]`.

## Capabilities

### New Capabilities
- `kalkulation`: Stammdaten, Kosten- und Richtpreisrechnung, Schnittstellen, Mitarbeiterbereich.

### Modified Capabilities
- `print-request`: Richtpreis-Snapshot zu einer Anfrage.

## Impact

- DB: Migration `010_kalkulation.sql`. Neue Abhängigkeiten: `zod` 3.23.8, dev: `fast-check`, `tsx`.
- Neue Env: `RICHTPREIS_PER_IP_PER_HOUR`, `RICHTPREIS_ARTIKEL_PER_IP_PER_HOUR`.
- `vendor/kalpri-werkbank/` (gebaute Werkbank, ca. 1,2 MB).
