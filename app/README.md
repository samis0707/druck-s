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

## Analytics

Das Portal bindet optional [Plausible Analytics](https://plausible.io) ein (cookielos, keine personenbezogenen Daten).
Die Einbindung ist aus, solange `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` nicht gesetzt ist.

- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`: in Plausible angelegte Domain, z. B. `druckraum.example.de`.
- `NEXT_PUBLIC_PLAUSIBLE_SRC` (optional): Script-URL, Standard `https://plausible.io/js/script.js`.

`NEXT_PUBLIC_*`-Variablen werden beim `next build` in den Bundle eingebacken. Sie müssen daher zur
**Build-Zeit** vorliegen: im Docker-Build als Build-Arg (`docker-compose.prod.yml` reicht sie durch,
in Coolify als Build-Variable markieren). Eine Änderung zur Laufzeit hat keine Wirkung; nach dem
Ändern neu bauen. Falls später eine Content-Security-Policy ergänzt wird, muss die Script-Domain
in `script-src` und `connect-src` freigegeben werden (derzeit gibt es keine CSP).

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
