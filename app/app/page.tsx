import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { CropMarks, RegisterDivider } from "@/components/brand/CropMarks";
import { PreflightHero } from "@/components/brand/PreflightHero";
import { LifecycleRail } from "@/components/brand/LifecycleRail";
import { JsonLd } from "@/components/hilfe/JsonLd";
import { FRAGEN } from "@/lib/hilfe/inhalte";
import { faqSeite, graph, organisation, webanwendung, website } from "@/lib/hilfe/jsonld";

export const metadata: Metadata = {
  title: { absolute: "dmp druckraum — Druckdaten hochladen und vor dem Druck prüfen" },
  description:
    "Druckdaten online hochladen, automatisch prüfen lassen (Anschnitt, Schriften, Auflösung, Farbmodus, Virenscan) und per E-Mail-Code freigeben — der Druckdaten-Upload der digitale medien print gmbh, Heilbronn.",
  alternates: { canonical: "/", types: { "text/plain": [{ url: "/llms.txt", title: "llms.txt" }] } },
};

/** Die Fragen, die Besucher der Startseite am häufigsten haben — Antworten aus der Hilfe. */
const START_FRAGEN = FRAGEN.filter((f) =>
  [
    "Brauche ich ein Konto, um Druckdaten hochzuladen?",
    "Welche Dateien kann ich hochladen und wie groß dürfen sie sein?",
    "Was prüft die automatische Vorprüfung?",
    "Wann wird mein Auftrag gedruckt?",
  ].includes(f.frage),
);

const CHECKS = [
  {
    nr: "01",
    titel: "Druckbarkeit",
    text: "Format und Seitenzahl, Anschnitt, Farbmodus, eingebettete Schriften und Bildauflösung — pro Datei, in Klartext.",
  },
  {
    nr: "02",
    titel: "Einheitlichkeit",
    text: "Bei mehrseitigen PDFs vergleichen wir Seitenformat und Anschnitt und nennen genau die Seiten, die abweichen.",
  },
  {
    nr: "03",
    titel: "Sicherheit",
    text: "Virenscan, PDF-Skripte, Office-Makros und falsche Dateitypen. Auffälliges wird zurückgehalten, bevor es jemand öffnet.",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl space-y-20 px-4 py-10 md:px-6 md:py-16">
      <JsonLd daten={graph(organisation(), website(), webanwendung(), faqSeite(START_FRAGEN))} />
      <section className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <p className="font-mono text-xs tracking-[0.12em] text-(--color-ink-mid) uppercase">
            dmp druckraum · von digitale medien print
          </p>
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance md:text-6xl">
            Druckdaten hochladen.{" "}
            <span className="block text-(--color-brand-600)">Vor dem Druck geprüft.</span>
          </h1>
          <p className="max-w-xl text-base text-(--color-ink-mid) md:text-lg">
            Senden Sie Ihre Dateien mit einer kurzen Beschreibung. Wir prüfen Anschnitt, Schriften, Auflösung und
            Sicherheit automatisch — Sie sehen sofort, was druckbereit ist. Zum Starten ist kein Konto nötig; nach dem
            Senden bestätigen Sie mit einem Code aus Ihrer E-Mail.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" render={<Link href="/upload" transitionTypes={["nav-forward"]} />}>
              Upload starten
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/requests" transitionTypes={["nav-forward"]} />}>
              Meine Aufträge
            </Button>
          </div>
          <p className="text-sm text-(--color-ink-soft)">Kein Konto nötig · Bestätigung per E-Mail-Code · Virenprüfung inklusive</p>
        </div>
        <CropMarks className="mx-auto w-full max-w-[380px]">
          <PreflightHero />
        </CropMarks>
      </section>

      <section className="reveal space-y-8" aria-labelledby="ablauf">
        <RegisterDivider />
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h2 id="ablauf" className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            Vom Upload bis zum Versand sehen Sie, wo Ihr Auftrag steht
          </h2>
          <p className="text-(--color-ink-mid)">Fünf Stufen, keine Nachfrage per E-Mail nötig.</p>
        </div>
        <Card className="sheet-card mx-auto max-w-3xl">
          <CardContent>
            <LifecycleRail autoplay />
          </CardContent>
        </Card>
      </section>

      <section className="reveal space-y-8" aria-labelledby="pruefung">
        <div className="max-w-2xl space-y-2">
          <h2 id="pruefung" className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            Was wir für Sie prüfen
          </h2>
          <p className="text-(--color-ink-mid)">
            Die Prüfung ist ein Hinweis, keine Hürde: Sie können jederzeit senden, wir sagen Ihnen nur früh, worauf es ankommt.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {CHECKS.map((c) => (
            <Card key={c.nr} className="sheet-card">
              <CardContent className="space-y-3">
                <span className="font-mono text-xs text-(--color-brand-600)">{c.nr}</span>
                <CardTitle className="text-lg">{c.titel}</CardTitle>
                <CardDescription className="leading-relaxed">{c.text}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="reveal grid gap-6 md:grid-cols-2" aria-label="Einstiege">
        <Card className="sheet-card sheet-stack">
          <CardContent className="space-y-4">
            <CardTitle className="text-lg">Für Kunden</CardTitle>
            <CardDescription>
              Dateien hochladen, Auftrag beschreiben, erste Druckbarkeitsprüfung erhalten.
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href="/upload" transitionTypes={["nav-forward"]} />}>Upload starten</Button>
              <Button render={<Link href="/requests" transitionTypes={["nav-forward"]} />} variant="outline">
                Meine Aufträge
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="sheet-card">
          <CardContent className="space-y-4">
            <CardTitle className="text-lg">Für die Druckerei</CardTitle>
            <CardDescription>
              Aufträge triagieren, Assets prüfen, Freigaben anstoßen und Versand melden.
            </CardDescription>
            <Button render={<Link href="/staff/login" transitionTypes={["nav-forward"]} />} variant="secondary">
              Staff-Login
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="reveal space-y-6" aria-labelledby="fragen">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <h2 id="fragen" className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
              Häufige Fragen
            </h2>
            <p className="text-(--color-ink-mid)">Mehr Antworten, Online-Schulung und Kurzanleitungen zum Ausdrucken finden Sie in der Hilfe.</p>
          </div>
          <Button variant="outline" render={<Link href="/hilfe" transitionTypes={["nav-forward"]} />}>
            Zur Hilfe & Schulung
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {START_FRAGEN.map((f) => (
            <details key={f.frage} className="group rounded-2xl border border-border bg-card open:shadow-(--shadow-e1)">
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
      </section>
    </main>
  );
}
