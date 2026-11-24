import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { JsonLd } from "@/components/hilfe/JsonLd";
import { FortschrittsBalken, LektionsListe } from "@/components/hilfe/KursFortschritt";
import { cn } from "@/lib/utils";
import { kursDownloads, kursMinuten, lektionsPfad } from "@/lib/hilfe/inhalte";
import { mitarbeiterLoginUrl } from "@/lib/hilfe/zugriff";
import { kursZugriff } from "@/lib/hilfe/zugriff-server";
import { brotkrumen, graph, kursDaten, organisation } from "@/lib/hilfe/jsonld";

/** Kursseite (Zielgruppen-Prüfung inklusive). Gemeinsam genutzt von app/hilfe/[kurs] (öffentlich) und app/hilfe/druckerei (Mitarbeiter). */

export async function kursMetadaten(slug: string): Promise<Metadata> {
  const z = await kursZugriff(slug);
  // Ohne Berechtigung keine kursbezogenen Metadaten (weder Titel noch Beschreibung).
  if (z.art !== "ok") return { title: "Hilfe & Schulung", robots: { index: false, follow: false } };
  const { kurs, mitarbeiter } = z;
  return {
    title: `${kurs.titel} — Online-Schulung`,
    description: kurs.kurz,
    ...(mitarbeiter
      ? { robots: { index: false, follow: false } }
      : {
          alternates: { canonical: `/hilfe/${kurs.slug}`, types: { "text/markdown": `/hilfe/${kurs.slug}.md` } },
          openGraph: { title: `${kurs.titel} · dmp druckraum`, description: kurs.kurz, url: `/hilfe/${kurs.slug}`, type: "website", locale: "de_DE" },
        }),
  };
}

export async function KursAnsicht({ slug }: { slug: string }) {
  const z = await kursZugriff(slug);
  if (z.art === "login") redirect(mitarbeiterLoginUrl(`/hilfe/${slug}`));
  if (z.art !== "ok") notFound();
  const { kurs, mitarbeiter } = z;
  const erste = kurs.lektionen[0];

  return (
    <main className="hilfe mx-auto max-w-4xl space-y-8 px-4 py-8 md:px-6 md:py-12">
      <JsonLd
        daten={graph(
          organisation(),
          kursDaten(kurs),
          brotkrumen([
            { name: "Start", pfad: "/" },
            { name: "Hilfe", pfad: "/hilfe" },
            { name: kurs.titel, pfad: `/hilfe/${kurs.slug}` },
          ]),
        )}
      />
      <PageHeader
        titel={kurs.titel}
        beschreibung={kurs.beschreibung}
        brotkrumen={[{ bezeichnung: "Hilfe", href: "/hilfe" }, { bezeichnung: kurs.zielgruppe }]}
      />
      <div id="unterlagen" className="flex scroll-mt-24 flex-wrap items-center gap-3">
        <Link href={lektionsPfad(kurs, erste)} className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
          Mit Lektion 1 beginnen
        </Link>
        {kursDownloads(kurs).map((d) => (
          <a key={d.href} href={d.href} download={d.datei} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "min-h-11 gap-1.5")}>
            <HugeiconsIcon icon={Download04Icon} size={16} aria-hidden="true" />
            {d.titel} (PDF)
          </a>
        ))}
        {kurs.tour && (
          <Link href={`${kurs.tour.href}?tour=start`} className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "min-h-11")}>
            {kurs.tour.label}
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">
        {kurs.zielgruppe} · {kurs.lektionen.length} Lektionen · ca. {kursMinuten(kurs)} Minuten · {mitarbeiter ? "nur für angemeldete Mitarbeitende" : "kostenlos, ohne Anmeldung"}
      </p>
      <FortschrittsBalken kurs={kurs.slug} gesamt={kurs.lektionen.length} />
      <section aria-labelledby="lektionen">
        <h2 id="lektionen" className="mb-3 text-xl font-semibold">
          Lektionen
        </h2>
        <LektionsListe
          kurs={kurs.slug}
          lektionen={kurs.lektionen.map((l) => ({ slug: l.slug, titel: l.titel, kurz: l.kurz, minuten: l.minuten, href: lektionsPfad(kurs, l), block: l.block }))}
        />
      </section>
    </main>
  );
}
