import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { TestleitfadenSzenario } from "@/components/vorschau/TestleitfadenListe";
import { getSessionUser, isStaff } from "@/lib/auth/session";
import { vorschauAktiv } from "@/lib/vorschau/modus";
import { ABSCHNITTE, LEITFADEN_TITEL, LEITFADEN_UNTERTITEL } from "@/lib/vorschau/testleitfaden";

/** Immer zur Anfragezeit: Vorschau-Schalter und Anmeldung dürfen nicht in den Build eingebacken werden. */
export const dynamic = "force-dynamic";

/** Testleitfaden: nur in der Vorschau-Umgebung (sonst 404) und nur für angemeldete Mitarbeitende. */
export default async function VorschauTestPage() {
  if (!vorschauAktiv()) notFound();
  const user = await getSessionUser(await headers());
  if (!user || !isStaff(user)) redirect("/staff/login");

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6">
      <PageHeader
        titel={LEITFADEN_TITEL}
        beschreibung={LEITFADEN_UNTERTITEL}
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Testleitfaden" }]}
      />
      {ABSCHNITTE.map((a) => (
        <section key={a.id} id={a.id} className="space-y-3">
          <h2 className="text-xl font-semibold">{a.titel}</h2>
          {a.absaetze?.map((p) => (
            <p key={p} className="text-sm leading-relaxed">
              {p}
            </p>
          ))}
          {a.punkte && (
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {a.punkte.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {a.gruppen?.map((g) => (
            <div key={g.titel} className="space-y-2">
              <h3 className="font-semibold">{g.titel}</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {g.punkte.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
          {a.szenarien?.map((s) => (
            <article key={s.id} id={`szenario-${s.id}`} className="space-y-3 rounded-2xl border border-border p-4">
              <h3 className="font-semibold">
                {s.buchstabe}: {s.titel}
              </h3>
              <p className="text-sm text-muted-foreground">
                Wo: <span className="font-mono">{s.wo}</span>
              </p>
              <div>
                <p className="mb-1 text-sm font-medium">Was tun</p>
                <TestleitfadenSzenario szenario={s} />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Das sollte passieren</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {s.erwartung.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
