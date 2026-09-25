import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { CropMarks, RegisterDivider } from "@/components/brand/CropMarks";
import { PreflightHero } from "@/components/brand/PreflightHero";
import { LifecycleRail } from "@/components/brand/LifecycleRail";

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
    </main>
  );
}
