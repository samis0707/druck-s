import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { RechtKopf } from "../bausteine";

export const metadata: Metadata = { title: "Widerruf und Reklamation" };

export default function WiderrufPage() {
  return (
    <>
      <RechtKopf titel="Widerruf und Reklamation" />

      <h2 id="widerrufsrecht">Kein gesetzliches Widerrufsrecht</h2>
      <p>
        Unser Angebot im Portal dmp druckraum richtet sich ausschließlich an Unternehmer im Sinne
        des § 14 BGB sowie an juristische Personen des öffentlichen Rechts und öffentlich-rechtliche
        Sondervermögen. Das gesetzliche Widerrufsrecht nach §§ 312 ff., 355 BGB steht nur
        Verbrauchern zu und besteht daher bei Aufträgen, die über das Portal oder auf anderem Weg
        bei uns erteilt werden, nicht.
      </p>

      <h2 id="kundenspezifisch">Individuell gefertigte Ware</h2>
      <p>
        Unsere Druckerzeugnisse werden nach den Vorgaben und Druckdaten des Auftraggebers
        individuell gefertigt. Nach der Freigabe von Auftragsbestätigung und Druckdaten beginnt die
        Produktion; eine Rücknahme oder Rückabwicklung ist bei Ware, die nach Kundenspezifikation
        gefertigt wurde, ausgeschlossen, soweit nicht ein Mangel vorliegt oder etwas anderes
        ausdrücklich vereinbart ist. Änderungen nach Vertragsschluss richten sich nach Abschnitt 2
        unserer <Link href="/agb#preise">Allgemeinen Geschäftsbedingungen</Link>.
      </p>

      <h2 id="reklamation">Reklamation und Mängelanzeige</h2>
      <p>
        Weist gelieferte Ware einen Mangel auf, gelten die Regelungen zu Beanstandungen und
        Mängelrechten in Abschnitt 6 unserer <Link href="/agb#maengel">
          Allgemeinen Geschäftsbedingungen
        </Link>. Bitte prüfen Sie die Ware unverzüglich nach Erhalt und zeigen Sie
        Mängel innerhalb der dort genannten Fristen an — am einfachsten per E-Mail an{" "}
        <a href={`mailto:${company.email}`}>{company.email}</a> unter Angabe der Auftragsnummer, mit
        einer kurzen Beschreibung des Mangels und, wenn möglich, mit Fotos.
      </p>

      <h2 id="kontakt">Ansprechpartner</h2>
      <dl className="recht-daten">
        <dt>Unternehmen</dt>
        <dd>
          <address>
            {company.name}
            <br />
            {company.street}
            <br />
            {company.zip} {company.city}
          </address>
        </dd>
        <dt>Telefon</dt>
        <dd>
          <a href={`tel:${company.phoneHref}`}>{company.phone}</a>
        </dd>
        <dt>E-Mail</dt>
        <dd>
          <a href={`mailto:${company.email}`}>{company.email}</a>
        </dd>
      </dl>
    </>
  );
}
