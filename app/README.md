This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Besucherstatistik (Umami)

Das Portal zählt Seitenaufrufe optional mit [Umami](https://umami.is), selbst betrieben im Railway-Projekt „umami“
(Region EU West, https://umami-production-fb4c.up.railway.app). Umami setzt keine Cookies und speichert keine IP-Adressen.

- **Nur mit Einwilligung:** Beim ersten Besuch erscheint unten links ein kleiner Hinweis („Dürfen wir mitzählen?“) mit
  zwei gleichwertigen Knöpfen. Erst nach „Ja, gerne“ wird das Skript geladen. „Do not track“ und „Global Privacy
  Control“ gelten als „Nein“. Die Wahl liegt in `localStorage` (`drucks.statistik`) und wird nach 12 Monaten neu erfragt;
  ändern über „Statistik-Einstellungen“ in der Fußzeile (`components/analytics/`, Logik in `lib/statistik.ts`).
- **Nie gezählt:** `/staff`, `/konto`, `/login`, `/api`. Upload-Links (`/u/<token>`) und Aufträge (`/requests/<id>`)
  werden vor dem Senden zu `/u/[token]` bzw. `/requests/[id]`; Suchparameter fallen weg.
- **Ereignisse** über `data-umami-event` (ohne personenbezogene Daten): Anfrage gesendet, Upload bestätigt, Dateien über
  Upload-Link gesendet, Freigabe gestartet/bestätigt, Änderungswunsch.

Laufzeit-Variablen (kein Neubau nötig; die Seiten lesen sie über `/api/statistik`):

- `UMAMI_URL`: z. B. `https://umami-production-fb4c.up.railway.app`
- `UMAMI_WEBSITE_ID`: Website-ID aus Umami (Einstellungen → Websites)

Ohne beide Werte ist die Statistik aus und der Hinweis erscheint nicht. Falls später eine Content-Security-Policy
ergänzt wird, muss die Umami-Adresse in `script-src` und `connect-src` freigegeben werden.

## Hilfe, Schulung, SEO und KI-Assistenten

- Online-Schulung unter `/hilfe` (Kurse für Kunden, Druckerei und Partner, Lektionen mit Bildern, Quiz, Fortschritt),
  geführte Touren auf `/upload`, `/requests/<id>` und `/staff`, PDF-Kurzanleitungen in `public/hilfe/`.
- Für KI-Assistenten: `/llms.txt`, `/llms-full.txt` und jede Hilfeseite als Markdown (`.md` anhängen).
- Suchmaschinen: `robots.txt` (öffentliche Seiten frei, auch für KI-Crawler; private Bereiche und API gesperrt),
  `sitemap.xml`, Canonicals, JSON-LD (Organization, WebApplication, FAQPage, Course, HowTo), `noindex` für
  `/staff`, `/requests`, `/konto`, `/login`, `/u`.
- Alle Texte kommen aus `lib/hilfe/inhalte.ts`. Basis-URL ist `APP_BASE_URL` — **muss beim Build gesetzt sein**
  (die Hilfeseiten werden vorgerendert; das Dockerfile reicht sie als Build-Arg durch).
- Pflege, Screenshots und PDFs neu erzeugen: [docs/schulung/README.md](docs/schulung/README.md).

## Offene Anfrage und Schnittstellen

Wer noch kein Kundenkonto hat, stellt unter `/anfrage` eine Anfrage und bestätigt sie mit einem Code aus
der E-Mail; `/upload` leitet unbekannte Adressen mit denselben Dateien dorthin weiter. Dieselben vier
Schritte gibt es als öffentliche Schnittstelle `/api/v1` (für Assistenten, ohne Schlüssel). Die
Swagger-Oberfläche unter **`/api/docs`** beschreibt sie und die Partner-Schnittstelle zum Lesen und
Ausprobieren (OpenAPI 3.1 unter `/api/v1/openapi.json`, Quelle `lib/openapi.ts`). Verhalten, Grenzen
(`INQUIRY_*`) und Pflege: [docs/anfrage-api.md](docs/anfrage-api.md).

## Partner-Schnittstelle

Partnersysteme (z. B. Seeräuber digital) liefern Druckaufträge per API ein (`POST /api/partner/requests`,
Status-Abruf, Storno) und bekommen Statuswechsel als signierte Webhooks. Endpunkte, Signatur, Statusmodell,
Fehlercodes, Partner anlegen (`node scripts/partner-key.mjs`) und Env-Variablen:
[docs/partner-api.md](docs/partner-api.md).

## Virenscan (ClamAV)

Uploads werden per ClamAV geprüft. `CLAMAV_MODE=daemon` (Standard) scannt synchron per clamd;
`CLAMAV_MODE=batch` lässt clamd weg: Dateien zeigen „Virenprüfung läuft“, ein Cron-Job
(`Dockerfile.scan`, `scripts/scan-pending.mjs`, auf Railway alle 10 Minuten) prüft sie und beendet sich.
Ablauf, Variablen und Railway-Einrichtung: [docs/virenscan.md](docs/virenscan.md).

## E-Mail-Versand (Brevo oder SMTP)

Alle Mails (Anmelde-/Freigabecodes, Auftragsbestätigung mit Anhängen, Freigabe-Quittung, Hinweis an
`FIRM_INBOX`, Versandbestätigung mit Rechnung) laufen über `lib/mail.ts`. Der Transport wird per Env gewählt:

| Variable | Bedeutung |
|---|---|
| `MAIL_TRANSPORT` | `brevo` oder `smtp`. Leer: `brevo`, sobald `BREVO_API_KEY` gesetzt ist, sonst `smtp`. |
| `BREVO_API_KEY` | API-Key aus Brevo (SMTP & API › API-Keys). Nur Server-Env, nie `NEXT_PUBLIC_*`. |
| `MAIL_FROM` | Absender `Name <adresse>`; leer = `SMTP_FROM` (bisherige Konfiguration). |
| `MAIL_REPLY_TO` | Optional: Antwortadresse für alle Mails. |
| `MAIL_MAX_ATTACHMENTS_MB`, `MAIL_MAX_ATTACHMENT_MB` | Optional: Anhang-Grenzen übersteuern (gesamt kodiert / je Datei). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional, nur für `smtp` (lokal und in Integrationstests: Mailpit). |

**Brevo (Produktion, z. B. Railway).** Railway sperrt im Hobby-Plan ausgehendes SMTP; die App spricht deshalb
die Brevo-HTTP-API an (`POST https://api.brevo.com/v3/smtp/email`, nur `fetch`, Timeout 15 s). Vor dem Go-live:

- Absenderdomain (z. B. `druck-s.de`) in Brevo unter *Absender, Domains* verifizieren (SPF, DKIM, DMARC beim
  DNS-Anbieter setzen); `MAIL_FROM` muss zu dieser Domain gehören, sonst lehnt Brevo ab.
- In Brevo unter *Sicherheit › Autorisierte IPs* die IP-Sperre für API-Keys **ausschalten**: Railway hat keine
  feste ausgehende IP, sonst scheitert jeder Versand mit `401 unauthorized` („unrecognised IP address“).
- `/api/health` prüft Brevo per `GET /v3/account` (Ergebnis 5 Minuten zwischengespeichert).

Fehler von Brevo (`HTTP-Status`, `code`, `message`) landen im Log, ohne API-Key, Inhalte oder Adressen; die
`messageId` der Antwort wird bei Erfolg geloggt. Es gibt keine Outbox und kein automatisches Wiederholen:
wie bisher bei SMTP geht ein Fehler an den Aufrufer (Code-Mail: Fehlermeldung beim Anfordern; Versandbestätigung:
Versand bleibt gespeichert, `mailed: false`).

**Anhänge.** Brevo nimmt Anhänge Base64-kodiert an und begrenzt eine Mail auf 20 MB inkl. Inhalt, einzelne
Anhänge auf 4 MB; erlaubt sind nur bestimmte Dateitypen (u. a. PDF, JPG, PNG, TIFF, EPS, ZIP; nicht AI, SVG,
WebP). Uploads im Portal dürfen bis 100 MB groß sein. Passen Auftragsbestätigung + Druckdateien bzw. die
Rechnung nicht, geht die Mail ohne Anhänge raus und sagt dem Kunden, dass er die Dateien in seinem Auftrag
herunterladen kann (der Link führt zur Auftragsseite mit Download); das Log vermerkt es als Warnung. Mit SMTP
gibt es keine Grenze aus der App (wie bisher). Ein direkt übergebener, zu großer Anhang bricht den Versand mit
`MailAttachmentError` ab, statt ihn stillschweigend wegzulassen.
