import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { Abs, Inhalt, RechtKopf } from "../bausteine";

export const metadata: Metadata = { title: "Allgemeine Geschäftsbedingungen" };

const abschnitte = [
  { id: "geltung", titel: "1. Geltungsbereich" },
  { id: "preise", titel: "2. Preise, Vertragsschluss" },
  { id: "zahlung", titel: "3. Zahlung" },
  { id: "lieferung", titel: "4. Lieferung" },
  { id: "eigentumsvorbehalt", titel: "5. Eigentumsvorbehalt" },
  { id: "maengel", titel: "6. Beanstandungen und Mängelrechte" },
  { id: "haftung", titel: "7. Haftung" },
  { id: "verjaehrung", titel: "8. Verjährung" },
  { id: "handelsbrauch", titel: "9. Handelsbrauch" },
  { id: "druckdaten", titel: "10. Druckdaten und Archivierung" },
  { id: "rechte-dritter", titel: "11. Rechte Dritter" },
  { id: "portal", titel: "12. Online-Portal dmp druckraum" },
  { id: "gerichtsstand", titel: "13. Erfüllungsort, Gerichtsstand, anwendbares Recht" },
  { id: "salvatorisch", titel: "14. Salvatorische Klausel" },
  { id: "sprache", titel: "15. Vertragssprache" },
  { id: "datenschutz", titel: "16. Datenschutz" },
];

export default function AgbPage() {
  return (
    <>
      <RechtKopf titel="Allgemeine Geschäfts-, Zahlungs- und Lieferungsbedingungen" />
      <Inhalt eintraege={abschnitte} />

      <h2 id="geltung">1. Geltungsbereich</h2>
      <Abs nr="1.1">
        <p>
          Diese Allgemeinen Geschäfts-, Zahlungs- und Lieferungsbedingungen (AGB) der{" "}
          {company.name} (im Folgenden „Auftragnehmer“) gelten für alle Geschäftsbeziehungen mit
          Unternehmern (§ 14 BGB), juristischen Personen des öffentlichen Rechts oder
          öffentlich-rechtlichen Sondervermögen (im Folgenden „Auftraggeber“).
        </p>
      </Abs>
      <Abs nr="1.2">
        <p>
          Aufträge werden ausschließlich auf Grundlage dieser Bedingungen ausgeführt. Andere
          Bedingungen werden nicht Vertragsinhalt, auch wenn wir ihnen nicht ausdrücklich
          widersprechen. Individuelle Vertragsabreden haben Vorrang vor diesen AGB.
        </p>
      </Abs>

      <h2 id="preise">2. Preise, Vertragsschluss</h2>
      <Abs nr="2.1">
        <p>
          Die im Angebot des Auftragnehmers genannten Preise gelten unter dem Vorbehalt, dass die
          der Angebotsabgabe zugrunde gelegten Auftragsdaten unverändert bleiben, längstens jedoch
          vier Wochen nach Eingang des Angebots beim Auftraggeber.
        </p>
      </Abs>
      <Abs nr="2.2">
        <p>
          Die Preise des Auftragnehmers enthalten keine Mehrwertsteuer. Sie gelten ab Werk und
          schließen Verpackung, Fracht, Porto, Versicherung und sonstige Versandkosten nicht ein.
        </p>
      </Abs>
      <Abs nr="2.3">
        <p>
          Nachträgliche Änderungen der vertraglichen Leistung auf Veranlassung des Auftraggebers
          einschließlich des dadurch verursachten Maschinenstillstands werden dem Auftraggeber
          berechnet. Als nachträgliche Änderungen gelten auch Wiederholungen von Probeandrucken, die
          der Auftraggeber wegen geringfügiger, aber nicht beanstandungsfähiger Abweichung von der
          Vorlage verlangt.
        </p>
      </Abs>
      <Abs nr="2.4">
        <p>
          Skizzen, Entwürfe, Probesatz, Probedrucke, Korrekturabzüge, Änderungen angelieferter oder
          übertragener Daten und ähnliche Vorarbeiten, die nicht Gegenstand des Auftrags sind und
          vom Auftraggeber veranlasst werden, werden gesondert berechnet.
        </p>
      </Abs>
      <Abs nr="2.5">
        <p>
          Bei Aufträgen mit Lieferung an Dritte gilt der Besteller als Auftraggeber, soweit keine
          anderweitige ausdrückliche Vereinbarung getroffen wurde.
        </p>
      </Abs>

      <h2 id="zahlung">3. Zahlung</h2>
      <Abs nr="3.1">
        <p>
          Die Zahlung hat ohne jeden Abzug zu erfolgen. Eine etwaige Skontovereinbarung bezieht sich
          nicht auf Fracht, Porto, Versicherung oder sonstige Versandkosten. Die Fälligkeit richtet
          sich nach den gesetzlichen Regelungen.
        </p>
      </Abs>
      <Abs nr="3.2">
        <p>
          Der Auftraggeber kann nur mit einer unbestrittenen, entscheidungsreifen oder rechtskräftig
          festgestellten Forderung aufrechnen oder ein Zurückbehaltungsrecht ausüben. Dies gilt
          nicht für Ansprüche des Auftraggebers, die auf Fertigstellungs- oder
          Mängelbeseitigungskosten gerichtet sind.
        </p>
      </Abs>
      <Abs nr="3.3">
        <p>
          Wird nach Vertragsschluss erkennbar, dass die Erfüllung des Zahlungsanspruchs durch
          mangelnde Leistungsfähigkeit des Auftraggebers gefährdet wird, kann der Auftragnehmer die
          Leistung verweigern. Das Leistungsverweigerungsrecht entfällt, wenn die Gegenleistung
          bewirkt oder Sicherheit für sie geleistet ist; § 321 Abs. 2 BGB bleibt unberührt. Der
          Auftragnehmer kann die Leistung auch verweigern, solange er aus demselben rechtlichen
          Verhältnis einen fälligen Anspruch gegen den Auftraggeber hat, bis die ihm gebührende
          Leistung bewirkt wird; § 273 Abs. 3 BGB bleibt unberührt.
        </p>
      </Abs>
      <Abs nr="3.4">
        <p>
          Zahlt der Auftraggeber binnen 14 Tagen nach Lieferung der Ware den Preis einschließlich
          der Kosten gemäß Abschnitt 2 nicht, kommt er auch ohne Mahnung in Verzug. Bei
          Zahlungsverzug sind Verzugszinsen in Höhe von 9 Prozentpunkten über dem Basiszinssatz zu
          zahlen; die Geltendmachung weiterer Ansprüche bleibt vorbehalten. Außerdem hat der
          Auftragnehmer Anspruch auf Zahlung einer Pauschale in Höhe von 40 Euro. Die Pauschale ist
          auf einen geschuldeten Schadensersatz anzurechnen, soweit der Schaden in Kosten der
          Rechtsverfolgung begründet ist.
        </p>
      </Abs>

      <h2 id="lieferung">4. Lieferung</h2>
      <Abs nr="4.1">
        <p>
          Lieferfristen werden spätestens bei Vertragsschluss individuell vereinbart. Geschieht dies
          nicht, gelten die gesetzlichen Regelungen.
        </p>
      </Abs>
      <Abs nr="4.2">
        <p>
          Soll die Ware versendet werden, geht die Gefahr des zufälligen Untergangs und der
          zufälligen Verschlechterung der Ware auf den Auftraggeber über, sobald die Sendung an die
          den Transport durchführende Person übergeben worden ist.
        </p>
      </Abs>
      <Abs nr="4.3">
        <p>
          Der Auftragnehmer ist zu Teillieferungen nur berechtigt, soweit dies unter Berücksichtigung
          der Gebote von Treu und Glauben gemäß § 242 BGB angemessen ist. Das kann insbesondere der
          Fall sein, wenn die Teillieferungen für den Auftraggeber im Rahmen des vertraglichen
          Bestimmungszwecks verwendbar sind und die Lieferung der restlichen bestellten Ware
          sichergestellt bleibt. Rechte und Ansprüche des Auftraggebers wegen einer insoweit vom
          Auftragnehmer zu vertretenden Pflichtverletzung bleiben unberührt.
        </p>
      </Abs>
      <Abs nr="4.4">
        <p>
          Verzögert der Auftragnehmer die Leistung, kann der Auftraggeber nur dann unter den
          Voraussetzungen des § 323 BGB zurücktreten, wenn die Verzögerung vom Auftragnehmer zu
          vertreten ist. Eine Änderung der Beweislast ist damit nicht verbunden.
        </p>
      </Abs>
      <Abs nr="4.5">
        <p>
          Vom Auftragnehmer nicht zu vertretende Betriebsstörungen von vorübergehender Dauer — sowohl
          im Betrieb des Auftragnehmers als auch in dem eines Zulieferers —, insbesondere Streiks,
          Aussperrungen sowie alle Fälle höherer Gewalt, berechtigen den Auftraggeber nur dann zum
          Rücktritt vom Vertrag, wenn ihm ein weiteres Festhalten am Vertrag objektiv nicht
          zugemutet werden kann. Andernfalls verlängert sich die Lieferfrist um die Dauer der durch
          die Störung verursachten Verzögerung. Eine Haftung des Auftragnehmers ist in diesen Fällen
          ausgeschlossen.
        </p>
      </Abs>
      <Abs nr="4.6">
        <p>
          Dem Auftragnehmer steht an den vom Auftraggeber angelieferten Druck- und Stempelvorlagen,
          Manuskripten, Rohmaterialien und sonstigen Gegenständen ein Zurückbehaltungsrecht gemäß
          § 369 HGB zu, bis alle fälligen Forderungen aus der Geschäftsverbindung vollständig erfüllt
          sind.
        </p>
      </Abs>

      <h2 id="eigentumsvorbehalt">5. Eigentumsvorbehalt</h2>
      <Abs nr="5.1">
        <p>
          Die gelieferte Ware bleibt bis zur vollständigen Bezahlung aller zum Rechnungsdatum
          bestehenden Forderungen Eigentum des Auftragnehmers.
        </p>
      </Abs>
      <Abs nr="5.2">
        <p>
          Der Auftraggeber darf die Vorbehaltsware weder verpfänden noch zur Sicherheit übereignen.
          Zugriffe Dritter auf die Vorbehaltsware hat er dem Auftragnehmer unverzüglich schriftlich
          mitzuteilen. Veräußert der Auftraggeber die Vorbehaltsware weiter, tritt er die daraus
          entstehenden Forderungen bereits jetzt an den Auftragnehmer ab; der Auftragnehmer nimmt
          die Abtretung an.
        </p>
      </Abs>
      <Abs nr="5.3">
        <p>
          Übersteigt der Wert der bestehenden Sicherheiten die Forderungen des Auftragnehmers um
          mehr als 10 %, gibt der Auftragnehmer auf Verlangen des Auftraggebers Sicherheiten nach
          seiner Wahl frei.
        </p>
      </Abs>

      <h2 id="maengel">6. Beanstandungen und Mängelrechte</h2>
      <Abs nr="6.1">
        <p>
          Der Auftraggeber hat die Vertragsgemäßheit der Ware sowie etwaiger zur Korrektur
          übersandter Vor- und Zwischenerzeugnisse unverzüglich zu prüfen. Offensichtliche Mängel
          sind innerhalb einer Woche nach Ablieferung, verborgene Mängel innerhalb einer Woche nach
          Entdeckung schriftlich oder per E-Mail anzuzeigen. Unterbleibt die rechtzeitige Anzeige,
          ist die Geltendmachung von Mängelansprüchen ausgeschlossen.
        </p>
      </Abs>
      <Abs nr="6.2">
        <p>
          Bei berechtigten Beanstandungen ist der Auftragnehmer zunächst nach seiner Wahl zur
          Nachbesserung oder Ersatzlieferung berechtigt.
        </p>
      </Abs>
      <Abs nr="6.3">
        <p>
          Farbabweichungen bei Reproduktionen sind im Rahmen des drucktechnisch Üblichen nicht
          beanstandungsfähig. Mehr- oder Minderlieferungen von bis zu 10 % der bestellten Menge sind
          zulässig.
        </p>
      </Abs>
      <Abs nr="6.4">
        <p>
          Bei nach Kundenspezifikation gefertigter Ware ist eine Rücknahme ausgeschlossen, soweit
          kein Mangel vorliegt. Hinweise zum Ausschluss des Widerrufsrechts finden Sie unter{" "}
          <Link href="/widerruf">Widerruf und Reklamation</Link>.
        </p>
      </Abs>

      <h2 id="haftung">7. Haftung</h2>
      <Abs nr="7.1">
        <p>
          Der Auftragnehmer haftet unbeschränkt bei Verletzung von Leben, Körper oder Gesundheit
          sowie für Schäden, die auf vorsätzlicher oder grob fahrlässiger Pflichtverletzung beruhen.
          Dasselbe gilt für Ansprüche nach dem Produkthaftungsgesetz und bei arglistigem
          Verschweigen eines Mangels oder der Übernahme einer Garantie.
        </p>
      </Abs>
      <Abs nr="7.2">
        <p>
          Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten — das sind Pflichten,
          deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und
          auf deren Einhaltung der Auftraggeber regelmäßig vertrauen darf — ist die Haftung auf den
          vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung bei leichter
          Fahrlässigkeit ausgeschlossen.
        </p>
      </Abs>

      <h2 id="verjaehrung">8. Verjährung</h2>
      <Abs nr="8.1">
        <p>
          Mängelansprüche des Auftraggebers verjähren — mit Ausnahme der in Abschnitt 7.1 genannten
          Schadensersatzansprüche — in einem Jahr ab Lieferung. Dies gilt nicht bei arglistigem
          Verschweigen eines Mangels und nicht bei übernommener Garantie.
        </p>
      </Abs>

      <h2 id="handelsbrauch">9. Handelsbrauch</h2>
      <Abs nr="9.1">
        <p>
          Im kaufmännischen Verkehr gelten die Handelsbräuche der Druckindustrie, soweit nichts
          anderes vereinbart ist. Danach besteht insbesondere keine Pflicht zur Herausgabe von
          Zwischenerzeugnissen wie Daten, Lithos oder Druckplatten.
        </p>
      </Abs>

      <h2 id="druckdaten">10. Druckdaten und Archivierung</h2>
      <Abs nr="10.1">
        <p>
          Der Auftraggeber ist für Vollständigkeit, Richtigkeit und Druckeignung der von ihm
          überlassenen Daten verantwortlich. Er hat vor der Übermittlung eine eigene Datensicherung
          anzufertigen. Der Auftragnehmer ist nicht verpflichtet, überlassene Daten auf inhaltliche
          Richtigkeit, Rechtschreibung oder Vollständigkeit zu prüfen; hierzu gehören auch
          Korrekturen, die vom Auftraggeber zur Freigabe gegeben werden.
        </p>
      </Abs>
      <Abs nr="10.2">
        <p>
          Produkte, Materialien und Daten werden über die Übergabe hinaus nur nach ausdrücklicher
          Vereinbarung und gegen besondere Vergütung archiviert. Ohne eine solche Vereinbarung
          obliegt die Versicherung dem Auftraggeber.
        </p>
      </Abs>

      <h2 id="rechte-dritter">11. Rechte Dritter</h2>
      <Abs nr="11.1">
        <p>
          Der Auftraggeber versichert, dass durch seine Auftragsvorgaben, insbesondere durch von ihm
          gelieferte Vorlagen, Rechte Dritter — z. B. Urheber-, Kennzeichen- oder
          Persönlichkeitsrechte — nicht verletzt werden. Er stellt den Auftragnehmer von Ansprüchen
          Dritter frei, es sei denn, er weist nach, dass ihn kein Verschulden trifft und er seinen
          Sorgfaltspflichten nachgekommen ist.
        </p>
      </Abs>

      <h2 id="portal">12. Online-Portal dmp druckraum</h2>
      <Abs nr="12.1">
        <p>
          Über das Portal dmp druckraum können Auftraggeber Druckdaten übermitteln, Aufträge
          anfragen und Auftragsbestätigungen sowie Druckdaten zur Freigabe entgegennehmen. Ergänzend
          zu den übrigen Abschnitten gelten die folgenden Regelungen; bei Widersprüchen gehen sie
          für die Nutzung des Portals vor.
        </p>
      </Abs>
      <Abs nr="12.2">
        <p>
          <strong>Upload und Verifizierung.</strong> Der Auftraggeber lädt Dateien über das Portal
          oder über einen von uns bereitgestellten Upload-Link hoch. Das Absenden eines Auftrags
          wird durch einen Einmalcode bestätigt, den wir an die vom Auftraggeber angegebene
          E-Mail-Adresse senden. Der Code ist nur begrenzte Zeit gültig. Der Auftraggeber hat den
          Zugang zu seinem E-Mail-Postfach und den Code vor dem Zugriff Dritter zu schützen;
          Handlungen, die mit einem an seine E-Mail-Adresse gesendeten Code vorgenommen werden,
          werden ihm zugerechnet.
        </p>
      </Abs>
      <Abs nr="12.3">
        <p>
          <strong>Anfrage.</strong> Der Upload und das Absenden im Portal sind eine Anfrage und
          begründen keinen Anspruch auf Annahme. Wir prüfen die Anfrage und übermitteln dem
          Auftraggeber anschließend eine Auftragsbestätigung nebst Druckdaten zur Freigabe.
        </p>
      </Abs>
      <Abs nr="12.4">
        <p>
          <strong>Freigabe per Code.</strong> Die Freigabe von Auftragsbestätigung und Druckdaten
          erfolgt im Portal durch Eingabe eines weiteren Einmalcodes, der an die E-Mail-Adresse des
          Auftraggebers gesendet wird. Mit der Freigabe erklärt der Auftraggeber verbindlich, dass
          er die Auftragsbestätigung und die Druckdaten in der vorliegenden Fassung geprüft hat und
          ihre Ausführung wünscht; der Auftrag kommt damit zu den in der Auftragsbestätigung
          genannten Bedingungen zustande. Die Freigabe wird mit Zeitpunkt, Version und technischen
          Verbindungsdaten protokolliert und dem Auftraggeber per E-Mail bestätigt. Nach der
          Freigabe gelten Änderungen als nachträgliche Änderungen im Sinne von Abschnitt 2.3.
        </p>
      </Abs>
      <Abs nr="12.5">
        <p>
          <strong>Versionierung.</strong> Ändern wir eine Auftragsbestätigung oder die Druckdaten,
          beispielsweise auf Änderungswunsch des Auftraggebers, erhält die Auftragsbestätigung eine
          neue Versionsnummer und wird erneut zur Freigabe übermittelt. Verbindlich ist die Version,
          die der Auftraggeber freigegeben hat; eine Freigabe erstreckt sich nicht auf spätere
          Versionen.
        </p>
      </Abs>
      <Abs nr="12.6">
        <p>
          <strong>Automatischer Vorprüfungs-Hinweis.</strong> Nach dem Absenden erstellt das Portal
          automatisch einen Hinweis, der die Angaben des Auftraggebers mit den hochgeladenen Dateien
          abgleicht und technische Auffälligkeiten benennt. Dieser Hinweis (im Portal als „Erste Prüfung“ bezeichnet) ist unverbindlich. Er ist
          weder ein Angebot noch eine Preis-, Termin- oder Leistungszusage und ersetzt nicht die
          Prüfung durch unsere Mitarbeiter. Er kann unvollständig oder fehlerhaft sein. Die
          Verantwortung des Auftraggebers für seine Druckdaten nach Abschnitt 10 bleibt unberührt.
        </p>
      </Abs>
      <Abs nr="12.7">
        <p>
          <strong>Prüfung auf Schadsoftware.</strong> Hochgeladene Dateien werden automatisch auf
          Schadsoftware geprüft. Dateien, bei denen Schadsoftware festgestellt wird, halten wir
          zurück und stellen sie nicht zum Abruf bereit; der Auftraggeber hat auf Anforderung eine
          bereinigte Datei zu übermitteln. Ein Anspruch darauf, dass jede Schadsoftware erkannt
          wird, besteht nicht.
        </p>
      </Abs>

      <h2 id="gerichtsstand">13. Erfüllungsort, Gerichtsstand, anwendbares Recht</h2>
      <Abs nr="13.1">
        <p>
          Erfüllungsort und Gerichtsstand ist, sofern der Auftraggeber Kaufmann, juristische Person
          des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist, der Sitz des
          Auftragnehmers in {company.city}. Es gilt deutsches Recht unter Ausschluss des
          UN-Kaufrechts (CISG).
        </p>
      </Abs>

      <h2 id="salvatorisch">14. Salvatorische Klausel</h2>
      <Abs nr="14.1">
        <p>
          Sollte eine Bestimmung dieser AGB unwirksam sein oder werden, bleibt die Wirksamkeit der
          übrigen Bestimmungen unberührt. An die Stelle der unwirksamen Bestimmung tritt eine
          gesetzlich zulässige Regelung, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung
          am nächsten kommt.
        </p>
      </Abs>

      <h2 id="sprache">15. Vertragssprache</h2>
      <Abs nr="15.1">
        <p>
          Maßgeblich für die Vertragsbeziehungen ist die deutsche Sprache. Bei Abweichungen zwischen
          einer Übersetzung und der deutschen Fassung gilt ausschließlich die deutsche Fassung.
        </p>
      </Abs>

      <h2 id="datenschutz">16. Datenschutz</h2>
      <Abs nr="16.1">
        <p>
          Der Auftragnehmer verarbeitet personenbezogene Daten ausschließlich zur Abwicklung des
          Vertragsverhältnisses und im Einklang mit den geltenden Datenschutzgesetzen. Einzelheiten
          enthält die <Link href="/datenschutz">Datenschutzerklärung</Link>.
        </p>
      </Abs>
    </>
  );
}
