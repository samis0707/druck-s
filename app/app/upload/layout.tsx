import type { Metadata } from "next";
import type { ReactNode } from "react";

const BESCHREIBUNG =
  "Druckdaten online hochladen: PDF, Bilder oder Office-Dateien bis 100 MB, automatische Vorprüfung von Anschnitt, Schriften und Auflösung, Bestätigung per E-Mail-Code.";

export const metadata: Metadata = {
  title: "Druckdaten hochladen",
  description: BESCHREIBUNG,
  alternates: { canonical: "/upload" },
  openGraph: { title: "Druckdaten hochladen · dmp druckraum", description: BESCHREIBUNG, url: "/upload", type: "website", locale: "de_DE" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
