import { Suspense } from "react";
import { Assistent } from "@/components/personalisierung/staff/Assistent";

/** Neue Vorlage: der Assistent beginnt mit Schritt 1 (Design). */
export default function NeueVorlagePage() {
  return (
    <Suspense>
      <Assistent id={null} />
    </Suspense>
  );
}
