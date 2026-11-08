# Design

## Context

Vertrag kommt vom fertigen Client in Seeräuber digital (`src/lib/druck/druck-s.ts`, Entwurf `docs/druck-s-partner-api.patch.md`). druck-s-Grundsätze: Status nur über Events (`appendEventTx`, design §1 von `print-request-intake`), Route Handler als einzige Backend-Schicht, keine neuen Dienste.

## Decisions

### 1. Partner-Tür statt Door-A/B-Umweg
Ein Aufruf legt Auftrag, Datei und Events in einer Transaktion an (`draft_created` → `partner_submitted`); kein sichtbarer DRAFT. Datei wird vorher geladen und nach S3 geschrieben; schlägt die Transaktion fehl, wird das Objekt gelöscht. Danach `analyzeRequest` + `generateNote` wie Door A/B.

### 2. Idempotenz über (partner_id, partner_ref)
Partieller Unique-Index. Vorhandener Auftrag → 200 unverändert; parallele Erstaufrufe: Verlierer fängt `23505` und liefert den Gewinner. Nutzlast-Änderungen bei gleicher Referenz werden bewusst ignoriert (Partner storniert und legt neu an).

### 3. Key-Prüfung
Key `dmp_<64 hex>`; gespeichert SHA-256 + Präfix (12 Zeichen). Suche über das Präfix (nicht über den geheimen Wert), Vergleich der Hashes mit `timingSafeEqual`.

### 4. Webhook-Secret verschlüsselt
Das Secret muss zum Signieren im Klartext vorliegen → kein Hash. AES-256-GCM mit HKDF-SHA256(BETTER_AUTH_SECRET) — kein neues Env, nur `node:crypto`. Better-Auth-`symmetricEncrypt` wurde verworfen: Better Auth wird im Standalone-Build gebündelt, das Skript im Docker-Image könnte es nicht importieren. Folge: Rotation von BETTER_AUTH_SECRET erfordert `rotate-webhook-secret` je Partner (dokumentiert).
Alternative: Secret je Partner als Env — verworfen, weil neue Partner dann einen Redeploy brauchen.

### 5. Datei-Download
Nur HTTPS/443, exakter Host aus `partners.file_hosts`, keine Redirects, `lookup`-Hook verweigert private/lokale/reservierte Adressen (gilt für die tatsächlich verbundene IP, schützt gegen DNS-Rebinding), Streaming-Limit = deklarierte Größe ≤ 100 MB, Zeitlimit 45 s (unter dem 60-s-Client-Timeout), danach Größe + SHA-256. Fehlertexte ohne URL (signierte URLs tragen Tokens); `partner_meta` speichert nur den Host.

### 6. Outbox statt direktem Versand
`appendEventTx` liest `partner_id` beim ohnehin nötigen `FOR UPDATE` und schreibt bei echtem Statuswechsel (from ≠ to) einen Outbox-Eintrag in derselben Transaktion. Zustellung: Worker in `instrumentation.ts` (Intervall) plus Anstoß nach Partner-Aufrufen; Reservierung per `FOR UPDATE SKIP LOCKED` mit 5-min-Lease, Reihenfolge je Auftrag, Backoff 1…720 min, max. 10 Versuche, 400/410/422 endgültig. Es gab vorher keinen Job-Mechanismus (Mails gehen synchron); der Worker ist der kleinste Schritt dahin.

### 7. WITHDRAWN als Endzustand
Nur aus RECEIVED/IN_REVIEW. Kein Event führt heraus; AB anhängen, Freigabe und Versand sind dadurch strukturell gesperrt. Storno ist idempotent (200 auf WITHDRAWN).

### 8. Rate-Limit
Kein app-weites Rate-Limit vorhanden (nur Better Auth für Auth-Routen). Neue Partner-Aufträge je Stunde werden über die DB gezählt (instanzübergreifend), idempotente Wiederholungen zählen nicht.

## Abweichungen vom Seeräuber-Entwurf (Vertrag unverändert)

- Antwort `request` zusätzlich mit `partnerRef`, `createdAt`, `trackingNumber`, `specialDeliveryDate`; Fehler zusätzlich mit `code` (Client ignoriert beides).
- `product.hint` akzeptiert alle druck-s-`PRODUCT_HINTS` (Obermenge von flyer/poster).
- Webhook nur bei echtem Statuswechsel; zusätzlicher Header `x-druck-s-delivery`; HTTP 404 des Partners wird wiederholt statt als zugestellt gewertet.
- Webhook-Secret verschlüsselt statt im Klartext; Key-Suche über Präfix statt über Hash.

## Risks / Trade-offs

- [Worker im Web-Prozess] → bei mehreren Instanzen sicher (SKIP LOCKED); abschaltbar; später in eigenen Prozess verschiebbar.
- [BETTER_AUTH_SECRET-Rotation macht Webhook-Secrets unlesbar] → klare Fehlermeldung im Outbox-Eintrag, Runbook in docs/partner-api.md.
- [Seeräuber-Client-Timeout 60 s bei großen Dateien] → Download-Limit 45 s; bei Timeout greift beim Partner der E-Mail-Rückfall, eine spätere Wiederholung ist idempotent.
