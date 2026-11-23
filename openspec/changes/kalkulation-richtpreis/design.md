# Design

## Entscheidungen

- **Engine vendoren statt Service oder Port**: unverändert kopiert, Alias `@druck/*` über tsconfig/vitest; Anpassungen gehören ins kalpri-Repo. Drift sichtbar über `HERKUNFT.json`.
- **Bereiche als Text, nicht jsonb**: die Werkbank vergleicht Zeichen für Zeichen. Version je Bereich; Schreiben unter Advisory-Lock je Bereich; Verlauf per Trigger nur anhängend.
- **Dateien**: S3-Modul von druck-s, Schlüssel `kalkulation/dateien/<sha256>`, Metadaten in `kalkulation_dateien`.
- **API-Schlüssel**: der Partner-Mechanismus passt nicht (hängt an `partners`, kein Scope); eigene Tabelle `kalkulation_api_keys` (Hash, Präfix `kal_`, Scope). Verwaltung per `scripts/kalkulation-key.mjs`.
- **Preisschicht ganzzahlig**: Prozent als Hundertstel-Prozent, jede Stufe rundet einmal; Zwischenwerte Zehntelcent, Ergebnis Cent.
- **Unvollständig = kein Preis**: offene Fragen, `vollstaendig=false`, Zeilen ohne Kosten.
- **Öffentlich**: nur freigegebene Artikel; interne Fragen („Wer macht es?“) und Kennungen ausgeblendet; Antwort ohne Kosten und interne Hinweise; zod strikt, deutsche Meldungen; Limit je IP über `audit_log` (ohne Personendaten außer der IP).
- **Werkbank einbetten**: Patch `lib/kalpri/werkbank.patch` (feste Adresse, Cookie statt Schlüssel, Basis-Pfad); Build in temporärem Ordner; Auslieferung per Route-Handler nur für Staff, CSP, Schreibzugriffe mit Ursprungsprüfung (CSRF).

## Grenzen und Risiken

- Patch kann bei Änderungen in kalpri nicht mehr anwenden: dann `kalpri-sync.mjs --werkbank` anpassen.
- Lokale Browserdaten der Werkbank bleiben nach Abmeldung im Browser (gemeinsame Rechner beachten).
- Kein Mengenstaffel-/Kundengruppen-Preis; Richtpreise sind Schätzungen.
- Rate-Limit der Artikelliste zählt im Speicher je Instanz.

## Rollout

Migration beim Start; Stammdaten per Import oder Werkbank; Schlüssel per Skript; Entwicklungsdaten nur lokal (`scripts/kalkulation-beispieldaten.mjs`).
