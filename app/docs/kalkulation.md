# Kalkulation (Richtpreis)

- Engine: `lib/kalpri/` (vendored, `node scripts/kalpri-sync.mjs <kalpri-repo> [--werkbank]`).
- Stammdaten: Werkbank unter `/staff/kalkulation/werkbank/` oder Import unter `/staff/kalkulation/stammdaten`; CLI `node scripts/kalkulation-import.mjs <sicherung.json>`.
- Maschinenzugriff: `node scripts/kalkulation-key.mjs create "<Name>"`, dann `Authorization: Bearer kal_…` an `/api/v1/kalkulation/…` (siehe `/api/docs`).
- Öffentlich: `GET /api/v1/richtpreis/artikel`, `POST /api/v1/richtpreis`.
- Entwicklung: `node scripts/kalkulation-beispieldaten.mjs` (nur lokal).
- Richtpreis für Kunden: Schalter (Standard aus) und Zuordnung Produkt → Artikel unter `/staff/kalkulation/einstellungen`; Details in [anfrage-api.md](anfrage-api.md#ungefährer-preis-richtpreis).
- Abmelden im Mitarbeiterbereich löscht die lokalen Werkbank-Daten (`werkbank.*` im Browser-Speicher).
- Env: `RICHTPREIS_PER_IP_PER_HOUR`, `RICHTPREIS_ARTIKEL_PER_IP_PER_HOUR`.
