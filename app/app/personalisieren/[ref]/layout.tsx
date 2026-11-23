import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Personenbezogene Eingaben: nicht indexieren, nichts an Dritte weitergeben. */
export const metadata: Metadata = {
  title: "Personalisieren",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
