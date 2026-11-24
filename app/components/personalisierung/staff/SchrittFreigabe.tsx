"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { Meldungsbox } from "@/components/personalisierung/staff/bausteine";
import type { SchrittProps } from "@/components/personalisierung/staff/Assistent";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { api, ApiFehler, kopiere, STAFF_API } from "@/lib/personalisierung/ui/api";
import { veroeffentlichungsProbleme } from "@/lib/personalisierung/ui/editor";
import { SICHTBARKEIT_NAMEN, type Sichtbarkeit, type VorlagenStatus } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

interface LinkEintrag {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  kopierbar?: boolean;
}
interface KundeEintrag {
  id: string;
  email: string;
  name: string | null;
}
export interface FreigabeDaten {
  kunden: KundeEintrag[];
  links: LinkEintrag[];
}
interface Identitaet {
  id: string;
  email: string;
  displayName: string | null;
  firm: string | null;
  status: string;
}

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const OPTIONEN: { wert: Sichtbarkeit; text: string }[] = [
  { wert: "mitarbeiter", text: "Nur Mitarbeiter können die Vorlage nutzen, zum Beispiel zum Testen oder um für Kunden auszufüllen." },
  { wert: "kunden", text: "Ausgewählte Kunden sehen die Vorlage nach der Anmeldung unter „Meine Vorlagen“." },
  { wert: "oeffentlich", text: "Jeder mit dem Link kann ohne Konto Daten eingeben, z. B. für Messen oder Vereine. Sie können Links jederzeit widerrufen." },
];

function Kundenwahl({ id, ausgewaehlt, onGeaendert }: { id: string; ausgewaehlt: KundeEintrag[]; onGeaendert: (k: KundeEintrag[]) => void }) {
  const meldeFehler = useStaffFehler();
  const [alle, setAlle] = useState<Identitaet[] | null>(null);
  const [suche, setSuche] = useState("");
  useEffect(() => {
    api<{ identities: Identitaet[] }>("/api/staff/identities")
      .then((r) => setAlle(r.identities.filter((i) => i.status === "customer")))
      .catch((e) => {
        setAlle([]);
        meldeFehler(e, "Die Kundenliste konnte nicht geladen werden.");
      });
  }, [meldeFehler]);
  const gewaehlt = new Set(ausgewaehlt.map((k) => k.id));
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (alle ?? []).filter((k) => !q || `${k.email} ${k.displayName ?? ""} ${k.firm ?? ""}`.toLowerCase().includes(q)).slice(0, 40);
  }, [alle, suche]);

  async function umschalten(k: Identitaet) {
    const neu = gewaehlt.has(k.id) ? ausgewaehlt.filter((x) => x.id !== k.id) : [...ausgewaehlt, { id: k.id, email: k.email, name: k.displayName }];
    try {
      const r = await api<{ kunden: KundeEintrag[] }>(`${STAFF_API}/vorlagen/${id}/kunden`, { method: "PUT", json: { kundenIds: neu.map((x) => x.id) } });
      onGeaendert(r.kunden);
    } catch (e) {
      meldeFehler(e, "Die Auswahl konnte nicht gespeichert werden.");
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border p-3" data-tour="pers-kunden">
      <h3 className="text-sm font-semibold">Welche Kunden dürfen die Vorlage nutzen? ({ausgewaehlt.length} gewählt)</h3>
      <Input type="search" aria-label="Kunden suchen" placeholder="Kunde suchen (Name, Firma, E-Mail) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {alle === null ? (
        <p className="text-sm text-muted-foreground">Kunden werden geladen …</p>
      ) : treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein freigeschalteter Kunde gefunden.</p>
      ) : (
        <ul className="max-h-60 space-y-0.5 overflow-auto">
          {treffer.map((k) => (
            <li key={k.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" className="size-4" checked={gewaehlt.has(k.id)} onChange={() => umschalten(k)} />
                <span className="min-w-0 truncate">
                  {k.displayName || k.email}
                  {k.firm ? <span className="text-muted-foreground"> · {k.firm}</span> : null}
                  {k.displayName ? <span className="text-muted-foreground"> · {k.email}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Links({ id, links, onGeaendert }: { id: string; links: LinkEintrag[]; onGeaendert: () => void }) {
  const meldeFehler = useStaffFehler();
  const [label, setLabel] = useState("");
  const [tage, setTage] = useState("0");
  const [neu, setNeu] = useState<{ url: string; hinweis: string | null } | null>(null);
  const [jetzt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  async function erzeugen() {
    setBusy(true);
    try {
      const r = await api<{ url: string; hinweis: string | null }>(`${STAFF_API}/vorlagen/${id}/links`, { method: "POST", json: { label, ablaufTage: tage === "0" ? null : Number(tage) } });
      setNeu({ url: r.url, hinweis: r.hinweis });
      try {
        sessionStorage.setItem(`pers-link:${id}`, r.url);
      } catch {
        /* ohne Speicher */
      }
      setLabel("");
      onGeaendert();
      toast.add({ description: (await kopiere(r.url)) ? "Link erzeugt und kopiert." : "Link erzeugt.", type: "success" });
    } catch (e) {
      meldeFehler(e, "Der Link konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }
  async function kopieren(l: LinkEintrag) {
    try {
      const r = await api<{ url: string }>(`${STAFF_API}/vorlagen/${id}/links/${l.id}`);
      toast.add({ description: (await kopiere(r.url)) ? "Link kopiert." : "Kopieren nicht möglich.", type: "info" });
    } catch (e) {
      meldeFehler(e, "Der Link konnte nicht abgerufen werden.");
    }
  }
  async function widerrufen(l: LinkEintrag) {
    try {
      await api(`${STAFF_API}/vorlagen/${id}/links/${l.id}`, { method: "DELETE" });
      toast.add({ description: "Link widerrufen. Er funktioniert nicht mehr.", type: "success" });
      onGeaendert();
    } catch (e) {
      meldeFehler(e);
    }
  }
  return (
    <div className="space-y-3 rounded-2xl border p-3" data-tour="pers-links">
      <h3 className="text-sm font-semibold">Links für Kunden ohne Konto</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="link-label" className="text-sm font-medium">Bezeichnung (optional)</label>
          <Input id="link-label" value={label} maxLength={120} placeholder="z. B. Messe Stuttgart" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Gültig</span>
          <Select value={tage} onValueChange={setTage} options={[{ value: "0", label: "Unbegrenzt" }, { value: "7", label: "7 Tage" }, { value: "30", label: "30 Tage" }, { value: "90", label: "90 Tage" }]} />
        </div>
        <Button type="button" onClick={erzeugen} disabled={busy} data-umami-event="Personalisierung: Link erzeugt">
          Link erzeugen und kopieren
        </Button>
      </div>
      {neu && (
        <Meldungsbox ton="ok">
          <p className="font-medium">Ihr neuer Link:</p>
          <p className="break-all font-mono text-xs">{neu.url}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={async () => toast.add({ description: (await kopiere(neu.url)) ? "Kopiert." : "Kopieren nicht möglich.", type: "info" })}>
              Erneut kopieren
            </Button>
            <Button type="button" size="sm" variant="secondary" render={<a href={neu.url} target="_blank" rel="noreferrer" />}>
              Als Kunde ausprobieren
            </Button>
          </div>
          {neu.hinweis && <p className="mt-2 text-xs">{neu.hinweis}</p>}
        </Meldungsbox>
      )}
      {links.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {links.map((l) => {
            const abgelaufen = l.expiresAt && new Date(l.expiresAt).getTime() < jetzt;
            const aktiv = !l.revokedAt && !abgelaufen;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.label || "Link ohne Bezeichnung"}</span>
                <span className="text-xs text-muted-foreground">
                  erstellt {DATUM.format(new Date(l.createdAt))}
                  {l.expiresAt ? `, gültig bis ${DATUM.format(new Date(l.expiresAt))}` : ""}
                </span>
                {aktiv ? <Badge>Aktiv</Badge> : <Badge variant="outline">{l.revokedAt ? "Widerrufen" : "Abgelaufen"}</Badge>}
                {aktiv && l.kopierbar && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => void kopieren(l)}>
                    Link kopieren
                  </Button>
                )}
                {aktiv && (
                  <ConfirmAction triggerLabel="Widerrufen" title="Link widerrufen?" description="Wer diesen Link hat, kann die Vorlage danach nicht mehr öffnen. Bereits eingegangene Aufträge bleiben unverändert." confirmLabel="Widerrufen" onConfirm={() => widerrufen(l)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Schritt 4: Sichtbarkeit, Links, Veröffentlichen. */
export function SchrittFreigabe({
  vorlage,
  id,
  detail,
  neuLaden,
  sichern,
  istSauber,
}: SchrittProps & {
  id: string;
  detail: FreigabeDaten & { status: VorlagenStatus; sichtbarkeit: Sichtbarkeit; aktuelleVersion: number; arbeitskopie: unknown | null };
  neuLaden: () => Promise<unknown>;
  sichern: () => Promise<void>;
  istSauber: () => boolean;
}) {
  const meldeFehler = useStaffFehler();
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>(detail.sichtbarkeit);
  const [kunden, setKunden] = useState(detail.kunden);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<number | null>(null);
  const probleme = useMemo(() => veroeffentlichungsProbleme(vorlage), [vorlage]);
  const aktiv = detail.status === "aktiv";
  const hatAenderungen = !istSauber() || detail.arbeitskopie !== null;

  async function waehleSichtbarkeit(s: Sichtbarkeit) {
    const vorher = sichtbarkeit;
    setSichtbarkeit(s);
    try {
      await api(`${STAFF_API}/vorlagen/${id}`, { method: "PUT", json: { sichtbarkeit: s } });
    } catch (e) {
      setSichtbarkeit(vorher);
      meldeFehler(e, "Die Sichtbarkeit konnte nicht gespeichert werden.");
    }
  }

  async function veroeffentlichen() {
    setBusy(true);
    setFehler(null);
    try {
      await sichern();
      const d = await api<{ aktuelleVersion: number }>(`${STAFF_API}/vorlagen/${id}/veroeffentlichen`, { method: "POST", json: { sichtbarkeit } });
      setFertig(d.aktuelleVersion);
      await neuLaden();
      toast.add({ description: aktiv ? `Version ${d.aktuelleVersion} ist veröffentlicht.` : "Die Vorlage ist veröffentlicht.", type: "success" });
    } catch (e) {
      if (e instanceof ApiFehler && (e.status === 401 || e.status === 403)) meldeFehler(e);
      else setFehler(e instanceof Error ? e.message : "Das Veröffentlichen hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  async function zuruecksetzen() {
    try {
      await api(`${STAFF_API}/vorlagen/${id}`, { method: "PUT", json: { status: "entwurf" } });
      toast.add({ description: "Die Vorlage ist wieder ein Entwurf und für Kunden nicht mehr erreichbar.", type: "success" });
      await neuLaden();
    } catch (e) {
      meldeFehler(e);
    }
  }
  async function verwerfen() {
    try {
      await api(`${STAFF_API}/vorlagen/${id}/arbeitskopie`, { method: "DELETE" });
      window.location.reload();
    } catch (e) {
      meldeFehler(e);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <fieldset className="space-y-2" data-tour="pers-sichtbarkeit">
          <legend className="mb-1 text-base font-semibold">Wer darf die Vorlage nutzen?</legend>
          {OPTIONEN.map((o) => (
            <label key={o.wert} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-3", sichtbarkeit === o.wert ? "border-primary bg-primary/10" : "border-border hover:border-ring")}>
              <input type="radio" name="sichtbarkeit" className="mt-1" checked={sichtbarkeit === o.wert} onChange={() => waehleSichtbarkeit(o.wert)} />
              <span>
                <span className="block text-sm font-semibold">{SICHTBARKEIT_NAMEN[o.wert]}</span>
                <span className="block text-sm text-muted-foreground">{o.text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {sichtbarkeit === "kunden" && <Kundenwahl id={id} ausgewaehlt={kunden} onGeaendert={setKunden} />}
        {sichtbarkeit === "kunden" && kunden.length === 0 && <Meldungsbox ton="hinweis">Es ist noch kein Kunde ausgewählt. Die Vorlage ist so für niemanden sichtbar.</Meldungsbox>}
        {sichtbarkeit === "oeffentlich" && <Links id={id} links={detail.links} onGeaendert={() => void neuLaden()} />}
        {sichtbarkeit === "kunden" && aktiv && (
          <p className="text-sm text-muted-foreground">
            Direktlink für angemeldete Kunden: <code className="break-all rounded bg-muted px-1">/personalisieren/{id}</code>
          </p>
        )}
      </div>

      <aside className="space-y-4" aria-label="Veröffentlichen">
        <div className="space-y-2 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Veröffentlichen</h2>
            {aktiv ? <Badge>Aktiv, Version {detail.aktuelleVersion}</Badge> : <Badge variant="secondary">Entwurf</Badge>}
            {aktiv && hatAenderungen && <Badge variant="outline">Änderungen nicht veröffentlicht</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Beim Veröffentlichen wird der aktuelle Stand als unveränderliche Version festgehalten.{" "}
            {aktiv ? "Kunden, die gerade ausfüllen, machen mit der bisherigen Version weiter und verlieren nichts." : "Davor sehen nur Sie die Vorlage."}
          </p>
          {probleme.length > 0 ? (
            <div data-tour="pers-probleme">
              <Meldungsbox ton="hinweis">
                <p className="mb-1 font-medium">Noch zu erledigen:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {probleme.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </Meldungsbox>
            </div>
          ) : (
            <Meldungsbox ton="ok">Alles bereit.</Meldungsbox>
          )}
          {fehler && <Meldungsbox ton="fehler">{fehler}</Meldungsbox>}
          <Button type="button" className="w-full" onClick={veroeffentlichen} disabled={busy || probleme.length > 0} data-tour="pers-veroeffentlichen" data-umami-event="Personalisierung: Veröffentlicht">
            {busy ? "Wird veröffentlicht …" : aktiv ? `Änderungen veröffentlichen (Version ${detail.aktuelleVersion + 1})` : "Veröffentlichen"}
          </Button>
          {fertig !== null && (
            <Meldungsbox ton="ok">
              Veröffentlicht (Version {fertig}). <Link className="underline" href={`/personalisieren/${id}`} target="_blank">Als Kunde ausprobieren</Link> oder <Link className="underline" href={`/staff/personalisierung/${id}/ausfuellen`}>für einen Kunden ausfüllen</Link>.
            </Meldungsbox>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {aktiv && (
            <ConfirmAction triggerLabel="Zurück auf Entwurf" title="Vorlage zurück auf Entwurf?" description="Kunden können die Vorlage danach nicht mehr öffnen. Eingegangene Aufträge bleiben unverändert." confirmLabel="Zurück auf Entwurf" onConfirm={zuruecksetzen} />
          )}
          {detail.arbeitskopie !== null && (
            <ConfirmAction triggerLabel="Änderungen verwerfen" title="Nicht veröffentlichte Änderungen verwerfen?" description="Die Vorlage geht zurück auf den zuletzt veröffentlichten bzw. gespeicherten Stand. Das lässt sich nicht rückgängig machen." confirmLabel="Verwerfen" onConfirm={verwerfen} />
          )}
        </div>
      </aside>
    </div>
  );
}
