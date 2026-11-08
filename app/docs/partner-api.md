# Partner-Schnittstelle

Server-zu-Server-Schnittstelle, über die Partnersysteme (zuerst **Seeräuber digital**) Druckaufträge
in druck-s einliefern und Statusmeldungen zurückbekommen. Partner-Aufträge sind eine dritte Tür in
dieselbe Pipeline wie Door A (Upload + OTP) und Door B (Einmal-Link):

- `requests.origin = 'partner'`, `trust = 'VOUCHED'` (der Partner bürgt, nicht der Kunde).
- Kunde ist die Gemeinschaft: ist `customer.email` schon freigeschalteter Kunde, wird der Auftrag direkt
  gebunden (`customer_id`), sonst über `prospect_email` (die Staff-Freischaltung bindet ihn später).
- Datei, Analyse (Preflight + ClamAV), KI-Notiz, Auftragsbestätigung, OTP-Freigabe und Versand laufen
  unverändert. Status ändert sich nur über Events (`appendEventTx`); jeder Statuswechsel eines
  Partner-Auftrags erzeugt in derselben Transaktion einen Webhook-Eintrag (Outbox).

Vertragsgegenstück in Seeräuber digital: `src/lib/druck/druck-s.ts` (Client, Statuszuordnung,
Webhook-Prüfung). Planung: `openspec/changes/partner-api/`.

## Authentifizierung

```
Authorization: Bearer dmp_<64 hex>
```

Der Key wird nur einmal beim Anlegen/Rotieren ausgegeben; gespeichert sind SHA-256-Hash und ein nicht
geheimes Präfix (`dmp_1a2b3c4d`). Vergleich in konstanter Zeit. Fehlender, falscher Key oder
deaktivierter Partner → `401`.

## Endpunkte

Alle Antworten sind JSON mit `cache-control: no-store`. Erfolg: `{ "request": { … } }`,
Fehler: `{ "error": "<Text>", "code": "<code>", "details"?: ["…"] }`.

`request` enthält: `id` (UUID in druck-s), `number` (Auftragsnummer `DDMMJJ-NNN`), `status`,
`partnerRef`, `createdAt`, `trackingNumber`, `specialDeliveryDate` (beide nur nach Versand).

### `POST /api/partner/requests` – Auftrag anlegen

Idempotent über `partnerRef` (je Partner eindeutig): **201** = neu angelegt, **200** = Auftrag mit diesem
`partnerRef` gibt es schon, er wird unverändert zurückgegeben (auch bei gleichzeitigen Aufrufen; eine
geänderte Nutzlast überschreibt nichts).

```bash
curl -sS https://druck-s.de/api/partner/requests \
  -H "Authorization: Bearer $DRUCK_S_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "partnerRef": "90000000-0000-4000-8000-000000000001",
    "customer": { "email": "anna@example.org", "name": "Anna", "organisation": "Quartierszentrum Böckingen", "phone": "07131 1234" },
    "product": { "hint": "poster", "label": "Plakat A2", "widthMm": 420, "heightMm": 594, "bleedMm": 3, "sides": 1, "paper": "Plakatpapier 135 g" },
    "quantity": 10,
    "wishDate": "2026-11-20",
    "delivery": { "mode": "abholung", "address": null },
    "note": "Bitte matt",
    "event": "Kinderbasar, Sa, 14.11.",
    "printerCheck": false,
    "preflight": "ok",
    "file": {
      "url": "https://bciteqheblrwawokcvjg.supabase.co/storage/v1/object/sign/druckdaten/…?token=…",
      "name": "plakat-druck.pdf", "mime": "application/pdf", "size": 2048,
      "sha256": "cdcd…(64 hex)"
    },
    "source": { "system": "seeraeuber-digital", "publication": "Seeräuber-Blättle", "link": "https://app.linqr.de/verlag/auftraege/…" }
  }'
# 201 {"request":{"id":"…","number":"081126-004","status":"RECEIVED","partnerRef":"9000…","createdAt":"…","trackingNumber":null,"specialDeliveryDate":null}}
```

| Feld | Regel |
| --- | --- |
| `partnerRef` | 1–120 Zeichen `A-Z a-z 0-9 . _ : -` |
| `customer.email` / `name` / `organisation` | Pflicht; `phone` optional |
| `product.hint` | ein Wert aus `PRODUCT_HINTS` (`flyer`, `poster`, `brochure`, …) |
| `product.label`, `widthMm`, `heightMm`, `bleedMm`, `sides` (1/2), `paper` | Format-Angaben; `paper` optional |
| `quantity` | Ganzzahl 1–1 000 000 |
| `wishDate` | `YYYY-MM-DD` oder `null` |
| `delivery.mode` | `abholung` oder `lieferung` (dann `delivery.address` Pflicht) |
| `note`, `event` | optional |
| `printerCheck` | Boolean („Datei prüfen und melden“) |
| `preflight` | `ok` / `warnung` / `fehler` / `null` (Ergebnis beim Partner; druck-s analysiert selbst) |
| `file.url` | **HTTPS, Port 443, Host in der Freigabeliste des Partners**, ohne Zugangsdaten |
| `file.size`, `file.sha256` | müssen exakt zur geladenen Datei passen; ≤ 100 MB (wie Uploads) |
| `source.system` | Pflicht; `publication`, `link` optional (Anzeige im Staff-Bereich) |

Was druck-s daraus macht:

- **Datei**: lädt `file.url` (keine Weiterleitungen, keine privaten/lokalen Zieladressen – geprüft auf die
  tatsächlich verbundene IP, Größenlimit beim Streamen, Zeitlimit `PARTNER_FILE_TIMEOUT_SECONDS`), prüft
  Größe und SHA-256, legt sie in S3 ab und schickt sie durch Analyse/Virenscan wie Door A/B.
- **Freitext** (`free_text`): Produkt, Format, Auflage, Wunschtermin, Übergabe, Termin, Kontakt,
  Druckvorbereitung, Prüfwunsch und Hinweis als Klartext – die Staff-Ansicht und die KI-Notiz arbeiten
  ohne Sonderfall.
- **Metadaten** (`partner_meta`): die geprüfte Nutzlast ohne signierte Datei-URL (nur deren Host).
- Auftrag, Datei und Events (`draft_created` → `partner_submitted`, DRAFT → RECEIVED, Auftragsnummer)
  entstehen in einer Transaktion.

### `GET /api/partner/requests/{partnerRef}` – Status abrufen

```bash
curl -sS https://druck-s.de/api/partner/requests/90000000-0000-4000-8000-000000000001 \
  -H "Authorization: Bearer $DRUCK_S_API_KEY"
```

Nur eigene Aufträge; fremde oder unbekannte Referenzen → `404`.

### `POST /api/partner/requests/{partnerRef}/cancel` – zurückziehen

```bash
curl -sS -X POST https://druck-s.de/api/partner/requests/90000000-0000-4000-8000-000000000001/cancel \
  -H "Authorization: Bearer $DRUCK_S_API_KEY"
```

Nur aus `RECEIVED` oder `IN_REVIEW` (Event `withdrawn` → `WITHDRAWN`). Später → `409 not_withdrawable`.
Erneuter Aufruf auf einem zurückgezogenen Auftrag → `200` (idempotent).

## Statusmodell

| druck-s `status` | Bedeutung | Auslöser |
| --- | --- | --- |
| `RECEIVED` | eingegangen, Nummer vergeben | Anlage (`partner_submitted`) |
| `IN_REVIEW` | DMP prüft | erste Staff-Vorschau |
| `WAITING_APPROVAL` | Auftragsbestätigung an die Kundin verschickt | Staff hängt AB + Druckdateien an |
| `IN_PROGRESS` | freigegeben, in Produktion | Kundin gibt per OTP frei |
| `SHIPPED` | versendet/bereit (Sendungsnummer oder Termin) | Staff erfasst Versand |
| `WITHDRAWN` | vom Partner zurückgezogen (Endzustand) | `cancel` aus RECEIVED/IN_REVIEW |

`DRAFT` existiert nur innerhalb der Anlage-Transaktion und wird nie gemeldet. Zuordnung bei Seeräuber
digital: `statusAusDruckS()` in `src/lib/druck/druck-s.ts`.

## Webhooks

Bei jedem echten Statuswechsel (nicht bei `resent`, `change_requested`, `invoice_attached`) eines
Partner-Auftrags, sofern beim Partner eine Webhook-URL hinterlegt ist:

```
POST <webhook_url>
Content-Type: application/json
x-druck-s-timestamp: 1762596000            (Unix-Sekunden)
x-druck-s-signature: v1=<hex>              HMAC-SHA256(webhook_secret, `${timestamp}.${rawBody}`)
x-druck-s-delivery: 42                     (Outbox-ID, zum Entdoppeln)

{"event":"status_changed","partnerRef":"…","number":"081126-004","status":"SHIPPED",
 "occurredAt":"2026-11-09T10:00:00.000Z","trackingNumber":"00340434…","specialDeliveryDate":null}
```

`trackingNumber`/`specialDeliveryDate` nur bei `SHIPPED`. Die Schlüsselreihenfolge im JSON ist nicht
festgelegt – immer über den **rohen** Body prüfen.

Signatur prüfen (Node):

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function valid(secret, rawBody, ts, sig) {
  if (!/^\d{9,11}$/.test(ts ?? "") || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = Buffer.from(`v1=${createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex")}`);
  const got = Buffer.from(sig ?? "");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
```

Zustellung (`lib/partners/webhook.ts`, Worker in `instrumentation.ts`, alle
`PARTNER_WEBHOOK_INTERVAL_SECONDS` sowie direkt nach Anlage/Storno):

- `2xx` = zugestellt. Reihenfolge je Auftrag bleibt erhalten (ein späterer Eintrag wartet, bis der
  frühere zugestellt oder aufgegeben ist). Mehrere App-Instanzen sind sicher (`FOR UPDATE SKIP LOCKED`).
- Sonst Retry mit Backoff 1, 5, 15, 60, 180, 360, 720, 720, 720 min; nach 10 Versuchen aufgegeben.
- `400`, `410`, `422` gelten als endgültig (Format abgelehnt) und werden sofort aufgegeben;
  deaktivierter Partner oder fehlendes Secret ebenfalls. Aufgegebene Einträge: Audit
  `partner_webhook_failed`, sichtbar mit `node scripts/partner-key.mjs list`.
- Keine Weiterleitungen, Timeout 15 s. Logs/`last_error` enthalten weder URL noch Secret.

## Fehlercodes

| HTTP | `code` | Wann |
| --- | --- | --- |
| 400 | `invalid_json` | Body ist kein JSON |
| 400 | `invalid_body` | Validierung; `details` listet alle Feldfehler |
| 400 | `file_host_not_allowed` | `file.url` nicht HTTPS/443, Host nicht freigegeben oder löst auf private Adresse auf |
| 401 | `unauthorized` | Key fehlt/falsch, Partner deaktiviert |
| 404 | `not_found` | `partnerRef` unbekannt (oder gehört einem anderen Partner) |
| 409 | `not_withdrawable` | Storno nach `IN_REVIEW` |
| 413 | `body_too_large` | JSON größer als 64 KB |
| 422 | `file_unavailable` | Datei nicht ladbar (HTTP-Fehler, Timeout, DNS) |
| 422 | `file_size_mismatch` / `file_sha256_mismatch` | Datei passt nicht zu `file.size`/`file.sha256` |
| 422 | `customer_disabled` | Kundenkonto der E-Mail ist in druck-s gesperrt |
| 429 | `rate_limited` | mehr als `PARTNER_RATE_LIMIT_PER_HOUR` neue Aufträge in 60 min (`Retry-After: 3600`; idempotente Wiederholungen zählen nicht) |
| 500 | `internal_error` | unerwartet; gleicher Aufruf kann wiederholt werden (idempotent) |

Bei `4xx/5xx` fällt Seeräuber digital auf den Weg „verlag“ (E-Mail) zurück.

## Partner einrichten

Im App-Container (Docker-Image enthält das Skript; braucht `DATABASE_URL` und `BETTER_AUTH_SECRET`):

```bash
docker compose exec app node scripts/partner-key.mjs create seeraeuber "Seeräuber digital" \
  --webhook-url https://app.linqr.de/api/druck-s/webhook \
  --file-host bciteqheblrwawokcvjg.supabase.co
# gibt API-Key (dmp_…) und Webhook-Secret (whsec_…) EINMAL aus
```

Bei Seeräuber digital setzen: `DRUCK_S_URL=https://druck-s.de`, `DRUCK_S_API_KEY=<dmp_…>`,
`DRUCK_S_WEBHOOK_SECRET=<whsec_…>`, dann `DRUCKEREI_ADAPTER=druck-s`.

Weitere Befehle:

| Befehl | Wirkung |
| --- | --- |
| `rotate-key <slug>` | neuer API-Key, der alte gilt sofort nicht mehr (Partner gleichzeitig umstellen) |
| `rotate-webhook-secret <slug>` | neues Webhook-Secret, gilt ab der nächsten Zustellung |
| `update <slug> [--name …] [--webhook-url …\|--no-webhook] [--file-host … …]` | Stammdaten ändern (`--file-host` ersetzt die Liste) |
| `activate` / `deactivate <slug>` | Partner sperren/entsperren (gesperrt: 401, offene Webhooks werden aufgegeben) |
| `list` | Partner mit Key-Präfix, Hosts, offenen und aufgegebenen Webhooks |

Lokal ist `--allow-http` für eine `http://`-Webhook-URL erlaubt.

**Webhook-Secret-Speicherung:** Das Secret muss zum Signieren im Klartext verfügbar sein; es liegt
AES-256-GCM-verschlüsselt in `partners.webhook_secret_enc`, Schlüssel per HKDF-SHA256 aus
`BETTER_AUTH_SECRET` (kein zusätzliches Env). Wird `BETTER_AUTH_SECRET` rotiert, danach je Partner
`rotate-webhook-secret` ausführen und das neue Secret beim Partner hinterlegen (bis dahin werden
Webhooks als „secret cannot be decrypted“ aufgegeben).

## Staff-Sicht

Partner-Aufträge zeigen in Liste und Detail statt „Per Link“ das Badge **„Über Seeräuber digital“**
(Partnername), in der Warteschlange eine Zeile „Über …“ unter der E-Mail und sind über Partnername und
Partner-Referenz suchbar. Im Detail steht eine Karte „Partner-Auftrag“ mit Partner-Referenz,
Organisation, Kontakt, Produkt/Format, Auflage, Wunschtermin, Übergabe, Termin, Druckvorbereitung,
Hinweis, Datei (Name, Typ, SHA-256) und Quelle. Zurückgezogene Aufträge haben den Status
„Zurückgezogen“; alle weiteren Schritte sind durch die Zustandsmaschine gesperrt.

## Env-Variablen

| Variable | Standard | Zweck |
| --- | --- | --- |
| `PARTNER_RATE_LIMIT_PER_HOUR` | `120` | neue Aufträge je Partner und Stunde (`0` = aus) |
| `PARTNER_FILE_TIMEOUT_SECONDS` | `45` | Zeitlimit Datei-Download (unter dem 60-s-Timeout des Clients halten) |
| `PARTNER_WEBHOOK_WORKER` | `on` | `off` schaltet die Zustellung in diesem Prozess ab |
| `PARTNER_WEBHOOK_INTERVAL_SECONDS` | `15` | Takt des Webhook-Workers |
| `BETTER_AUTH_SECRET` | – | (vorhanden) Schlüsselquelle für die Webhook-Secrets |

## Tests

- Unit: `npx vitest run lib/partners` (Auth, Validierung, Freitext, SSRF-Prüfung, Signatur, Payload,
  Statusabbildung, Backoff, Verschlüsselung, Skript).
- Integration (Compose-Stack, siehe `npm run test:int`): `tests/partner.test.ts` (Anlage 201/200,
  Gleichzeitigkeit, Kundenbindung, Fehlercodes, Rate-Limit, Abruf/Storno, Outbox + signierte Zustellung,
  Retry/Aufgeben, Analyse-Pipeline). Datei-Download und Webhook-Ziel sind dort lokal ersetzt.
