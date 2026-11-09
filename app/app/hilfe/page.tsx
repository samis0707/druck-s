import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { JsonLd } from "@/components/hilfe/JsonLd";
import { FortschrittsBalken } from "@/components/hilfe/KursFortschritt";
import { cn } from "@/lib/utils";
import { company } from "@/lib/company";
import { ABLAUF, DOWNLOADS, FAKTEN, FRAGEN, GLOSSAR, KURSE, PRODUKT, kursMinuten, type Frage } from "@/lib/hilfe/inhalte";
import { brotkrumen, faqSeite, graph, organisation, website } from "@/lib/hilfe/jsonld";
import { HILFE_STAND, absolut } from "@/lib/hilfe/site";

const BESCHREIBUNG =
  "Hilfe und kostenlose Online-Schulung zum dmp druckraum: Druckdaten hochladen, automatische Vorprüfung verstehen, Auftrag per Code freigeben — mit Kurzanleitungen als PDF und häufigen Fragen.";

export const metadata: Metadata = {
  title: "Hilfe & Schulung",
  description: BESCHREIBUNG,
  alternates: { canonical: "/hilfe", types: { "text/markdown": "/hilfe.md" } },
  openGraph: { title: "Hilfe & Schulung · dmp druckraum", description: BESCHREIBUNG, url: "/hilfe", type: "website", locale: "de_DE" },
};

const THEMEN: Frage["thema"][] = ["Zugang", "Hochladen", "Prüfung", "Freigabe & Versand", "Sicherheit & Datenschutz", "Für KI-Assistenten"];

const WER_FARBE: Record<string, string> = {
  Kunde: "bg-(--color-brand-100) text-(--color-brand-800) dark:bg-(--color-brand-900) dark:text-(--color-brand-200)",
  Druckerei: "bg-(--color-signal-100) text-(--color-signal-800) dark:bg-(--color-signal-900) dark:text-(--color-signal-200)",
  System: "bg-muted text-muted-foreground",
};

function anker(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function HilfeStart() {
  const jsonLd = graph(
    organisation(),
    website(),
    {
      "@type": "CollectionPage",
      "@id": absolut("/hilfe#seite"),
      name: "Hilfe & Schulung — dmp druckraum",
      description: BESCHREIBUNG,
      url: absolut("/hilfe"),
      inLanguage: "de-DE",
      dateModified: HILFE_STAND,
      isPartOf: { "@id": absolut("/#website") },
      hasPart: KURSE.map((k) => ({ "@id": absolut(`/hilfe/${k.slug}#kurs`), "@type": "Course", name: k.titel, url: absolut(`/hilfe/${k.slug}`) })),
    },
    faqSeite(),
    brotkrumen([
      { name: "Start", pfad: "/" },
      { name: "Hilfe", pfad: "/hilfe" },
    ]),
  );

  return (
    <main className="hilfe mx-auto max-w-6xl space-y-16 px-4 py-10 md:px-6 md:py-14">
      <JsonLd daten={jsonLd} />

      <header className="max-w-3xl space-y-4">
        <p className="font-mono text-xs tracking-[0.12em] text-(--color-ink-mid) uppercase">Hilfe & Schulung</p>
        <h1 className="text-3xl leading-tight font-semibold tracking-[-0.02em] text-balance md:text-5xl">
          Druckdaten hochladen, prüfen, freigeben — so geht’s
        </h1>
        <p className="text-lg text-(--color-ink-mid)">
          {PRODUKT.satz} Hier lernen Sie Schritt für Schritt, wie Ihr Auftrag vom Hochladen bis zum Versand läuft — als Online-Kurs, als
          geführte Tour direkt in der App oder als Kurzanleitung zum Ausdrucken.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/hilfe/kunden" className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
            Kurs für Kunden starten
          </Link>
          <Link href="/upload?tour=start" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "min-h-11")}>
            Tour auf der Upload-Seite
          </Link>
        </div>
      </header>

      <section aria-labelledby="kurse" className="space-y-6">
        <h2 id="kurse" className="text-2xl font-semibold tracking-[-0.02em]">
          Kurse
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {KURSE.map((k) => (
            <Card key={k.slug} className="sheet-card relative">
              <CardContent className="flex h-full flex-col gap-4">
                <p className="font-mono text-xs tracking-[0.08em] text-(--color-brand-600) uppercase">{k.zielgruppe}</p>
                <CardTitle className="text-lg leading-snug">
                  <Link href={`/hilfe/${k.slug}`} className="after:absolute after:inset-0">
                    {k.titel}
                  </Link>
                </CardTitle>
                <CardDescription className="leading-relaxed">{k.beschreibung}</CardDescription>
                <p className="text-sm text-muted-foreground">
                  {k.lektionen.length} Lektionen · ca. {kursMinuten(k)} Minuten
                </p>
                <div className="mt-auto">
                  <FortschrittsBalken kurs={k.slug} gesamt={k.lektionen.length} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="ablauf" className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 id="ablauf" className="text-2xl font-semibold tracking-[-0.02em]">
            Der Ablauf im Überblick
          </h2>
          <p className="text-(--color-ink-mid)">Wer macht wann was — vom Hochladen bis zum Versand.</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {ABLAUF.map((s, i) => (
            <li key={s.titel} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${WER_FARBE[s.wer]}`}>{s.wer}</span>
              </div>
              <h3 className="mt-3 font-semibold">{s.titel}</h3>
              <p className="mt-1 text-sm leading-relaxed text-(--color-ink-mid)">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fakten" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <h2 id="fakten" className="text-2xl font-semibold tracking-[-0.02em]">
            Das Wichtigste in Zahlen
          </h2>
          <dl className="divide-y divide-border rounded-3xl border border-border bg-card">
            {[
              ["Dateigröße", `bis ${FAKTEN.maxDateiMb} MB je Datei, mehrere Dateien je Auftrag`],
              ["Dateitypen", FAKTEN.dateitypen],
              ["Anschnitt", `${FAKTEN.anschnittMm} mm an allen Seiten`],
              ["Bildauflösung", `${FAKTEN.aufloesungDpi} dpi in Druckgröße`],
              ["Bestätigungscode", `${FAKTEN.codeStellen} Ziffern per E-Mail, gültig ${FAKTEN.codeGueltigMin} Minuten`],
              ["Bestätigen innerhalb", `${FAKTEN.entwurfGueltigMin} Minuten nach dem Hochladen`],
              ["Einmal-Upload-Link", `${FAKTEN.einmalLinkTage} Tage gültig, einmal nutzbar`],
            ].map(([dt, dd]) => (
              <div key={dt} className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr]">
                <dt className="font-medium">{dt}</dt>
                <dd className="text-(--color-ink-mid)">{dd}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Checkliste für druckfertige Daten:{" "}
            <Link className="underline underline-offset-[3px]" href="/hilfe/kunden/druckdaten-vorbereiten">
              Druckdaten richtig vorbereiten
            </Link>
          </p>
        </div>

        <div id="unterlagen" className="scroll-mt-24 space-y-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Unterlagen zum Ausdrucken</h2>
          <ul className="space-y-3">
            {DOWNLOADS.map((d) => (
              <li key={d.href} className="flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{d.titel}</p>
                  <p className="text-sm text-(--color-ink-mid)">{d.beschreibung}</p>
                </div>
                <div className="flex gap-2">
                  <a href={d.href} download={d.datei} className={cn(buttonVariants(), "min-h-11 gap-1.5")}>
                    <HugeiconsIcon icon={Download04Icon} size={16} aria-hidden="true" />
                    Herunterladen
                  </a>
                  <a href={d.href} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}>
                    Ansehen
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="fragen" aria-labelledby="fragen-titel" className="scroll-mt-24 space-y-6">
        <h2 id="fragen-titel" className="text-2xl font-semibold tracking-[-0.02em]">
          Häufige Fragen
        </h2>
        <div className="grid gap-8 lg:grid-cols-2">
          {THEMEN.map((thema) => (
            <div key={thema} className="space-y-2">
              <h3 id={anker(thema)} className="text-sm font-semibold tracking-[0.06em] text-(--color-ink-mid) uppercase">
                {thema}
              </h3>
              {FRAGEN.filter((f) => f.thema === thema).map((f) => (
                <details key={f.frage} id={anker(f.frage)} className="group rounded-2xl border border-border bg-card open:shadow-(--shadow-e1)">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
                    {f.frage}
                    <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-4 pb-4 leading-relaxed text-(--color-ink-mid)">{f.antwort}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section id="begriffe" aria-labelledby="begriffe-titel" className="scroll-mt-24 space-y-6">
        <h2 id="begriffe-titel" className="text-2xl font-semibold tracking-[-0.02em]">
          Begriffe kurz erklärt
        </h2>
        <dl className="grid gap-4 md:grid-cols-2">
          {GLOSSAR.map((g) => (
            <div key={g.begriff} className="rounded-3xl border border-border bg-card p-5">
              <dt className="font-semibold">{g.begriff}</dt>
              <dd className="mt-1 leading-relaxed text-(--color-ink-mid)">{g.erklaerung}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="ki" className="grid gap-6 rounded-3xl border border-dashed border-(--color-rule-strong) p-6 md:grid-cols-2 md:p-8">
        <div className="space-y-2">
          <h2 id="ki" className="text-xl font-semibold">
            Für KI-Assistenten und Entwickler
          </h2>
          <p className="text-(--color-ink-mid)">
            Diese Hilfe gibt es auch maschinenlesbar: <a className="underline underline-offset-[3px]" href="/llms.txt">/llms.txt</a> als
            Überblick, <a className="underline underline-offset-[3px]" href="/llms-full.txt">/llms-full.txt</a> mit allen Inhalten und jede
            Hilfeseite als Markdown mit angehängtem „.md“. Partnersysteme finden die Schnittstelle unter{" "}
            <Link className="underline underline-offset-[3px]" href="/hilfe/partner">
              Partner-API
            </Link>
            .
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Persönliche Hilfe</h2>
          <p className="text-(--color-ink-mid)">
            {company.name} · Telefon{" "}
            <a className="underline underline-offset-[3px]" href={`tel:${company.phoneHref}`}>
              {company.phone}
            </a>{" "}
            · <a className="underline underline-offset-[3px]" href={`mailto:${company.email}`}>{company.email}</a>
          </p>
          <p className="text-sm text-muted-foreground">{company.hours.map((h) => `${h.days} ${h.time}`).join(" · ")}</p>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">Stand der Hilfe: {new Date(HILFE_STAND).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</p>
    </main>
  );
}
