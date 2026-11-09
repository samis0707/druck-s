# Hilfe & Schulung — Pflege

Alles für Besucher (Menschen und KI-Assistenten) kommt aus **einer** Inhaltsquelle:
`lib/hilfe/inhalte.ts` (Kurse, Lektionen, Quiz, FAQ, Glossar, feste Zahlen).

| Teil | Wo | Quelle |
| --- | --- | --- |
| Online-Schulung | `/hilfe`, `/hilfe/<kurs>`, `/hilfe/<kurs>/<lektion>` | `app/hilfe/**`, `components/hilfe/**` |
| Geführte Touren (Toast + Coachmarks) | `/upload`, `/requests/<id>`, `/staff` | `components/tour/**`, Anker `data-tour="…"` |
| Hilfe-Menü | Staff-Bereich, Kopf von „Aufträge“ | `components/hilfe/HilfeMenue.tsx` |
| PDF-Kurzanleitungen | `public/hilfe/*.pdf` | `docs/schulung/{kunden,druckerei,partner}.html` + `style.css` |
| Für KI-Assistenten | `/llms.txt`, `/llms-full.txt`, jede Hilfeseite + `.md` | `lib/hilfe/markdown.ts` |
| Strukturierte Daten (JSON-LD) | Startseite, `/hilfe`, Kurse, Lektionen | `lib/hilfe/jsonld.ts` |
| Suchmaschinen | `/robots.txt`, `/sitemap.xml`, Canonicals, `noindex` für private Bereiche | `app/robots.ts`, `app/sitemap.ts`, `app/*/layout.tsx` |

Die Basis-URL für Canonicals, Sitemap, llms.txt und JSON-LD ist `APP_BASE_URL` (auf Railway: `https://druck-s.de`).

## Texte ändern

1. `lib/hilfe/inhalte.ts` bearbeiten. Beschriftungen von Knöpfen/Feldern/Status **exakt wie in der App** in „…“.
2. `npx vitest run tests/hilfe.test.ts` — der Test prüft u. a., dass jede zitierte Beschriftung im App-Code
   vorkommt, jede Tour-Station einen `data-tour`-Anker hat und alle Bilder/PDFs existieren.
3. `HILFE_STAND` in `lib/hilfe/site.ts` auf das heutige Datum setzen (erscheint in llms.txt und JSON-LD).

## Screenshots neu erzeugen (nach UI-Änderungen)

Die App läuft dafür **ohne Datenbank**; `screenshots.cjs` beantwortet alle `/api`-Aufrufe mit den fiktiven
Daten aus `testdaten.cjs` (Muster GmbH, example.org). Keine echten Kundendaten.

```bash
npm run predev && PARTNER_WEBHOOK_WORKER=off npx next dev -p 3100
```

```bash
node docs/schulung/screenshots.cjs http://localhost:3100 /tmp/shots
```

```bash
node docs/schulung/zu-webp.cjs /tmp/shots
```

`zu-webp.cjs` schreibt `public/hilfe/img/*.webp` und die Maß-Tabelle `lib/hilfe/bilder.ts`.
Bilder vorher ansehen: richtige Seite, kein Toast/Tooltip, deutsches Datum.

## PDF-Kurzanleitungen neu erzeugen

Die Bildausschnitte in `docs/schulung/bilder/*.jpg` stammen aus denselben Screenshots (bei UI-Änderungen neu
schneiden). Dann:

```bash
node docs/schulung/render.cjs
```

Das Skript meldet je Seite, ob Inhalt in die Fußzeile ragt (Exit 2). Dann Text kürzen oder Bild schmaler —
nie Schrift unter 9 pt. Vorschau: `docs/schulung/preview-*.png` (nicht im Repo).
QR-Codes (`qr-*.svg`) zeigen auf `https://druck-s.de/hilfe/<kurs>`; bei Domainwechsel neu erzeugen
(z. B. mit dem npm-Paket `qrcode`). Schrift: Geist (`fonts/`, SIL Open Font License).

## Touren

- Texte in `components/tour/touren.ts`, Anker als `data-tour="…"` direkt am Element.
- `?tour=aus` unterdrückt die Einladung (Screenshots), `?tour=start` startet sofort (Links aus der Hilfe).
- Wesentliche Änderung einer Tour → Schlüssel-Version in `components/tour/storage.ts` (`v1` → `v2`) erhöhen,
  damit Nutzer die Einladung erneut sehen.

## Nach jeder UI-Änderung kurz prüfen

1. `npx vitest run tests/hilfe.test.ts tests/tour.test.ts`
2. Screenshots + WebP neu, Ausschnitte neu, `render.cjs`.
3. Tour je Seite einmal durchklicken (`/upload?tour=start`, `/staff?tour=start`).
