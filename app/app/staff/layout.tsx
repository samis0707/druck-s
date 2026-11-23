import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Abmelden } from "@/components/staff/Abmelden";

/** Persönlicher Bereich: nicht in Suchmaschinen und KI-Indizes aufnehmen. */
export const metadata: Metadata = {
  title: { absolute: "Staff · dmp druckraum" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Abmelden />
      {children}
    </>
  );
}
