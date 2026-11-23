"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { SchrittDesign } from "@/components/personalisierung/staff/SchrittDesign";
import { SchrittFelder } from "@/components/personalisierung/staff/SchrittFelder";
import { SchrittBogen } from "@/components/personalisierung/staff/SchrittBogen";
import { SchrittFreigabe, type FreigabeDaten } from "@/components/personalisierung/staff/SchrittFreigabe";
import { cn } from "@/lib/utils";
import { api, ApiFehler, STAFF_API, vorSekunden } from "@/lib/personalisierung/ui/api";
import type { SchriftEintrag } from "@/lib/personalisierung/ui/browser-engine";
import { festhalten, leereVorlage, neuerVerlauf, rueckgaengig, setze, setzeLive, wiederholen, type Verlauf } from "@/lib/personalisierung/ui/editor";
import { STANDARD_FARBEN, VorlageBasisSchema, type Farbe, type Sichtbarkeit, type Vorlage, type VorlagenStatus } from "@/lib/personalisierung/schema";

const SCHRITTE = [
  { nr: 1, titel: "Design", tour: "pers-schritt-design" },
  { nr: 2, titel: "Felder", tour: "pers-schritt-felder" },
  { nr: 3, titel: "Druckbogen", tour: "pers-schritt-bogen" },
  { nr: 4, titel: "Freigabe", tour: "pers-schritt-freigabe" },
] as const;

interface Detail extends FreigabeDaten {
  id: string;
  name: string;
  status: VorlagenStatus;
  sichtbarkeit: Sichtbarkeit;
  aktuelleVersion: number;
  vorlage: Vorlage;
  arbeitskopie: unknown | null;
}

type Speicher = "sauber" | "ungespeichert" | "speichert" | "gespeichert" | "fehler";

/** Wie ein Entwurf in einer Datei: Struktur prüfen und Standardwerte auffüllen, aber Querprüfungen weglassen. */
function lade(spec: unknown, rueckfall: Vorlage): Vorlage {
  const p = VorlageBasisSchema.safeParse(spec);
  return p.success ? (p.data as Vorlage) : rueckfall;
}

export interface SchrittProps {
  vorlage: Vorlage;
  aendere: (neu: Vorlage | ((v: Vorlage) => Vorlage), schluessel?: string) => void;
}

/** Geführter Assistent: Design → Felder → Druckbogen → Freigabe, Autospeichern in die Arbeitskopie. */
export function Assistent({ id }: { id: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const meldeFehler = useStaffFehler();
  const [ladezustand, setLadezustand] = useState<"laden" | "fertig" | "fehler">(id ? "laden" : "fertig");
  const [verlauf, setVerlauf] = useState<Verlauf<Vorlage>>(() => neuerVerlauf(leereVorlage()));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [schritt, setSchritt] = useState<number>(() => Math.min(4, Math.max(1, Number(params.get("schritt")) || 1)));
  const [speicher, setSpeicher] = useState<Speicher>("sauber");
  const [gespeichertUm, setGespeichertUm] = useState<number | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [schriften, setSchriften] = useState<SchriftEintrag[]>([]);
  const [farben, setFarben] = useState<Farbe[]>([]);
  const [erstellt, setErstellt] = useState(false);
  const geladen = useRef<Vorlage | null>(null);
  const vorlage = verlauf.aktuell;
  const neueste = useRef(vorlage);
  useEffect(() => {
    neueste.current = vorlage;
  }, [vorlage]);
  const wiederhole = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laufend = useRef<Promise<void> | null>(null);

  const ladeDetail = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api<Detail>(`${STAFF_API}/vorlagen/${id}`);
      setDetail(d);
      return d;
    } catch (e) {
      meldeFehler(e, "Die Vorlage konnte nicht geladen werden.");
      setLadezustand("fehler");
    }
  }, [id, meldeFehler]);

  // Vorlage, Schriften und Farben laden
  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const [s, f] = await Promise.all([api<{ schriften: SchriftEintrag[] }>(`${STAFF_API}/schriften`), api<{ farben: (Farbe & { id: string })[] }>(`${STAFF_API}/farben`)]);
        if (!aktiv) return;
        setSchriften(s.schriften);
        const palette = f.farben.map(({ id: _id, ...x }) => (void _id, x));
        // Schwarz und Weiß gibt es immer (die Engine kennt sie auch ohne Eintrag in der Palette)
        setFarben([...palette, ...STANDARD_FARBEN.filter((st) => !palette.some((p) => p.name === st.name))]);
      } catch (e) {
        if (aktiv) meldeFehler(e, "Schriften und Farben konnten nicht geladen werden.");
      }
      if (!id) return;
      const d = await ladeDetail();
      if (!aktiv || !d) return;
      const v = lade(d.arbeitskopie ?? d.vorlage, d.vorlage);
      geladen.current = v;
      setVerlauf(neuerVerlauf(v));
      setLadezustand("fertig");
    })();
    return () => {
      aktiv = false;
    };
  }, [id, ladeDetail, meldeFehler]);

  // Autospeichern: 1,2 s nach der letzten Änderung in die Arbeitskopie (keine neue Version).
  const sichern = useCallback(
    async (keepalive = false) => {
      if (!id) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const stand = neueste.current;
      if (stand === geladen.current) return;
      if (!stand.name.trim()) return; // ohne Namen kann nichts gespeichert werden; Schritt 1 weist darauf hin
      setSpeicher("speichert");
      const lauf = (async () => {
        try {
          await api(`${STAFF_API}/vorlagen/${id}/arbeitskopie`, { method: "PUT", json: { vorlage: stand }, keepalive });
          geladen.current = stand;
          setGespeichertUm(Date.now());
          setSpeicher(neueste.current === stand ? "gespeichert" : "ungespeichert");
        } catch (e) {
          if (e instanceof ApiFehler && (e.status === 401 || e.status === 403)) {
            meldeFehler(e);
            return;
          }
          setSpeicher("fehler");
          timer.current = setTimeout(() => wiederhole.current(), 5000); // erneut versuchen
        }
      })();
      laufend.current = lauf;
      await lauf;
    },
    [id, meldeFehler],
  );
  useEffect(() => {
    wiederhole.current = () => void sichern();
  }, [sichern]);
  useEffect(() => {
    if (!id || ladezustand !== "fertig" || vorlage === geladen.current) return;
    setSpeicher("ungespeichert");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sichern(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [vorlage, id, ladezustand, sichern]);

  // Beim Verlassen: Rest speichern und vor Datenverlust warnen
  useEffect(() => {
    const vorSchliessen = (e: BeforeUnloadEvent) => {
      if (neueste.current !== geladen.current && id) {
        void sichern(true);
        e.preventDefault();
      }
    };
    const versteckt = () => {
      if (document.visibilityState === "hidden") void sichern(true);
    };
    window.addEventListener("beforeunload", vorSchliessen);
    document.addEventListener("visibilitychange", versteckt);
    return () => {
      window.removeEventListener("beforeunload", vorSchliessen);
      document.removeEventListener("visibilitychange", versteckt);
    };
  }, [id, sichern]);
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const aendere = useCallback<SchrittProps["aendere"]>((neu, schluessel) => {
    setVerlauf((v) => setze(v, typeof neu === "function" ? neu(v.aktuell) : neu, { schluessel }));
  }, []);
  const editor = useMemo(
    () => ({
      live: (neu: Vorlage) => setVerlauf((v) => setzeLive(v, neu)),
      festhalten: (vorher: Vorlage) => setVerlauf((v) => festhalten(v, vorher)),
      rueckgaengig: () => setVerlauf((v) => rueckgaengig(v)),
      wiederholen: () => setVerlauf((v) => wiederholen(v)),
    }),
    [],
  );

  function geheZu(nr: number) {
    setSchritt(nr);
    window.history.replaceState(null, "", `?schritt=${nr}`);
    window.scrollTo({ top: 0 });
  }

  async function erstellen() {
    if (erstellt) return;
    if (!vorlage.name.trim()) return toast.add({ description: "Bitte geben Sie der Vorlage einen Namen.", type: "error" });
    if (!vorlage.design.dateiId) return toast.add({ description: "Bitte laden Sie zuerst das Design-PDF hoch.", type: "error" });
    setErstellt(true);
    try {
      const d = await api<{ id: string }>(`${STAFF_API}/vorlagen`, { method: "POST", json: { vorlage } });
      router.replace(`/staff/personalisierung/${d.id}?schritt=2`);
    } catch (e) {
      setErstellt(false);
      meldeFehler(e, "Die Vorlage konnte nicht angelegt werden.");
    }
  }

  async function weiter() {
    if (!id) return erstellen();
    if (schritt === 1 && !vorlage.name.trim()) return toast.add({ description: "Bitte geben Sie der Vorlage einen Namen.", type: "error" });
    await sichern();
    geheZu(Math.min(4, schritt + 1));
  }

  if (ladezustand === "laden") {
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-6" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </main>
    );
  }
  if (ladezustand === "fehler") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-6">
        <PageHeader titel="Vorlage nicht gefunden" beschreibung="Die Vorlage gibt es nicht mehr oder Sie haben keinen Zugriff." />
        <Button render={<Link href="/staff/personalisierung" />}>Zur Übersicht</Button>
      </main>
    );
  }

  const speicherText =
    !id ? "Wird gespeichert, sobald Sie fortfahren." : speicher === "speichert" ? "Speichert …" : speicher === "fehler" ? "Speichern fehlgeschlagen, neuer Versuch läuft …" : speicher === "ungespeichert" ? "Änderungen werden gespeichert …" : gespeichertUm ? `Entwurf gespeichert · ${vorSekunden(gespeichertUm, jetzt)}` : "Entwurf wird automatisch gespeichert";
  const gemeinsam: SchrittProps = { vorlage, aendere };
  const breit = schritt === 2;

  return (
    <main className={cn("mx-auto space-y-5 px-4 py-6 md:px-6", breit ? "max-w-[1700px]" : "max-w-5xl")}>
      <PageHeader
        titel={vorlage.name.trim() || "Neue Vorlage"}
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Personalisierung", href: "/staff/personalisierung" }, { bezeichnung: id ? "Bearbeiten" : "Neu" }]}
        aktionen={
          <div className="flex items-center gap-3">
            <p role="status" aria-live="polite" className={cn("text-sm", speicher === "fehler" ? "text-destructive" : "text-muted-foreground")} data-tour="pers-autospeichern">
              {speicherText}
            </p>
            <Button variant="secondary" render={<Link href="/staff/personalisierung" />}>
              Schließen
            </Button>
          </div>
        }
      />
      <nav aria-label="Schritte" data-tour="pers-schritte">
        <ol className="grid grid-cols-4 gap-2">
          {SCHRITTE.map((s) => {
            const erreichbar = !!id || s.nr === 1;
            const aktiv = s.nr === schritt;
            return (
              <li key={s.nr}>
                <button
                  type="button"
                  disabled={!erreichbar}
                  aria-current={aktiv ? "step" : undefined}
                  data-tour={s.tour}
                  onClick={() => (id ? sichern().then(() => geheZu(s.nr)) : geheZu(s.nr))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    aktiv ? "border-primary bg-primary/10 font-semibold" : s.nr < schritt ? "border-border bg-muted/50" : "border-border text-muted-foreground",
                    !erreichbar && "opacity-50",
                  )}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", aktiv || s.nr < schritt ? "bg-primary text-primary-foreground" : "bg-muted")}>{s.nr}</span>
                  <span className="truncate">{s.titel}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {schritt === 1 && <SchrittDesign {...gemeinsam} istNeu={!id} />}
      {schritt === 2 && <SchrittFelder {...gemeinsam} schriften={schriften} farben={farben} editor={editor} kannZurueck={verlauf.vergangen.length > 0} kannVor={verlauf.zukunft.length > 0} />}
      {schritt === 3 && <SchrittBogen {...gemeinsam} />}
      {schritt === 4 && id && detail && (
        <SchrittFreigabe
          {...gemeinsam}
          id={id}
          detail={detail}
          neuLaden={async () => {
            const d = await ladeDetail();
            return d ?? null;
          }}
          sichern={sichern}
          istSauber={() => neueste.current === geladen.current}
        />
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button variant="secondary" onClick={() => geheZu(Math.max(1, schritt - 1))} disabled={schritt === 1}>
          Zurück
        </Button>
        {schritt < 4 && (
          <Button onClick={weiter} disabled={erstellt} data-tour="pers-weiter" data-umami-event={`Personalisierung: Schritt ${schritt} weiter`}>
            {!id ? (erstellt ? "Wird angelegt …" : "Vorlage anlegen und weiter") : `Weiter: ${SCHRITTE[schritt].titel}`}
          </Button>
        )}
      </div>
    </main>
  );
}
