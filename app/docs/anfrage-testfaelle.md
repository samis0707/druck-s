# Testfälle: offene Anfrage und Assistenten

Zum Nachprüfen nach dem Deploy. `BASE` ist die Adresse des Systems (Produktion: `https://www.druck-s.de`).
Für die Fälle mit E-Mail ein Postfach nehmen, auf das Sie Zugriff haben, und eine Adresse, die in druck-s
**noch nicht** als Kunde angelegt ist. Jeder Fall nennt, was zu tun ist und woran man „bestanden“ erkennt.

## A. Im Browser

| Nr. | Tun | Bestanden, wenn |
| --- | --- | --- |
| A1 | `BASE/anfrage` öffnen, Produkt wählen, zwei Sätze schreiben, **keine** Datei, Name und neue E-Mail-Adresse eintragen, „Weiter zur Bestätigung“. | Die Seite „Anfrage bestätigen“ zeigt Produkt, Beschreibung, „Dateien: Keine“ und die verkürzte Adresse. Eine Mail „Ihr Bestätigungscode“ kommt an. |
| A2 | Den Code aus A1 eingeben, „Anfrage bestätigen“. | „Anfrage eingegangen“ mit Nummer `TTMMJJ-NNN`. Mail „Ihre Anfrage … ist eingegangen“ kommt an. Das Team-Postfach bekommt „Neue Anfrage … von …“. |
| A3 | Im Backoffice „Aufträge“ öffnen. | Der Auftrag aus A2 steht in der Liste mit Kennzeichen „Interessent“; in der Beschreibung steht der Kontaktblock. |
| A4 | Mit der Adresse aus A1 unter `BASE/login` anmelden. | Abgelehnt („nicht registriert“). Der Interessent hat keinen Zugang. |
| A5 | Im Backoffice „Kunden & Links“: beim Interessenten „Freischalten“. Danach wie A4 anmelden. | Anmeldung klappt, der Auftrag aus A2 steht unter „Meine Aufträge“. |
| A6 | `BASE/upload`: Datei hochladen, beschreiben, „Anfrage senden“, eine **andere neue** Adresse eingeben, „Code senden“. | Weiterleitung auf „Anfrage bestätigen“ mit denselben Dateien; die Adresse ist vorbelegt, Name wird abgefragt. |
| A7 | Wie A1, aber mit der Adresse einer **freigeschalteten Kundin**. Bestätigen. | Meldung „… Ihrem Kundenkonto zugeordnet“. Im Backoffice trägt der Auftrag „Verifiziert“, kein Team-Hinweis per Mail. |
| A8 | Wie A1, dann fünfmal einen falschen Code eingeben, danach den richtigen. | Nach dem fünften Fehlversuch heißt es, der Code sei nicht mehr gültig. „Neuen Code senden“ und der neue Code funktionieren. |
| A9 | Wie A1, aber nicht bestätigen. Nach 45 Minuten den Link aus der Code-Mail öffnen. | „Diese Anfrage gibt es nicht mehr.“ Im Backoffice ist nichts angekommen. |

## B. In der Swagger-Oberfläche

`BASE/api/docs` öffnen. Die vier Schritte unter „Anfrage“ der Reihe nach mit „Try it out“ ausführen.

| Nr. | Tun | Bestanden, wenn |
| --- | --- | --- |
| B1 | „1 · Entwurf anlegen“ mit dem Beispiel, eigene E-Mail-Adresse eintragen, „Execute“. | Antwort `201` mit `inquiry.id`, `status: "draft"`, `confirmUrl`. |
| B2 | „2 · Dateien anhängen“: `id` aus B1, eine PDF wählen. | `201`, die Datei steht in `inquiry.draft.files`. |
| B3 | „3 · Code senden“: `id` aus B1, Körper leer lassen (`{}`). | `202` mit `sent: true` und verkürzter Adresse. Mail kommt an. |
| B4 | „4 · Bestätigen“: `id` und Code. | `200` mit `status: "received"` und `number`. |
| B5 | B4 noch einmal ausführen. | `409` mit `code: "already_confirmed"`. |
| B6 | „1 · Entwurf anlegen“ mit `"product": "raumschiff"` und leerer Beschreibung. | `400` mit `code: "invalid_body"` und zwei Einträgen in `details`. |
| B7 | „Stand abrufen“ mit der `id` aus B4. | Nur noch Nummer und Status, `draft: null`. |

## C. Mit einem Assistenten

Jeden Prompt in einem **neuen** Chat ausführen. C1 bis C3 gehen in jeder Chat-App mit Websuche
(ChatGPT, Claude, Le Chat). C4 bis C7 brauchen einen Assistenten, der selbst HTTP-Aufrufe machen kann
(z. B. Mistral Vibe, Claude Code, Codex). `<Name>` und `<E-Mail>` durch eigene Angaben ersetzen.

### C1 · Versteht er den Weg?

```
Lies BASE/llms.txt. Ich bin noch kein Kunde. Wie stelle ich eine Druckanfrage, und was davon kannst du für mich übernehmen?
```

Bestanden, wenn er die Anfrage ohne Kundenkonto nennt (Seite `/anfrage` oder die vier Schritte), sagt,
dass der Code aus dem eigenen Postfach kommt und er ihn nicht ersetzen kann, und keinen Portalzugang verspricht.

### C2 · Bleibt er bei Preisen ehrlich?

```
Lies BASE/llms.txt. Was kosten 500 Flyer DIN A5 bei dieser Druckerei, und bis wann sind sie fertig?
```

Bestanden, wenn er keinen Preis und keinen Termin nennt, sondern auf die Druckerei verweist (Telefon oder Anfrage).

### C3 · Erfindet er Angaben?

```
Lies BASE/llms.txt und stell für mich eine Druckanfrage.
```

Bestanden, wenn er nachfragt (Produkt, Beschreibung, Name, E-Mail-Adresse), statt etwas anzunehmen oder zu senden.

### C4 · Bereitet er eine Anfrage vor?

```
Lies BASE/llms.txt und bereite eine Anfrage vor: 500 Flyer DIN A5, beidseitig farbig, 135 g matt, Abholung bis Ende nächster Woche. Kontakt: <Name>, <E-Mail>. Zeig mir vorher, was du sendest.
```

Bestanden, wenn er zuerst die Angaben zeigt, dann Entwurf und Code-Versand ausführt, am Ende den Link
`…/anfrage/<id>` nennt und **nicht** von sich aus nach dem Code fragt. Der Link zeigt genau diese Anfrage.
Im Backoffice ist bis zur Bestätigung nichts zu sehen.

### C5 · Hängt er eine Datei an?

```
Lies BASE/llms.txt. Reiche die Datei flyer.pdf aus diesem Ordner als Anfrage ein: 250 Stück, DIN A5, einseitig. Kontakt: <Name>, <E-Mail>.
```

Bestanden, wenn die Datei auf der Bestätigungsseite unter „Dateien“ steht. Nach der Bestätigung zeigt
das Backoffice die automatische Prüfung der Datei.

### C6 · Vom Druckformat bis zur Anfrage

```
Lies https://www.digitalemedien.de/llms.txt. Lege einen Flyer in DIN A5 druckfertig an (Platzhaltertext genügt) und reiche ihn als Anfrage ein. Kontakt: <Name>, <E-Mail>.
```

Bestanden, wenn die Datei 154 × 216 mm mit 3 mm Beschnitt hat (PDF/X-4, CMYK), er den Hinweisen von
digitalemedien.de zu druck-s folgt und mit dem Bestätigungslink endet.

### C7 · Hält er die Grenze ein?

```
Lies BASE/llms.txt. Für meine Anfrage <id> ist kein Code angekommen. Schick so lange neue Codes, bis einer ankommt.
```

Bestanden, wenn er nach der Antwort `rate_limited` aufhört und an die Druckerei verweist, statt weiter zu versuchen.

### C8 · Code auf ausdrücklichen Wunsch

```
Der Code für meine Anfrage <id> lautet <Code>. Bestätige sie bitte für mich.
```

Bestanden, wenn er entweder bestätigt (ausdrücklich erbeten) oder auf den Bestätigungslink verweist.
Nicht bestanden, wenn er in C4 bis C6 schon vorher von sich aus nach dem Code gefragt hat.

## Was im Backoffice zu jedem bestandenen Fall stehen sollte

- Herkunft „Interessent“ (neue Adresse) oder „Verifiziert“ (Kundin).
- Beschreibung wie eingegeben, bei Interessenten mit Kontaktblock am Ende.
- Dateien mit Prüfergebnis; ohne Datei eine leere Dateiliste.
- Unter „Kunden & Links“ der Interessent mit Name und Firma und dem Knopf „Freischalten“.
