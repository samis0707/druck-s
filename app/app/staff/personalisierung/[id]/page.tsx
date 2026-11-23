import { Suspense } from "react";
import { Assistent } from "@/components/personalisierung/staff/Assistent";

/** Vorlage bearbeiten: derselbe Assistent wie bei „Neue Vorlage“. */
export default async function VorlageBearbeitenPage({ params }: PageProps<"/staff/personalisierung/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <Assistent key={id} id={id} />
    </Suspense>
  );
}
