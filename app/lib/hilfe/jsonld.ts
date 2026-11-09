/**
 * Strukturierte Daten (schema.org, JSON-LD) für Suchmaschinen und KI-Antwortmaschinen.
 * Werden als <script type="application/ld+json"> gerendert (components/hilfe/JsonLd.tsx).
 */
import { company } from "@/lib/company";
import { FAKTEN, FRAGEN, PRODUKT, kursMinuten, lektionsPfad, type Frage, type Kurs, type Lektion } from "./inhalte";
import { HILFE_STAND, absolut } from "./site";

type Json = Record<string, unknown>;

const ORG_ID = () => absolut("/#organisation");
const SITE_ID = () => absolut("/#website");

export function organisation(): Json {
  return {
    "@type": "Organization",
    "@id": ORG_ID(),
    name: company.name,
    url: company.website,
    email: company.email,
    telephone: company.phone,
    vatID: company.vatId,
    logo: absolut("/icon.png"),
    address: {
      "@type": "PostalAddress",
      streetAddress: company.street,
      postalCode: company.zip,
      addressLocality: company.city,
      addressCountry: "DE",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: company.phone,
      email: company.email,
      availableLanguage: "de",
      hoursAvailable: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"], opens: "08:00", closes: "17:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "08:00", closes: "14:00" },
      ],
    },
  };
}

export function website(): Json {
  return {
    "@type": "WebSite",
    "@id": SITE_ID(),
    name: PRODUKT.name,
    url: absolut("/"),
    inLanguage: "de-DE",
    publisher: { "@id": ORG_ID() },
  };
}

export function webanwendung(): Json {
  return {
    "@type": "WebApplication",
    name: PRODUKT.name,
    url: absolut("/"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "de-DE",
    description: PRODUKT.satz,
    provider: { "@id": ORG_ID() },
    isAccessibleForFree: true,
    featureList: [
      "Druckdaten per Drag & Drop hochladen",
      `Automatische Vorprüfung: Anschnitt (${FAKTEN.anschnittMm} mm), Schriften, Bildauflösung (${FAKTEN.aufloesungDpi} dpi), Farbmodus, Seitenformate`,
      "Virenscan und Prüfung auf Makros und PDF-Skripte",
      "Freigabe per E-Mail-Code ohne Passwort",
      "Status, Sendungsnummer und Rechnung online",
    ],
    potentialAction: { "@type": "Action", name: "Druckdaten hochladen", target: absolut("/upload") },
  };
}

export function graph(...knoten: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": knoten };
}

export function brotkrumen(eintraege: { name: string; pfad: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: eintraege.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.name, item: absolut(e.pfad) })),
  };
}

export function faqSeite(fragen: Frage[] = FRAGEN): Json {
  return {
    "@type": "FAQPage",
    inLanguage: "de-DE",
    mainEntity: fragen.map((f) => ({
      "@type": "Question",
      name: f.frage,
      acceptedAnswer: { "@type": "Answer", text: f.antwort },
    })),
  };
}

export function kursDaten(kurs: Kurs): Json {
  return {
    "@type": "Course",
    "@id": absolut(`/hilfe/${kurs.slug}#kurs`),
    name: kurs.titel,
    description: kurs.beschreibung,
    url: absolut(`/hilfe/${kurs.slug}`),
    inLanguage: "de-DE",
    provider: { "@id": ORG_ID() },
    isAccessibleForFree: true,
    audience: { "@type": "Audience", audienceType: kurs.zielgruppe },
    dateModified: HILFE_STAND,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: `PT${kursMinuten(kurs)}M`,
    },
    offers: { "@type": "Offer", price: 0, priceCurrency: "EUR", category: "Free" },
    hasPart: kurs.lektionen.map((l) => ({
      "@type": "LearningResource",
      name: l.titel,
      description: l.kurz,
      url: absolut(lektionsPfad(kurs, l)),
    })),
  };
}

export function lektionDaten(kurs: Kurs, lektion: Lektion): Json {
  const url = absolut(lektionsPfad(kurs, lektion));
  return {
    "@type": ["HowTo", "LearningResource"],
    "@id": `${url}#anleitung`,
    name: lektion.titel,
    description: lektion.kurz,
    url,
    inLanguage: "de-DE",
    totalTime: `PT${lektion.minuten}M`,
    timeRequired: `PT${lektion.minuten}M`,
    learningResourceType: "Anleitung",
    educationalLevel: "Einsteiger",
    isPartOf: { "@id": absolut(`/hilfe/${kurs.slug}#kurs`) },
    dateModified: HILFE_STAND,
    image: lektion.bilder?.map((b) => absolut(`/hilfe/img/${b.name}.webp`)),
    step: lektion.schritte.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: text.replace(/[„“]/g, "").split(/[.:—]/)[0].slice(0, 110),
      text,
      url: `${url}#schritt-${i + 1}`,
    })),
  };
}

/** Sicher serialisieren (kein `</script>`-Ausbruch). */
export function serialisieren(daten: Json): string {
  return JSON.stringify(daten).replace(/</g, "\\u003c");
}
