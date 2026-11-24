"use client";

/* Daten laden bzw. Zustand abgleichen: setState in Effekten ist hier gewollt. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PdfSeite, usePdfDokument } from "@/components/personalisierung/PdfSeite";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { api, kopiere, STAFF_API } from "@/lib/personalisierung/ui/api";
import { designBytes } from "@/lib/personalisierung/ui/browser-engine";
import { SICHTBARKEIT_NAMEN } from "@/lib/personalisierung/schema";
import type { VorlagenKarte } from "@/lib/personalisierung/repo";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Vorschaubild der Vorderseite: erst laden, wenn die Karte sichtbar wird. */
function Vorschaubild({ dateiId, seite, name }: { dateiId: string | null; seite: number; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sichtbar, setSichtbar] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSichtbar(true);
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setSichtbar(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!sichtbar || !dateiId) return;
    let aktiv = true;
    designBytes(dateiId).then((b) => aktiv && setBytes(b)).catch(() => aktiv && setFehler(true));
    return () => {
      aktiv = false;
    };
  }, [sichtbar, dateiId]);
  const { dokument } = usePdfDokument(bytes);
  return (
    <div ref={ref} className="flex h-44 items-center justify-center overflow-hidden rounded-xl bg-muted">
      {dokument ? (
        <PdfSeite dokument={dokument} seite={seite} breitePx={200} className="max-h-40 w-auto rounded-sm shadow-sm" label={`Vorderseite von ${name}`} />
      ) : (
        <span className="px-3 text-center text-xs text-muted-foreground">{!dateiId ? "Noch kein Design hochgeladen" : fehler ? "Keine Vorschau" : "Vorschau wird geladen …"}</span>
      )}
    </div>
  );
}

function Karte({ k, erste, onWeiter, onFehler, neuLaden }: { k: VorlagenKarte; erste: boolean; onWeiter: (id: string) => void; onFehler: (e: unknown, t?: string) => void; neuLaden: () => void }) {
  async function duplizieren() {
    try {
      const d = await api<{ id: string }>(`${STAFF_API}/vorlagen/${k.id}/duplizieren`, { method: "POST" });
      toast.add({ description: "Kopie angelegt. Sie können sie jetzt bearbeiten.", type: "success" });
      onWeiter(d.id);
    } catch (e) {
      onFehler(e, "Die Vorlage konnte nicht dupliziert werden.");
    }
  }

  async function linkKopieren() {
    if (k.status !== "aktiv") {
      toast.add({ description: "Der Link funktioniert erst, wenn die Vorlage veröffentlicht ist. Öffnen Sie die Vorlage und gehen Sie zu „Freigabe“.", type: "info" });
      return;
    }
    if (k.sichtbarkeit === "mitarbeiter") {
      toast.add({ description: "Diese Vorlage ist nur intern sichtbar. Stellen Sie unter „Freigabe“ „Öffentlich per Link“ oder „Bestimmte Kunden“ ein.", type: "info" });
      return;
    }
    try {
      let url = `${window.location.origin}/personalisieren/${k.id}`;
      if (k.sichtbarkeit === "oeffentlich") {
        // Gleicher Link wie zuvor: ein aktiver, kopierbarer Link wird wiederverwendet; nur wenn es keinen gibt, entsteht ein neuer.
        const jetzt = Date.now();
        const liste = await api<{ links: { id: string; expiresAt: string | null; revokedAt: string | null; kopierbar?: boolean }[] }>(`${STAFF_API}/vorlagen/${k.id}/links`);
        const vorhanden = liste.links.find((l) => l.kopierbar && !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt).getTime() > jetzt));
        let adresse: string | null = null;
        if (vorhanden) {
          try {
            adresse = (await api<{ url: string }>(`${STAFF_API}/vorlagen/${k.id}/links/${vorhanden.id}`)).url;
          } catch {
            adresse = null;
          }
        }
        if (!adresse) {
          const r = await api<{ url: string }>(`${STAFF_API}/vorlagen/${k.id}/links`, { method: "POST", json: { label: "Aus der Übersicht kopiert" } });
          adresse = r.url;
        }
        url = adresse;
      }
      const ok = await kopiere(url);
      toast.add({ description: ok ? "Link kopiert." : "Kopieren nicht möglich. Der Link steht in der Freigabe.", type: ok ? "success" : "error" });
    } catch (e) {
      onFehler(e, "Der Link konnte nicht erzeugt werden.");
    }
  }

  async function archivieren(wiederherstellen: boolean) {
    try {
      await api(`${STAFF_API}/vorlagen/${k.id}${wiederherstellen ? "?wiederherstellen=1" : ""}`, { method: "DELETE" });
      toast.add({ description: wiederherstellen ? "Vorlage wiederhergestellt." : "Vorlage archiviert. Bereits eingegangene Aufträge bleiben unverändert.", type: "success" });
      neuLaden();
    } catch (e) {
      onFehler(e);
    }
  }

  return (
    <Card data-tour={erste ? "pers-karte" : undefined} className={k.archiviert ? "opacity-70" : undefined}>
      <CardContent className="flex h-full flex-col gap-3">
        <Link href={`/staff/personalisierung/${k.id}`} aria-label={`${k.name} bearbeiten`} tabIndex={-1}>
          <Vorschaubild dateiId={k.designDateiId} seite={k.designVorne} name={k.name} />
        </Link>
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-base font-semibold" title={k.name}>
            <Link href={`/staff/personalisierung/${k.id}`} className="hover:underline">
              {k.name}
            </Link>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {k.archiviert ? (
              <Badge variant="outline">Archiviert</Badge>
            ) : k.status === "aktiv" ? (
              <Badge>Aktiv</Badge>
            ) : (
              <Badge variant="secondary">Entwurf</Badge>
            )}
            {k.ungespeichert && k.status === "aktiv" && <Badge variant="outline">Änderungen nicht veröffentlicht</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {SICHTBARKEIT_NAMEN[k.sichtbarkeit]}
            {k.sichtbarkeit === "kunden" ? ` (${k.kundenAnzahl} ${k.kundenAnzahl === 1 ? "Kunde" : "Kunden"})` : ""}
            {k.endformat ? ` · ${k.endformat.breite} × ${k.endformat.hoehe} mm` : ""}
            {k.status === "aktiv" ? ` · Version ${k.aktuelleVersion}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">Geändert {DATUM.format(new Date(k.geaendertAm))}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1" data-tour={erste ? "pers-karte-aktionen" : undefined}>
          {k.archiviert ? (
            <Button size="sm" variant="secondary" onClick={() => archivieren(true)}>
              Wiederherstellen
            </Button>
          ) : (
            <>
              <Button size="sm" render={<Link href={`/staff/personalisierung/${k.id}`} />}>
                Bearbeiten
              </Button>
              <Button size="sm" variant="secondary" onClick={duplizieren}>
                Duplizieren
              </Button>
              <Button size="sm" variant="secondary" onClick={linkKopieren}>
                Link kopieren
              </Button>
              {k.status === "aktiv" && (
                <Button size="sm" variant="secondary" render={<Link href={`/staff/personalisierung/${k.id}/ausfuellen`} />}>
                  Für Kunden ausfüllen
                </Button>
              )}
              <ConfirmAction
                triggerLabel="Archivieren"
                title={`„${k.name}“ archivieren?`}
                description="Die Vorlage verschwindet aus der Übersicht und ist für Kunden nicht mehr erreichbar. Bereits eingegangene Aufträge bleiben unverändert. Sie können sie jederzeit wiederherstellen."
                confirmLabel="Archivieren"
                onConfirm={() => archivieren(false)}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Übersicht der Vorlagen als Karten mit Suche. */
export function Uebersicht() {
  const router = useRouter();
  const meldeFehler = useStaffFehler();
  const [vorlagen, setVorlagen] = useState<VorlagenKarte[] | null>(null);
  const [suche, setSuche] = useState("");
  const [archiv, setArchiv] = useState(false);

  const laden = useCallback(async () => {
    try {
      setVorlagen((await api<{ vorlagen: VorlagenKarte[] }>(`${STAFF_API}/vorlagen${archiv ? "?archiviert=1" : ""}`)).vorlagen);
    } catch (e) {
      setVorlagen([]);
      meldeFehler(e, "Die Vorlagen konnten nicht geladen werden.");
    }
  }, [archiv, meldeFehler]);
  useEffect(() => {
    void laden();
  }, [laden]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (vorlagen ?? []).filter((v) => (archiv ? v.archiviert : !v.archiviert)).filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [vorlagen, suche, archiv]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        titel="Personalisierung"
        beschreibung="Vorlagen für Visitenkarten, Namensschilder und alles, was mit individuellen Daten gedruckt wird."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Personalisierung" }]}
        aktionen={
          <>
            <Button variant="secondary" render={<Link href="/staff/personalisierung/bibliothek" />} data-tour="pers-bibliothek">
              Schriften &amp; Farben
            </Button>
            <Button render={<Link href="/staff/personalisierung/neu" />} data-tour="pers-neu" data-umami-event="Personalisierung: Neue Vorlage">
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              Neue Vorlage
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3" data-tour="pers-suche">
        <Input type="search" aria-label="Vorlagen suchen" placeholder="Vorlage suchen …" className="max-w-sm" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} className="size-4" />
          Archivierte anzeigen
        </label>
      </div>
      {vorlagen === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Vorlagen werden geladen">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : gefiltert.length === 0 ? (
        suche || archiv ? (
          <EmptyState illustration="search" titel="Keine Vorlage gefunden" beschreibung="Suche anpassen oder „Archivierte anzeigen“ ändern." />
        ) : (
          <EmptyState
            illustration="tray"
            titel="Noch keine Vorlage"
            beschreibung="Laden Sie ein Design-PDF hoch, ziehen Sie die Felder an die richtige Stelle – fertig. Ein Assistent führt Sie in vier Schritten."
            aktion={<Button render={<Link href="/staff/personalisierung/neu" />}>Erste Vorlage anlegen</Button>}
          />
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gefiltert.map((k, i) => (
            <li key={k.id}>
              <Karte k={k} erste={i === 0} neuLaden={laden} onFehler={meldeFehler} onWeiter={(id) => router.push(`/staff/personalisierung/${id}`)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
