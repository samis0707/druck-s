import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Persönliche Anfrage: nicht in Suchmaschinen und KI-Indizes aufnehmen. */
export const metadata: Metadata = {
  title: "Anfrage bestätigen",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
