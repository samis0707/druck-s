# Hilfe & Schulung — Pflege

Alles für Besucher (Menschen und KI-Assistenten) kommt aus **einer** Inhaltsquelle:
`lib/hilfe/inhalte.ts` (öffentliche Kurse „kunden“ und „partner“, FAQ, Glossar, feste Zahlen) und
`lib/hilfe/inhalte-mitarbeiter.ts` (Mitarbeiter-Kurs „druckerei“).

## Wer sieht was (Zugriff)

- **Öffentlich** (Gäste, Kunden, Partner): Kurse `kunden` und `partner`, FAQ, Glossar, `/llms.txt`, `/llms-full.txt`, `/hilfe.md`.
  Der Partner-Kurs bleibt bewusst öffentlich: Partner haben kein Login, und die API-Doku steht ohnehin unter `/api/docs`.
- **Nur Mitarbeitende (Rolle staff)**: Kurs `druckerei` (Seiten, Lektionen, Markdown-Fassungen, PDFs, Screenshots, Tour-Texte).
  Regeln: `lib/hilfe/zugriff.ts` (rein) und `lib/hilfe/zugriff-server.ts` (mit Sitzung). Ohne Staff-Sitzung leiten die Seiten
  zu `/staff/login?weiter=…` um (nach der Anmeldung geht es zurück); Markdown, PDFs und Bilder antworten mit 404.
  `/hilfe/druckerei…` und `/hilfe-intern/` stehen in `robots.txt` auf „disallow“, nie in `sitemap.xml` oder `llms.txt`.
- Nicht öffentliche Dateien liegen in `hilfe-intern/{pdf,img}` (nicht in `public/`) und werden über
  `app/hilfe-intern/[...datei]/route.ts` ausgeliefert. Welche Dateien intern sind, steht in `lib/hilfe/intern.json`
  (Pipeline und Route lesen dieselbe Liste; `tests/hilfe-zugriff.test.ts` prüft, dass sie zu den Kursen passt).
- Neue Staff-Lektion mit Bild: Bildname vor `zu-webp.cjs` in `intern.json` → `bilder` eintragen; neues Staff-PDF: Dateiname
  in `intern.json` → `pdfs`, `href` unter `/hilfe-intern/…`. Staff-Tour-Texte stehen in `components/tour/touren-mitarbeiter.ts`
  (nur über `/api/staff/hilfe/tour/<id>`); `touren.ts` und alle `"use client"`-Dateien dürfen weder sie noch
  `inhalte-mitarbeiter.ts` importieren — sonst landen die Texte in öffentlichen JavaScript-Dateien.

| Teil | Wo | Quelle |
| --- | --- | --- |
| Online-Schulung | `/hilfe`, `/hilfe/<kurs>`, `/hilfe/<kurs>/<lektion>` | `app/hilfe/**`, `components/hilfe/**` |
| Geführte Touren (Toast + Coachmarks) | `/upload`, `/requests/<id>`, `/staff`, `/staff/personalisierung` (Übersicht und je Schritt des Assistenten), `/personalisieren/<ref>`, `/staff/kalkulation` (drei Seiten) | `components/tour/**`, Anker `data-tour="…"` |
| Hilfe-Menü | Staff-Bereich, Kopf von „Aufträge“ | `components/hilfe/HilfeMenue.tsx` |
| PDF-Kurzanleitungen | `public/hilfe/*.pdf` (öffentlich), `hilfe-intern/pdf/*.pdf` (Mitarbeiter) | `docs/schulung/{kunden,druckerei,partner,personalisierung-vorlage,personalisierung-ausfuellen,kalkulation}.html` + `style.css` |
| Für KI-Assistenten | `/llms.txt`, `/llms-full.txt`, jede Hilfeseite + `.md` | `lib/hilfe/markdown.ts` |
| Strukturierte Daten (JSON-LD) | Startseite, `/hilfe`, Kurse, Lektionen | `lib/hilfe/jsonld.ts` |
| Suchmaschinen | `/robots.txt`, `/sitemap.xml`, Canonicals, `noindex` für private Bereiche | `app/robots.ts`, `app/sitemap.ts`, `app/*/layout.tsx` |

Die Basis-URL für Canonicals, Sitemap, llms.txt und JSON-LD ist `APP_BASE_URL` (auf Railway: `https://www.druck-s.de`;
`druck-s.de` ohne www leitet beim Domain-Anbieter auf www weiter — dauerhaft per 301).

## Texte ändern

1. `lib/hilfe/inhalte.ts` bzw. `inhalte-mitarbeiter.ts` bearbeiten. Beschriftungen von Knöpfen/Feldern/Status **exakt wie in der App** in „…“.
2. `npx vitest run tests/hilfe.test.ts` — der Test prüft u. a., dass jede zitierte Beschriftung im App-Code
   vorkommt, jede Tour-Station einen `data-tour`-Anker hat und alle Bilder/PDFs existieren.
3. `HILFE_STAND` in `lib/hilfe/site.ts` auf das heutige Datum setzen (erscheint in llms.txt und JSON-LD).

Themenblöcke: `Lektion.block` gliedert die Lektionsliste (Druckerei: „Aufträge und Kunden“, „Personalisierung“,
„Kalkulation und Richtpreis“). Eine Kurzanleitung zu einem Block hängt als `Lektion.download` an den Lektionen des Blocks
(`kursDownloads()` sammelt sie für /hilfe, Kursseite, Hilfe-Menü und Markdown).

Einführung für Mitarbeitende: [einfuehrung-personalisierung-kalkulation.md](einfuehrung-personalisierung-kalkulation.md)
(Schulungsplan 60–90 Minuten, Übungen, Checkliste, Übergabe-Notiz).

## Beispieldaten für Personalisierung und Kalkulation

Alles erfunden (Muster GmbH). Die Screenshots lesen nur die fertigen Dateien in `docs/schulung/beispiele/`:

```bash
npx vite-node docs/schulung/personalisierung-beispiele.mts   # Design-PDFs, Beispieltabelle, Vorschauen, Prüfmeldungen (echte Engine, ohne Datenbank)
DATABASE_URL=postgres://dam:dam@localhost:5432/dam_hilfe node scripts/kalkulation-beispieldaten.mjs   # nur lokale DB
DATABASE_URL=postgres://dam:dam@localhost:5432/dam_hilfe npx tsx docs/schulung/kalkulation-fixtures.ts # → kalkulation-fixtures.json
```

`visitenkarte-design.pdf`, `namensschild-design.pdf` und `visitenkarten-beispiel.csv` sind zugleich die Übungsdateien der Schulung.

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

`NUR=neu node docs/schulung/screenshots.cjs …` nimmt nur die Bilder zu Personalisierung, Kalkulation und Richtpreis auf.
`zu-webp.cjs` schreibt `public/hilfe/img/*.webp` (Bilder des Mitarbeiter-Kurses: `hilfe-intern/img/*.webp`) und ergänzt die Maß-Tabelle `lib/hilfe/bilder.ts` (vorhandene Einträge bleiben).
Bilder vorher ansehen: richtige Seite, kein Toast/Tooltip, deutsches Datum.

## PDF-Kurzanleitungen neu erzeugen

Die Bildausschnitte in `docs/schulung/bilder/*.jpg` stammen aus denselben Screenshots (bei UI-Änderungen neu
schneiden; die neuen mit `node docs/schulung/ausschnitte.cjs /tmp/shots`). Dann:

```bash
node docs/schulung/render.cjs
```

Das Skript meldet je Seite, ob Inhalt in die Fußzeile ragt (Exit 2). Dann Text kürzen oder Bild schmaler —
nie Schrift unter 9 pt. Vorschau: `docs/schulung/preview-*.png` (nicht im Repo).
QR-Codes (`qr-*.svg`) zeigen auf `https://www.druck-s.de/hilfe/<kurs>` bzw. die erste Lektion des Themenblocks; bei Domainwechsel neu erzeugen
(z. B. mit dem npm-Paket `qrcode`). Schrift: Geist (`fonts/`, SIL Open Font License).

## Touren

- Texte in `components/tour/touren.ts` (öffentlich) bzw. `touren-mitarbeiter.ts` (Staff), Anker als `data-tour="…"` direkt am Element.
- `?tour=aus` unterdrückt die Einladung (Screenshots), `?tour=start` startet sofort (Links aus der Hilfe).
- Der Assistent der Personalisierung hat je Schritt eine eigene Tour (`vorlage-design`, `-felder`, `-bogen`, `-freigabe`); die Einladung (Toast) erscheint nur für die ersten beiden (`PageTour einladen={…}`).
- Wesentliche Änderung einer Tour → Schlüssel-Version in `components/tour/storage.ts` (`v1` → `v2`) erhöhen,
  damit Nutzer die Einladung erneut sehen.

## Nach jeder UI-Änderung kurz prüfen

1. `npx vitest run tests/hilfe.test.ts tests/hilfe-zugriff.test.ts tests/tour.test.ts`
2. Screenshots + WebP neu, Ausschnitte neu, `render.cjs`.
3. Tour je Seite einmal durchklicken (`/upload?tour=start`, `/staff?tour=start`, `/staff/personalisierung?tour=start`, `/staff/kalkulation?tour=start`, `/personalisieren/<ref>?tour=start`).
