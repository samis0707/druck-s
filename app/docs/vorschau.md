# Vorschau-Umgebung (PREVIEW_MODE)

Eine getrennte Railway-Umgebung (eigene leere Datenbank, eigener Bucket, **keine Produktionsdaten**), in der
Mitarbeiter die Kalkulation (`/staff/kalkulation`, Einstellungen, Werkbank, Richtpreis in `/anfrage`) und die
Personalisierung sofort ausprobieren können. Alles hier passiert nur mit `PREVIEW_MODE=1`; ohne den Schalter
verhält sich die App unverändert.

## Was der Modus tut

- **Seed beim Start** (`instrumentation.ts` → `lib/vorschau/seed.ts`, nach den Migrationen, idempotent,
  Fehler werden geloggt und stoppen die App nicht; ein Datenbank-Sperrschlüssel verhindert Doppelläufe):
  - Konten aus `PREVIEW_STAFF_EMAILS` anlegen bzw. auf Rolle `staff` setzen (E-Mail verifiziert, Anmeldung per Code).
    Keine anderen Nutzer.
  - Kalkulations-Stammdaten (kalpri-Beispiel-Lager/-Produktion, drei Artikel; `lib/kalkulation/beispieldaten.ts`),
    nur wenn noch keine vorhanden sind.
  - Richtpreis für Kunden an, Zuordnung `flyer → A-FLYER`, `business-card → A-VISITENKARTE` (nur wenn noch nie gesetzt).
  - Personalisierung: Visitenkarten-Beispielvorlage mit selbst erzeugtem Design-PDF und Open Sans (OFL), aktiv
    und „öffentlich per Link“. Der Link steht im Server-Log (`[vorschau] Personalisierung (Beispiel): …`), auch bei
    jedem weiteren Start. Ist der Speicher (S3) nicht erreichbar, wird dieser Teil übersprungen (Log-Warnung).
- **Produktions-Schutz:** Zeigt `APP_BASE_URL` (oder `BETTER_AUTH_URL`) auf `druck-s.de`/`www.druck-s.de`,
  verweigert der Modus das Seeden mit Log-Meldung `[vorschau] Seed verweigert: …`.
- **Hinweis:** schmales Banner „Vorschau-Umgebung – nur Beispieldaten, keine echten Aufträge“ oben auf allen Seiten
  (nicht wegklickbar; wird zur Laufzeit über `/api/vorschau` eingeblendet), `X-Robots-Tag: noindex, nofollow`
  auf allen Antworten (`proxy.ts`) und `robots.txt` mit `Disallow: /`.
- **Keine Außenwirkung:** Partner-Webhook-Worker aus (unabhängig von `PARTNER_WEBHOOK_WORKER`), Mistral aus
  (Schlüssel wird ignoriert), Umami aus. Mails gehen nur an Adressen aus `PREVIEW_STAFF_EMAILS` oder an Adressen,
  die im Ablauf selbst eingegeben wurden (Konto/Interessent, Bestätigungscode einer Anfrage); alle Betreffs
  beginnen mit „[Vorschau] “. Hinweis-Mails an die Druckerei gehen daher nur an `FIRM_INBOX`, wenn diese Adresse
  in `PREVIEW_STAFF_EMAILS` steht; sonst werden sie verworfen (Log: „keine erlaubten Empfänger“).

## Variablen der Vorschau-Umgebung

| Variable | Wert |
| --- | --- |
| `PREVIEW_MODE` | `1` |
| `PREVIEW_STAFF_EMAILS` | kommagetrennte Mitarbeiter-Adressen |
| `APP_BASE_URL`, `BETTER_AUTH_URL` | Adresse der Vorschau (z. B. `https://….up.railway.app`), **nicht** druck-s.de; `APP_BASE_URL` auch als Build-Variable |
| `BETTER_AUTH_SECRET` | eigenes Geheimnis der Umgebung |
| `DATABASE_URL` | eigene, leere Datenbank (Migrationen laufen beim Start) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | eigener Bucket |
| `BREVO_API_KEY`, `MAIL_FROM` | Mailversand (verifizierte Absenderdomain) |
| `PERS_LINK_KEY` | Schlüssel für gespeicherte Personalisierungs-Links |
| `CLIENT_IP_TRUSTED_PROXIES` | `1` (Railway-Rand) |
| `FIRM_INBOX` | Mitarbeiter-Adresse, die auch in `PREVIEW_STAFF_EMAILS` steht |

Nicht setzen: `MISTRAL_API_KEY`, `UMAMI_*`, Produktionsschlüssel. Start: `sh -c "node db/migrate.js && node server.js"`.
Anmeldung im Backoffice: `/login` mit einer Adresse aus `PREVIEW_STAFF_EMAILS`, der Code kommt per Mail.
