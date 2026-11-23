"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { loescheWerkbankSpeicherImBrowser } from "@/lib/werkbankSpeicher";

/**
 * „Abmelden“ im Mitarbeiterbereich: beendet die Sitzung auf dem Server und entfernt die lokalen
 * Werkbank-Daten dieses Browsers. Der Speicher wird auch geleert, wenn der Server nicht antwortet.
 */
export function Abmelden() {
  const pfad = usePathname();
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  if (pfad.startsWith("/staff/login")) return null;

  async function abmelden() {
    setLaeuft(true);
    try {
      await fetch("/api/staff/login/verify", { method: "DELETE" });
    } catch {
      /* offline: lokale Daten trotzdem löschen */
    }
    loescheWerkbankSpeicherImBrowser();
    router.push("/staff/login");
  }

  return (
    <div className="mx-auto flex max-w-5xl justify-end px-4 pt-3 md:px-6">
      <button type="button" onClick={() => void abmelden()} disabled={laeuft} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" data-tour="staff-abmelden">
        {laeuft ? "Meldet ab …" : "Abmelden"}
      </button>
    </div>
  );
}
