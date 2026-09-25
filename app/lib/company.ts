/** Firmendaten der digitale medien print gmbh — einzige Quelle für Rechtstexte, Footer und Mails. */
export const company = {
  name: "digitale medien print gmbh",
  brand: "dmp druckraum",
  street: "Kreuzenstraße 96",
  zip: "74076",
  city: "Heilbronn",
  phone: "+49 (0) 7131 / 26 24 0",
  phoneHref: "+49713126240",
  fax: "(07131) 2624-26",
  email: "info@digitalemedien.de",
  vatId: "DE 304147272",
  managingDirector: "Elysen Butz",
  editorial: { name: "Anja Hilkert", street: "Hagelsteinweg 5", zip: "74388", city: "Talheim" },
  /** Handelsregister-Angaben; werden nur ausgegeben, wenn gesetzt. */
  register: null as { court: string; number: string } | null,
  website: "https://www.digitalemedien.de",
  hours: [
    { days: "Montag bis Donnerstag", time: "08:00 – 17:00 Uhr" },
    { days: "Freitag", time: "08:00 – 14:00 Uhr" },
  ],
} as const;

export function companyAddressLine(): string {
  return `${company.name} · ${company.street} · ${company.zip} ${company.city}`;
}
