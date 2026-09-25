import type { Metadata } from "next";
import { company } from "@/lib/company";
import { RechtKopf } from "../bausteine";

export const metadata: Metadata = { title: "Kontakt" };

export default function KontaktPage() {
  return (
    <>
      <RechtKopf titel="Kontakt" />

      <p>
        Wir sind gern für Sie da — bei Fragen zu Ihrem Druckauftrag, zu Druckdaten oder zur Nutzung
        des Portals dmp druckraum.
      </p>

      <h2 id="anschrift">Anschrift und Erreichbarkeit</h2>
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
        <dt>Öffnungszeiten</dt>
        <dd>
          {company.hours.map((h) => (
            <span key={h.days} style={{ display: "block" }}>
              {h.days}: {h.time}
            </span>
          ))}
        </dd>
      </dl>

      <h2 id="portal">Support zum Portal</h2>
      <p>
        Bei Fragen zu einem Auftrag im Portal antworten Sie einfach auf die E-Mail, die Sie von uns
        erhalten haben — Ihre Nachricht wird dem zugehörigen Auftrag zugeordnet. Für alle weiteren
        Anliegen erreichen Sie uns telefonisch zu den genannten Zeiten oder per E-Mail an{" "}
        <a href={`mailto:${company.email}`}>{company.email}</a>.
      </p>
      <p>
        Weitere Informationen zu unserem Leistungsangebot finden Sie auf{" "}
        <a href={company.website}>{company.website.replace("https://", "")}</a>.
      </p>
    </>
  );
}
