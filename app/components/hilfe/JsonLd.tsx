import { serialisieren } from "@/lib/hilfe/jsonld";

/** Strukturierte Daten als JSON-LD-Script (Server-Komponente). */
export function JsonLd({ daten }: { daten: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialisieren(daten) }} />;
}
