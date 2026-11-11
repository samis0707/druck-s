import type { Metadata } from "next";
import type { ReactNode } from "react";

const BESCHREIBUNG =
  "Druckanfrage ohne Kundenkonto: Produkt beschreiben, Dateien anhängen, mit einem Code aus der E-Mail bestätigen. Die Druckerei meldet sich persönlich.";

export const metadata: Metadata = {
  title: "Anfrage ohne Kundenkonto",
  description: BESCHREIBUNG,
  alternates: { canonical: "/anfrage" },
  openGraph: { title: "Anfrage ohne Kundenkonto · dmp druckraum", description: BESCHREIBUNG, url: "/anfrage", type: "website", locale: "de_DE" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
