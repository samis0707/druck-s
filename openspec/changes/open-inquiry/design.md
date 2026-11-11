# Design

## Entscheidungen

**Eigener Code statt Better-Auth-OTP.** Die OTP-Endpunkte von Better Auth verlangen einen vorhandenen Nutzer (`USER_NOT_FOUND` nach der Prüfung). Den Nutzer vor der Bestätigung anzulegen hieße: Jede eingetippte Adresse erzeugt einen Datensatz. Deshalb liegt der Code der offenen Anfrage in `inquiry_codes`, gebunden an genau einen Entwurf: HMAC-SHA256 über Entwurf und Code (Schlüssel `BETTER_AUTH_SECRET`), sechs Ziffern aus `crypto.randomInt`, gültig `OTP_TTL_MINUTES`, einmalig, höchstens `INQUIRY_CODE_ATTEMPTS` Fehlversuche. Er erzeugt keine Sitzung und ist kein Anmelde- oder Freigabe-Code. Das 2026 entfernte handgebaute OTP hatte Sitzungen und Cookies; beides gibt es hier nicht.

**„Kein Selbst-Onboarding“ bleibt.** `disableSignUp` bleibt an. Der Interessenten-Datensatz entsteht erst nach bestätigter E-Mail-Adresse, per SQL mit Status „prospect“. Er gibt nichts frei: Anmeldung (`/api/login/otp`), Door A und die Auftragsansicht verlangen Status „customer“ bzw. `customer_id`. Der Datensatz sorgt nur dafür, dass die Druckerei den Interessenten in „Kunden & Links“ sieht und mit einem Klick freischaltet; die bestehende Freischaltung bindet die Anfragen an das Konto.

**Herkunft statt neuer Vertrauensstufe.** Interessenten-Anfragen laufen als `trust = 'VOUCHED'` (Quarantäne und Virenscan vor der Vorschau, keine Freigabe ohne Freischaltung) und sind über `origin = 'inquiry'` erkennbar. Keine Änderung an der Vertrauens-Prüfung, kein neuer Zweig in der Pipeline.

**Kontakt im Freitext.** Name, Firma, Telefon und Adresse werden bei der Bestätigung an `free_text` angehängt (wie bei Partner-Aufträgen). Staff-Ansicht und KI-Notiz brauchen keinen Sonderfall.

**Eine Schnittstelle für Mensch, Seite und Assistent.** `/anfrage`, `/anfrage/[id]` und der Upload-Rückfall nutzen dieselben vier Endpunkte wie ein Assistent. Die Antwort enthält `confirmUrl`: Der Assistent bereitet vor, der Mensch sieht die Anfrage und gibt den Code selbst ein.

**Keine Preisgabe bekannter Adressen.** Code-Versand und Bestätigung antworten für Kundinnen und Interessenten gleich; nur „gesperrt“ und „Team-Adresse“ werden gemeldet. (Die bestehende Upload-Tür verrät unbekannte Adressen schon heute; das bleibt, damit die Seite weiterleiten kann.)

## Grenzen

Zählung über `audit_log` (instanzübergreifend): Entwürfe je IP und Stunde, Code-Mails je Entwurf, je Adresse und Stunde, je IP und Stunde. `clientIp` liest wie überall `x-forwarded-for`; die IP-Grenzen sind deshalb ein Backstop, die Grenzen je Entwurf und je Adresse greifen unabhängig davon.

## Risiken

- [Spam-Anfragen] → Code aus dem Postfach nötig; unbestätigte Entwürfe löscht der bestehende Sweep nach `DRAFT_TTL_MINUTES`.
- [Postfach-Flut an fremde Adressen] → 5 Code-Mails je Adresse und Stunde.
- [Fremde Dateien im Speicher] → wie Door A: nur am Entwurf, Sweep räumt auf; 20 Dateien je Anfrage.
- [Kennung als Schlüssel] → UUID v4; zeigt Inhalte nur im Entwurf, danach nur Nummer und Status.

## Rollout

Migration 009 läuft beim Start. Rückbau: Routen `/api/v1/inquiries*` und Seiten `/anfrage*` entfernen; bestehende Anfragen bleiben gültige Aufträge. DOWN der Migration schlägt fehl, solange Anfragen mit `origin = 'inquiry'` existieren.
