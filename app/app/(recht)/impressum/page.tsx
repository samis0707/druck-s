import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/lib/company";
import { RechtKopf } from "../bausteine";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  const { register, editorial } = company;
  return (
    <>
      <RechtKopf titel="Impressum" />

      <h2 id="anbieter">Angaben gemäß § 5 DDG</h2>
      <dl className="recht-daten">
        <dt>Anbieter</dt>
        <dd>
          <address>
            {company.name}
            <br />
            {company.street}
            <br />
            {company.zip} {company.city}
          </address>
        </dd>
        <dt>Vertreten durch</dt>
        <dd>Geschäftsführer {company.managingDirector}</dd>
        <dt>Telefon</dt>
        <dd>
          <a href={`tel:${company.phoneHref}`}>{company.phone}</a>
        </dd>
        <dt>Telefax</dt>
        <dd>{company.fax}</dd>
        <dt>E-Mail</dt>
        <dd>
          <a href={`mailto:${company.email}`}>{company.email}</a>
        </dd>
        {register ? (
          <>
            <dt>Registereintrag</dt>
            <dd>
              {register.court}, {register.number}
            </dd>
          </>
        ) : null}
        <dt>Umsatzsteuer-ID</dt>
        <dd>
          Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: {company.vatId}
        </dd>
      </dl>

      <h2 id="verantwortlich">Verantwortlich für Inhalte</h2>
      <p>Verantwortlich für Inhalte im Sinne des § 18 Abs. 2 MStV:</p>
      <address>
        {editorial.name}
        <br />
        {editorial.street}
        <br />
        {editorial.zip} {editorial.city}
      </address>

      <h2 id="verbraucherschlichtung">Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen. Unser Angebot richtet sich ausschließlich an
        Unternehmer und juristische Personen des öffentlichen Rechts.
      </p>

      <h2 id="haftung-inhalte">Haftung für Inhalte</h2>
      <p>
        Wir erstellen die Inhalte dieses Angebots mit größtmöglicher Sorgfalt. Für die Richtigkeit,
        Vollständigkeit und Aktualität übernehmen wir jedoch keine Gewähr. Als Diensteanbieter sind
        wir nach den allgemeinen Gesetzen für eigene Inhalte verantwortlich. Wir sind nicht
        verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach
        Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur
        Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben
        unberührt. Eine Haftung ist erst ab dem Zeitpunkt der Kenntnis einer konkreten
        Rechtsverletzung möglich; bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir
        die betreffenden Inhalte umgehend.
      </p>

      <h2 id="haftung-links">Haftung für Links</h2>
      <p>
        Dieses Angebot kann Links auf Internetseiten Dritter enthalten, auf deren Inhalte wir keinen
        Einfluss haben. Für diese fremden Inhalte übernehmen wir keine Gewähr; verantwortlich ist
        stets der jeweilige Anbieter oder Betreiber der verlinkten Seiten. Zum Zeitpunkt der
        Verlinkung waren keine Rechtsverstöße erkennbar. Bei Bekanntwerden von Rechtsverletzungen
        entfernen wir derartige Links umgehend.
      </p>

      <h2 id="urheberrecht">Urheberrecht</h2>
      <p>
        Die durch uns erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
        Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung
        außerhalb der Grenzen des Urheberrechts bedürfen der vorherigen schriftlichen Zustimmung
        des jeweiligen Rechteinhabers. Für von Auftraggebern hochgeladene Druckdaten gelten unsere{" "}
        <Link href="/agb">Allgemeinen Geschäftsbedingungen</Link>.
      </p>
    </>
  );
}
