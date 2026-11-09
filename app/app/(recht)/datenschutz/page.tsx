import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { Inhalt, RechtKopf } from "../bausteine";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

const abschnitte = [
  { id: "verantwortlicher", titel: "1. Verantwortlicher" },
  { id: "daten", titel: "2. Welche Daten wir verarbeiten" },
  { id: "zwecke", titel: "3. Zwecke und Rechtsgrundlagen" },
  { id: "anmeldung", titel: "4. Anmeldung per Einmalcode, Cookies und lokaler Speicher" },
  { id: "vorpruefung", titel: "5. Automatischer Vorprüfungs-Hinweis (Mistral AI)" },
  { id: "virenpruefung", titel: "6. Prüfung auf Schadsoftware" },
  { id: "e-mail", titel: "7. E-Mail-Versand" },
  { id: "hosting", titel: "8. Hosting und Server-Logdateien" },
  { id: "reichweitenmessung", titel: "9. Reichweitenmessung (Plausible Analytics)" },
  { id: "empfaenger", titel: "10. Empfänger der Daten" },
  { id: "speicherdauer", titel: "11. Speicherdauer" },
  { id: "rechte", titel: "12. Ihre Rechte" },
  { id: "widerspruch", titel: "13. Widerspruchsrecht" },
  { id: "beschwerde", titel: "14. Beschwerderecht" },
];

export default function DatenschutzPage() {
  return (
    <>
      <RechtKopf titel="Datenschutzerklärung" />

      <p>
        Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Diese Erklärung informiert Sie
        gemäß Art. 13 und 14 DSGVO darüber, welche Daten wir bei der Nutzung des Portals dmp
        druckraum verarbeiten, wofür wir sie verwenden und welche Rechte Ihnen zustehen.
      </p>

      <Inhalt eintraege={abschnitte} />

      <h2 id="verantwortlicher">1. Verantwortlicher</h2>
      <address>
        {company.name}
        <br />
        {company.street}
        <br />
        {company.zip} {company.city}
        <br />
        Telefon: <a href={`tel:${company.phoneHref}`}>{company.phone}</a>
        <br />
        E-Mail: <a href={`mailto:${company.email}`}>{company.email}</a>
      </address>
      <p>
        Vertreten durch den Geschäftsführer {company.managingDirector}. Bei allen Fragen zum
        Datenschutz erreichen Sie uns unter <a href={`mailto:${company.email}`}>{company.email}</a>.
      </p>

      <h2 id="daten">2. Welche Daten wir verarbeiten</h2>
      <ul>
        <li>
          <strong>Kontakt- und Kontodaten:</strong> E-Mail-Adresse sowie, soweit angegeben, Name und
          Firma.
        </li>
        <li>
          <strong>Druckdaten:</strong> die von Ihnen hochgeladenen Dateien und die daraus technisch
          abgeleiteten Kennwerte (z. B. Seitenzahl, Abmessungen, Farbmodus, Auflösung).
        </li>
        <li>
          <strong>Auftragsdaten:</strong> Produktauswahl, Referenz, Freitext-Angaben, Status,
          Auftragsbestätigungen in ihren Versionen und Kommunikation zum Auftrag.
        </li>
        <li>
          <strong>Freigabe- und Ereignisprotokoll:</strong> Zeitpunkt, Art und Version von
          Auftragsschritten, insbesondere der Bestätigung per Einmalcode und der Freigabe, samt
          IP-Adresse und Browserkennung (User-Agent).
        </li>
        <li>
          <strong>Nutzungs- und Verbindungsdaten:</strong> Server-Logdateien beim Aufruf des
          Portals (siehe Abschnitt 8).
        </li>
      </ul>

      <h2 id="zwecke">3. Zwecke und Rechtsgrundlagen</h2>
      <ul>
        <li>
          <strong>Bereitstellung des Portals und Abwicklung Ihrer Aufträge</strong> — Anfrage,
          Prüfung, Auftragsbestätigung, Freigabe, Produktion, Versand und Rechnungsstellung.
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag und vorvertragliche Maßnahmen).
        </li>
        <li>
          <strong>Anmeldung, Identitätsbestätigung und Nachweis von Freigaben</strong> durch
          Einmalcode und Protokollierung. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und lit. f DSGVO;
          unser berechtigtes Interesse liegt in der sicheren Abwicklung und in der
          Nachweisbarkeit verbindlicher Freigaben.
        </li>
        <li>
          <strong>Automatische Vorprüfung, Virenprüfung und Sicherheit des Betriebs</strong>{" "}
          (Abschnitte 5, 6 und 8). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes
          Interesse liegt in effizienter Auftragsprüfung, fehlerfreiem Druck und dem Schutz unserer
          Systeme.
        </li>
        <li>
          <strong>Reichweitenmessung</strong> (Abschnitt 9). Rechtsgrundlage: Art. 6 Abs. 1 lit. f
          DSGVO.
        </li>
        <li>
          <strong>Erfüllung gesetzlicher Aufbewahrungs- und Nachweispflichten</strong>, insbesondere
          nach §§ 147 AO und 257 HGB. Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO.
        </li>
      </ul>
      <p>
        Die Bereitstellung der für einen Auftrag erforderlichen Daten ist vertraglich notwendig.
        Ohne E-Mail-Adresse und Druckdaten können wir Ihren Auftrag nicht bearbeiten.
      </p>

      <h2 id="anmeldung">4. Anmeldung per Einmalcode, Cookies und lokaler Speicher</h2>
      <p>
        Das Portal kennt kein Passwort. Zur Bestätigung eines Auftrags, zur Anmeldung und zur
        Freigabe senden wir einen Einmalcode an Ihre E-Mail-Adresse. Der Code ist nur kurze Zeit
        gültig und wird bei uns nicht im Klartext gespeichert.
      </p>
      <p>
        Nach erfolgreicher Anmeldung setzen wir ein <strong>Sitzungs-Cookie</strong>, das Sie für die
        Dauer der Sitzung als angemeldeten Nutzer erkennt. Eine Sitzung läuft nach 24 Stunden ohne Nutzung ab. Das Cookie ist für den
        Betrieb des Portals technisch erforderlich; es wird ohne Ihre Einwilligung gesetzt (§ 25
        Abs. 2 Nr. 2 TDDDG). Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b und
        lit. f DSGVO.
      </p>
      <p>Außerdem nutzen wir den Speicher Ihres Browsers für technisch notwendige Einstellungen:</p>
      <ul>
        <li>
          <strong>localStorage:</strong> Ihre Wahl zwischen hellem und dunklem Erscheinungsbild,
          ob Sie eine geführte Tour bereits gesehen haben, Ihr Lernfortschritt in der
          Online-Schulung unter „Hilfe“ (welche Lektionen Sie als erledigt markiert haben) sowie im
          Mitarbeiterbereich die gewählte Ansicht der Auftragsliste.
        </li>
        <li>
          <strong>sessionStorage:</strong> eine Merkmarke, die nach dem Absenden eines Auftrags
          einmalig den passenden Hinweis anzeigt, und eine Merkmarke, dass Ihnen die Einladung zur
          geführten Tour in dieser Sitzung schon angezeigt wurde. Beide bestehen nur für die Dauer
          der Sitzung.
        </li>
      </ul>
      <p>
        Diese Angaben verlassen Ihren Browser nicht und dienen weder der Nachverfolgung noch der
        Werbung. Tracking- oder Marketing-Cookies setzen wir nicht ein.
      </p>

      <h2 id="vorpruefung">5. Automatischer Vorprüfungs-Hinweis (Mistral AI)</h2>
      <p>
        Nach dem Absenden eines Auftrags erstellt das Portal automatisch einen Hinweis für Sie und
        unsere Mitarbeiter. Er gleicht Ihre Angaben mit den hochgeladenen Dateien und – soweit
        vorhanden – früheren Aufträgen ab, stellt Rückfragen bei Abweichungen (z. B. Seitenzahl in
        der Beschreibung und in der Datei) und schlägt eine Produktkategorie vor. Dafür setzen wir
        einen KI-Sprachdienst ein.
      </p>
      <p>
        Dienstleister ist die <strong>Mistral AI SAS, Paris, Frankreich</strong>, die für uns als
        Auftragsverarbeiter nach Art. 28 DSGVO tätig ist. Wir nutzen ausschließlich den
        EU-Endpunkt (api.eu.mistral.ai).
      </p>
      <p>Folgende Daten werden dabei übermittelt:</p>
      <ul>
        <li>Ihre Produktauswahl, die Referenz und Ihre Freitext-Angaben zum Auftrag;</li>
        <li>
          aus den hochgeladenen Dateien technisch abgeleitete Kennwerte: Dateiname, Dateityp,
          Seitenzahl, bei Tabellen Blattnamen und Zeilenzahl, bei Präsentationen und
          Textdokumenten die Anzahl der Folien bzw. Absätze, bei Bildern die Abmessungen sowie im
          Freitext vorkommende Zahlen;
        </li>
        <li>
          die Ergebnisse unserer automatischen Druckdaten-Analyse in Kurzform (z. B. Auflösung,
          Farbmodus, Schrifteinbettung);
        </li>
        <li>
          soweit für Ihr Konto ein Auftragsverlauf aus unserem Auftragssystem hinterlegt ist: eine
          Übersicht früherer Aufträge mit Auftragsnummer, Datum, Produkt, Menge und
          Auftragsmerkmalen.
        </li>
      </ul>
      <p>
        <strong>Nicht übermittelt</strong> werden die Inhalte Ihrer Dateien (Texte, Bilder, Grafiken)
        sowie Ihre E-Mail-Adresse. Bitte tragen Sie in Freitext-Feldern keine Angaben ein, die nicht
        für den Auftrag erforderlich sind, insbesondere keine sensiblen personenbezogenen Daten.
      </p>
      <p>
        Der Hinweis (im Portal als „Erste Prüfung“ bezeichnet) ist eine Arbeitshilfe. Er ist
        unverbindlich und enthält keine Preise oder Termine. Es findet
        keine ausschließlich automatisierte Entscheidung mit rechtlicher Wirkung oder ähnlich
        erheblicher Beeinträchtigung im Sinne des Art. 22 DSGVO statt: Über Annahme und Ausführung
        eines Auftrags entscheiden unsere Mitarbeiter und Sie durch Ihre Freigabe. Fällt der Dienst
        aus, wird Ihr Auftrag ohne den Hinweis bearbeitet.
      </p>

      <h2 id="virenpruefung">6. Prüfung auf Schadsoftware</h2>
      <p>
        Hochgeladene Dateien werden mit dem Virenscanner ClamAV geprüft. Die Prüfung läuft
        innerhalb unserer eigenen Hosting-Umgebung (siehe Abschnitt 8); die Dateien werden dafür
        nicht an weitere Dritte übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
        (Schutz unserer Systeme und anderer Nutzer).
      </p>

      <h2 id="e-mail">7. E-Mail-Versand</h2>
      <p>
        Einmalcodes, Auftragsbestätigungen, Freigabe-Bestätigungen und Benachrichtigungen zu Ihrem
        Auftrag versenden wir per E-Mail über den Dienst Brevo der{" "}
        <strong>Sendinblue SAS, Paris, Frankreich</strong>, die wir als Auftragsverarbeiter nach
        Art. 28 DSGVO einsetzen (Verarbeitung in der EU). Dabei werden Ihre E-Mail-Adresse und der Inhalt der jeweiligen Nachricht, gegebenenfalls mit
        Anhängen wie Auftragsbestätigung und Druckdaten, verarbeitet. Rechtsgrundlage ist Art. 6
        Abs. 1 lit. b DSGVO. Bitte beachten Sie, dass E-Mails unterwegs grundsätzlich von Dritten
        eingesehen werden können, soweit sie nicht transportverschlüsselt übertragen werden.
      </p>

      <h2 id="hosting">8. Hosting und Server-Logdateien</h2>
      <p>
        Das Portal wird bei der <strong>Railway Corporation, San Francisco, USA</strong>, gehostet,
        die wir als Auftragsverarbeiter nach Art. 28 DSGVO einsetzen. Anwendung, Datenbank,
        Virenprüfung und der Speicher für die hochgeladenen Dateien laufen ausschließlich in der
        Railway-Region <strong>EU West (Amsterdam, Niederlande)</strong>.
      </p>
      <p>
        Da Railway ein Unternehmen mit Sitz in den USA ist, kann ein Zugriff auf die Daten aus
        einem Drittland nicht vollständig ausgeschlossen werden, etwa im Rahmen von Wartung und
        Support. Für diesen Fall haben wir mit Railway die Standardvertragsklauseln der
        EU-Kommission vereinbart (Art. 46 Abs. 2 lit. c DSGVO). Eine Kopie können Sie über die in
        Abschnitt 1 genannte E-Mail-Adresse anfordern.
      </p>
      <p>
        Beim Aufruf des Portals werden technisch bedingt Verbindungsdaten in Logdateien verarbeitet,
        insbesondere IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Statuscode und
        Browserkennung. Die Verarbeitung dient der Stabilität und Sicherheit des Betriebs
        (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      <h2 id="reichweitenmessung">9. Reichweitenmessung (Plausible Analytics)</h2>
      <p>
        Wir nutzen den Dienst Plausible Analytics der <strong>Plausible Insights OÜ, Estland</strong>{" "}
        (Cloud-Angebot, Verarbeitung in der EU), um die Nutzung des Portals in aggregierter Form zu
        verstehen und es zu verbessern. Plausible arbeitet <strong>ohne Cookies</strong> und ohne
        Speicherung von Informationen auf Ihrem Endgerät. Es werden keine personenbezogenen Daten
        gespeichert und keine Profile gebildet; eine geräteübergreifende Wiedererkennung findet
        nicht statt. Erfasst werden nur statistische Angaben zum Seitenaufruf, etwa aufgerufene
        Seite, Herkunft des Besuchs sowie grobe Angaben zu Browser, Betriebssystem und Gerätetyp.
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der
        bedarfsgerechten Gestaltung des Portals. Sie können der Reichweitenmessung jederzeit
        widersprechen (siehe Abschnitt 13). Eine Einwilligung ist nicht erforderlich, weil weder auf
        Informationen in Ihrem Endgerät zugegriffen noch solche dort gespeichert werden.
      </p>

      <h2 id="empfaenger">10. Empfänger der Daten</h2>
      <p>
        Innerhalb unseres Unternehmens erhalten nur die Mitarbeiter Zugriff, die Ihre Aufträge
        bearbeiten. Externe Empfänger sind unsere Auftragsverarbeiter (Hosting, E-Mail-Versand,
        Mistral AI, Plausible Analytics) sowie im Einzelfall Versanddienstleister zur Zustellung
        Ihrer Ware, Steuerberater und Behörden, soweit wir gesetzlich verpflichtet sind. Eine
        Weitergabe zu Werbezwecken findet nicht statt.
      </p>

      <h2 id="speicherdauer">11. Speicherdauer</h2>
      <p>
        Wir speichern personenbezogene Daten nur so lange, wie dies für die Abwicklung des Auftrags
        und zur Erfüllung gesetzlicher Aufbewahrungspflichten erforderlich ist; dazu zählen
        insbesondere die Pflichten nach §§ 147 AO und 257 HGB. Nach Ablauf der jeweiligen Fristen
        werden die Daten gelöscht oder anonymisiert. Sitzungen laufen nach 24 Stunden ohne Nutzung ab, Einmalcodes nach wenigen Minuten. Über die Abwicklung hinaus archivieren wir
        Druckdaten nur bei entsprechender Vereinbarung (siehe Abschnitt 10 der{" "}
        <Link href="/agb#druckdaten">AGB</Link>).
      </p>

      <h2 id="rechte">12. Ihre Rechte</h2>
      <p>Sie haben uns gegenüber folgende Rechte in Bezug auf Ihre personenbezogenen Daten:</p>
      <ul>
        <li>Auskunft (Art. 15 DSGVO),</li>
        <li>Berichtigung (Art. 16 DSGVO),</li>
        <li>Löschung (Art. 17 DSGVO),</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
        <li>Mitteilung an Empfänger (Art. 19 DSGVO),</li>
        <li>Datenübertragbarkeit (Art. 20 DSGVO) sowie</li>
        <li>Widerspruch (Art. 21 DSGVO, siehe Abschnitt 13).</li>
      </ul>
      <p>
        Zur Ausübung Ihrer Rechte genügt eine formlose Nachricht an{" "}
        <a href={`mailto:${company.email}`}>{company.email}</a>.
      </p>

      <h2 id="widerspruch">13. Widerspruchsrecht</h2>
      <div className="recht-hinweis">
        <p>
          Soweit wir Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO)
          verarbeiten, können Sie dieser Verarbeitung aus Gründen, die sich aus Ihrer besonderen
          Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO). Das gilt auch für die
          Reichweitenmessung mit Plausible Analytics.
        </p>
      </div>
      <p>
        Richten Sie Ihren Widerspruch bitte an{" "}
        <a href={`mailto:${company.email}`}>{company.email}</a>. Wir stellen die Verarbeitung dann
        ein, es sei denn, wir können zwingende schutzwürdige Gründe nachweisen, die Ihre Interessen
        überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von
        Rechtsansprüchen.
      </p>

      <h2 id="beschwerde">14. Beschwerderecht</h2>
      <p>
        Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Für uns
        zuständig ist:
      </p>
      <address>
        Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg
        <br />
        Lautenschlagerstraße 20
        <br />
        70173 Stuttgart
        <br />
        <a href="https://www.baden-wuerttemberg.datenschutz.de">
          www.baden-wuerttemberg.datenschutz.de
        </a>
      </address>
    </>
  );
}
