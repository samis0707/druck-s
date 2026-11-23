# Offene Anfrage

Anfrage ohne Kundenkonto, für Menschen (`/anfrage`) und für Assistenten (`/api/v1`). Eine vierte Tür
in dieselbe Pipeline wie Door A (Upload + Code), Door B (Einmal-Link) und die Partner-Schnittstelle.

Die vollständige Beschreibung mit Feldern, Beispielen und Fehlercodes steht in der Swagger-Oberfläche
unter **`/api/docs`** (Rohfassung `/api/v1/openapi.json`, gepflegt in `lib/openapi.ts`). Hier steht,
was dort nicht hineingehört: Verhalten im System, Grenzen und Betrieb.

## Ablauf

| Schritt | Aufruf | Wirkung |
| --- | --- | --- |
| 1 | `POST /api/v1/inquiries` | Entwurf (`DRAFT`). Noch nichts in der Staff-Liste. |
| 2 | `POST /api/v1/inquiries/{id}/files` | Dateien am Entwurf, optional. |
| 3 | `POST /api/v1/inquiries/{id}/code` | Sechsstelliger Code an die Kontakt-Adresse, mit Link zu `/anfrage/{id}`. |
| 4 | `POST /api/v1/inquiries/{id}/confirm` | `DRAFT → RECEIVED`, Auftragsnummer, Analyse, Mails. |

```bash
BASE=https://www.druck-s.de
ID=$(curl -sS $BASE/api/v1/inquiries -H 'content-type: application/json' -d '{
  "product": "flyer",
  "description": "500 Flyer DIN A5, beidseitig, 135 g matt. Abholung bis 20.11.",
  "contact": { "name": "Anna Beispiel", "email": "anna@example.org" }
}' | jq -r .inquiry.id)
curl -sS $BASE/api/v1/inquiries/$ID/files -F file=@flyer.pdf
curl -sS -X POST $BASE/api/v1/inquiries/$ID/code
curl -sS $BASE/api/v1/inquiries/$ID/confirm -H 'content-type: application/json' -d '{"code":"482913"}'
```

## Was nach der Bestätigung passiert

- **Adresse gehört zu einem freigeschalteten Kundenkonto:** Der Auftrag wird an das Konto gebunden
  (`customer_id`, `trust = 'VERIFIED'`, Event `otp_verified`), wie bei Door A. Es entsteht keine Sitzung;
  die Kundin sieht den Auftrag nach der Anmeldung unter „Meine Aufträge“.
- **Sonst (Interessent):** `prospect_email`, `origin = 'inquiry'`, `trust = 'VOUCHED'`, Event
  `inquiry_confirmed`. Der Kontakt wird an den Freitext angehängt. In `"user"` entsteht ein Datensatz
  mit Status „prospect“ (oder ein vorhandener wird um Name und Firma ergänzt).
- **In beiden Fällen:** Analyse (Preflight, Virenscan) und KI-Notiz wie bei den anderen Türen,
  Eingangsbestätigung an die Kontakt-Adresse. Bei Interessenten zusätzlich ein Hinweis an `FIRM_INBOX`.

Ein Interessent hat keinen Zugang: `/api/login/otp` und Door A lehnen ihn ab, die Auftragsansicht
antwortet 404. Staff schaltet ihn unter „Kunden & Links“ frei; die bestehende Freischaltung bindet
seine Anfragen an das Konto. In der Staff-Liste tragen solche Aufträge das Kennzeichen „Interessent“.

## Ungefährer Preis (Richtpreis)

Optional kann der Entwurf Angaben für einen **unverbindlichen Richtpreis** mitbringen:

```json
"quote": { "artikel": "A-0001", "antworten": { "endformat": "1" }, "auflagen": [500, 1000] }
```

Artikel und Fragen liefert `GET /api/v1/richtpreis/artikel`, die Live-Berechnung (ohne Anfrage)
`POST /api/v1/richtpreis`. Regeln:

- **Schalter:** Mitarbeiter-Einstellung „Richtpreis für Kunden anzeigen“ (`/staff/kalkulation/einstellungen`,
  Standard **aus**, Audit-Eintrag bei jeder Änderung). Aus: `GET /richtpreis/artikel` antwortet
  `{ "aktiv": false, "artikel": [] }`, `POST /richtpreis` mit `403 nicht_aktiv`, und `quote` wird beim Anlegen
  ohne Fehler ignoriert; die Anfrage läuft wie vorher.
- **Produkt ↔ Artikel:** Die Produktliste (`GET /api/v1/products`) ist grob, Kalkulationsartikel sind konkret.
  Die Druckerei ordnet in denselben Einstellungen jedem für den Shop freigegebenen Artikel ein oder mehrere
  Produkte zu (gespeichert in `app_settings`, Schlüssel `kalkulation.produktzuordnung`). Nur zugeordnete
  Artikel erscheinen beim jeweiligen Produkt; `quote.artikel` muss zum gewählten `product` gehören, sonst
  `400 invalid_body`.
- **Prüfung beim Anlegen:** Artikel freigegeben, Antworten passen zu den Fragen, 1 bis 3 Auflagen, keine
  weiteren Felder (Preise vom Client werden abgelehnt). Die Angaben liegen bis zur Bestätigung in
  `requests.inquiry_quote` (Migration 012).
- **Beim Bestätigen** wird der Richtpreis aus Artikel, Antworten und Auflagen **neu berechnet** (aktuelle
  Stammdaten und Preis-Einstellungen; nie Werte des Clients) und als Snapshot in `request_quotes`
  gespeichert (`ergebnis.quelle = "anfrage"`). In der Mitarbeiteransicht erscheint er in der Karte
  „Richtpreis (unverbindlich)“ mit dem Kennzeichen „vom Kunden angezeigt“. Ist der Schalter dann aus,
  entfällt der Snapshot.
- **Mails:** Die Eingangsbestätigung nennt den Richtpreis je Auflage mit dem Hinweis „unverbindlich, der
  verbindliche Preis kommt mit unserem Angebot“; der Hinweis an `FIRM_INBOX` führt dieselben Zeilen auf.
  Ohne Preisangaben ändert sich nichts.

## Der Code

Kein Login-Code. Er liegt in `inquiry_codes`, gebunden an genau einen Entwurf (HMAC-SHA256 über Entwurf
und Code, Schlüssel `BETTER_AUTH_SECRET`), gilt `OTP_TTL_MINUTES`, ist einmalig und nach
`INQUIRY_CODE_ATTEMPTS` Fehlversuchen verbraucht. Ein neuer Code macht den vorigen ungültig. Wird der
Kontakt nach dem Versand geändert, gilt der alte Code nicht mehr.

## Grenzen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `INQUIRY_DRAFTS_PER_IP_PER_HOUR` | 30 | Neue Entwürfe je IP-Adresse und Stunde |
| `INQUIRY_CODES_PER_DRAFT` | 5 | Code-Mails je Entwurf |
| `INQUIRY_CODES_PER_EMAIL_PER_HOUR` | 5 | Code-Mails je Adresse und Stunde |
| `INQUIRY_CODES_PER_IP_PER_HOUR` | 20 | Code-Mails je IP-Adresse und Stunde |
| `INQUIRY_CODE_ATTEMPTS` | 5 | Fehlversuche je Code |

`0` schaltet eine Grenze ab. Gezählt wird über `audit_log` (Aktionen `inquiry_created`,
`inquiry_code_issued`), also über alle Instanzen. Darüber: `429 rate_limited` mit `Retry-After: 3600`.
Gezählt wird je Client-Adresse (siehe unten). Weitere feste Grenzen: 64 KB JSON, 100 MB je Datei, 20 Dateien je Anfrage. Unbestätigte Entwürfe
löscht der bestehende Sweep nach `DRAFT_TTL_MINUTES`.

### Client-Adresse hinter Proxys

`X-Forwarded-For` kann ein Client selbst setzen; früher galt der linke Eintrag und ließ sich fälschen
(Grenzen umgehbar). Jetzt (`lib/clientIp.ts`):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `CLIENT_IP_TRUSTED_PROXIES` | 1 | Zahl der vorgeschalteten Proxys, die die Adresse ihres Gegenübers **hinten anhängen** (Railway-Rand = 1). Es gilt der Eintrag an dieser Stelle von rechts. 0 = Header ignorieren (alle „unknown“, die IP-Grenzen greifen dann nicht). |
| `WEBSITE_PROXY_SECRET` | leer | Gemeinsames Geheimnis (mindestens 16 Zeichen) mit dem Caddy von digitalemedien.de. Mit passendem Header `X-Dmp-Proxy-Secret` gilt die Besucher-Adresse aus `X-Dmp-Client-Ip`. Leer = aus. |

Warum das Geheimnis: Für den Railway-Rand kommen alle Anfragen der Website von derselben Adresse (dem
Website-Dienst). Ohne die Besucher-Adresse würden sich alle Besucher eine Grenze teilen. Ein falsches oder
fehlendes Geheimnis wird ignoriert. Beim Einrichten: auf beiden Seiten denselben Zufallswert setzen
(druck-s `WEBSITE_PROXY_SECRET`, Website `DRUCK_S_PROXY_SECRET`).

## Für Assistenten

`/llms.txt` beschreibt die vier Schritte und die Regel: Ein Assistent darf vorbereiten (Schritte 1 bis 3),
bestätigen muss der Mensch. Die Antwort jedes Schritts enthält `confirmUrl`; dort sieht der Mensch die
Anfrage und gibt den Code selbst ein. `robots.txt` gibt `/api/v1/` und `/api/docs` frei.

Testfälle und Prompts zum Nachprüfen: [anfrage-testfaelle.md](anfrage-testfaelle.md).

## Pflege

Ändert sich etwas an `lib/inquiry` oder den Routen unter `app/api/v1`, muss `lib/openapi.ts` nachgezogen
werden. `tests/openapi.test.ts` schlägt fehl, wenn eine Route fehlt oder unbeschrieben ist, wenn
Produktliste oder Feldgrenzen abweichen oder ein Fehlercode nicht aufgeführt ist.
