"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { AssistantPromptCard, type AssistantPromptData } from "@/components/staff/AssistantPromptCard";
import { Skeleton } from "@/components/ui/skeleton";

/** Backoffice: redaktionelle Einstellungen (Assistenten-Anweisungen). */
export default function EinstellungenPage() {
  const router = useRouter();
  const [daten, setDaten] = useState<AssistantPromptData | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let aktiv = true;
    async function laden() {
      const res = await fetch("/api/staff/settings/assistant-prompt");
      if (res.status === 401 || res.status === 403) {
        router.push("/staff/login");
        return;
      }
      if (!res.ok) {
        if (aktiv) setFehler(true);
        return;
      }
      const json = (await res.json()) as AssistantPromptData;
      if (aktiv) setDaten(json);
    }
    void laden();
    return () => {
      aktiv = false;
    };
  }, [router]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        titel="Einstellungen"
        beschreibung="Hier pflegen Sie Texte, die das Verhalten des automatischen Hinweises steuern."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Einstellungen" }]}
      />
      {fehler && <p className="text-sm text-destructive">Einstellungen konnten nicht geladen werden.</p>}
      {!fehler && !daten && <Skeleton className="h-96 w-full rounded-2xl" />}
      {daten && <AssistantPromptCard daten={daten} onChange={setDaten} />}
    </main>
  );
}
