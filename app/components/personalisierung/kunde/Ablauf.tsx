"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { HilfeMenue } from "@/components/hilfe/HilfeMenue";
import { PageTour } from "@/components/tour/PageTour";
import { Absenden } from "@/components/personalisierung/kunde/Absenden";
import { Einzeln, StatusPunkt } from "@/components/personalisierung/kunde/Einzeln";
import { Tabelle } from "@/components/personalisierung/kunde/Tabelle";
import { Vorschau } from "@/components/personalisierung/kunde/Vorschau";
import { Z, type Ansicht, type EntwurfRef } from "@/components/personalisierung/kunde/z";
import { Meldungsbox } from "@/components/personalisierung/staff/bausteine";
import { api, ApiFehler } from "@/lib/personalisierung/ui/api";
import {
  ausDatensaetzen,
  dupliziereEintrag,
  entwurfSchluessel,
  istLeer,
  kurzText,
  loescheEintrag,
  meldungsText,
  neuerEintrag,
  statusVon,
  wertePruefungAus,
  zaehleStatus,
  zuDatensaetzen,
  type Eintrag,
} from "@/lib/personalisierung/ui/kunde";
import type { Meldung } from "@/lib/personalisierung/render";
import type { Datensatz } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

const SCHRITTE = [
  { id: "daten", titel: "Daten eingeben", tour: "pers-k-schritt-daten" },
  { id: "pruefen", titel: "Prüfen", tour: "pers-k-schritt-pruefen" },
  { id: "absenden", titel: "Absenden", tour: "pers-k-schritt-absenden" },
] as const;
type SchrittId = (typeof SCHRITTE)[number]["id"];

function leseSpeicher(ref: string): EntwurfRef | null {
  try {
    const s = JSON.parse(localStorage.getItem(entwurfSchluessel(ref)) ?? "null") as EntwurfRef | null;
    return s && typeof s.id === "string" && typeof s.token === "string" ? s : null;
  } catch {
    return null;
  }
}
function schreibeSpeicher(ref: string, e: EntwurfRef | null) {
  try {
    if (e) localStorage.setItem(entwurfSchluessel(ref), JSON.stringify(e));
    else localStorage.removeItem(entwurfSchluessel(ref));
  } catch {
    /* privater Modus: dann gibt es keine Wiederaufnahme, alles andere funktioniert */
  }
}

interface Kunde {
  id: string;
  email: string;
  displayName: string | null;
  firm: string | null;
  status: string;
}

/** Mitarbeiter wählen den Kunden, für den sie ausfüllen. */
function KundenAuswahl({ wert, onWahl }: { wert: string | null; onWahl: (id: string | null) => void }) {
  const [liste, setListe] = useState<Kunde[] | null>(null);
  useEffect(() => {
    api<{ identities: Kunde[] }>("/api/staff/identities").then((r) => setListe(r.identities.filter((k) => k.status === "customer"))).catch(() => setListe([]));
  }, []);
  return (
    <div className="space-y-1 rounded-2xl border border-primary/40 bg-primary/5 p-3" data-tour="pers-kundenwahl">
      <label className="text-sm font-semibold" id="kunde-label">Für welchen Kunden füllen Sie aus?</label>
      <p className="text-xs text-muted-foreground">Der Auftrag entsteht im Namen dieses Kunden und gehört seinem Konto. Ein Bestätigungscode ist nicht nötig.</p>
      {liste === null ? <p className="text-sm text-muted-foreground">Kunden werden geladen …</p> : (
        <Select value={wert ?? ""} onValueChange={(v) => onWahl(v || null)} placeholder="Kunde auswählen …" options={liste.map((k) => ({ value: k.id, label: `${k.displayName || k.email}${k.firm ? ` · ${k.firm}` : ""}` }))} />
      )}
    </div>
  );
}

/** Der Kundenablauf: Daten eingeben → Prüfen → Absenden. Für Gäste (Link), Kunden mit Konto und Mitarbeiter. */
export function Ablauf({ refKennung }: { refKennung: string }) {
  const z = useMemo(() => new Z(refKennung, null), [refKennung]);
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);
  const [ladeFehler, setLadeFehler] = useState<{ text: string; anmelden: boolean } | null>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [schritt, setSchritt] = useState<SchrittId>("daten");
  const [reiter, setReiter] = useState<"einzeln" | "tabelle">("einzeln");
  const [bereit, setBereit] = useState(false);
  const [wiederaufgenommen, setWiederaufgenommen] = useState<string | null>(null);
  const [fokus, setFokus] = useState<{ uid: string; variable: string } | null>(null);
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [fertig, setFertig] = useState<{ anfrageId: string; nummer: string | null; kunde?: boolean } | null>(null);
  const [speicherFehler, setSpeicherFehler] = useState(false);
  const [meldungen, setMeldungen] = useState<{ liste: Meldung[]; uids: string; schluessel: string } | null>(null);
  const [pruefLaedt, setPruefLaedt] = useState(false);
  const [pruefFehler, setPruefFehler] = useState<string | null>(null);
  const [vorschauNr, setVorschauNr] = useState(0);
  const eintraegeRef = useRef(eintraege);
  useEffect(() => {
    eintraegeRef.current = eintraege;
  }, [eintraege]);
  const speichern = useRef<Promise<unknown>>(Promise.resolve());
  const gespeichertKey = useRef<string>("");

  // ---- Laden: Zwischenstand aus dem Browser, Vorlage, Entwurf
  useEffect(() => {
    let aktiv = true;
    (async () => {
      z.setzeEntwurf(leseSpeicher(refKennung));
      try {
        const a = await z.get<Ansicht>("");
        if (!aktiv) return;
        setAnsicht(a);
        let start: Eintrag[] = [];
        if (z.entwurf) {
          try {
            const e = await z.get<{ datensaetze: Datensatz[]; expiresAt: string }>(`/entwuerfe/${z.entwurf.id}`);
            start = ausDatensaetzen(e.datensaetze, a.variablen);
            z.setzeEntwurf({ ...z.entwurf, expiresAt: e.expiresAt });
            if (start.length) setWiederaufgenommen(e.expiresAt);
            gespeichertKey.current = JSON.stringify(e.datensaetze);
          } catch {
            // Entwurf abgelaufen oder gelöscht
            z.setzeEntwurf(null);
            schreibeSpeicher(refKennung, null);
            toast.add({ description: `Ihr früherer Zwischenstand wurde nach ${a.entwurfStunden} Stunden ohne Änderung aus Datenschutzgründen gelöscht. Bitte beginnen Sie neu.`, type: "info" });
          }
        }
        if (start.length === 0) start = [neuerEintrag(a.variablen)];
        setEintraege(start);
        setAuswahl(start[0].uid);
        setBereit(true);
      } catch (e) {
        if (!aktiv) return;
        const f = e instanceof ApiFehler ? e : null;
        setLadeFehler({ text: f?.status === 401 ? "Bitte melden Sie sich an, um diese Vorlage zu nutzen." : f?.status === 404 || !f ? "Dieser Link ist nicht (mehr) gültig. Bitte fragen Sie bei Ihrer Druckerei nach einem neuen Link." : f.message, anmelden: f?.status === 401 });
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [z, refKennung]);

  // ---- Zwischenspeichern (serverseitig, 24 h), erst bei der ersten echten Eingabe
  const sichere = useCallback(
    async (liste: Eintrag[]): Promise<EntwurfRef | null> => {
      const ds = zuDatensaetzen(liste);
      const key = JSON.stringify(ds);
      let ent = z.entwurf;
      if (!ent) {
        if (liste.every(istLeer)) return null;
        const r = await api<{ id: string; token: string; expiresAt: string }>(`/api/personalisierung/z/${z.ref}/entwuerfe`, { method: "POST", json: {} });
        ent = { id: r.id, token: r.token, expiresAt: r.expiresAt };
        z.setzeEntwurf(ent);
        schreibeSpeicher(z.ref, ent);
        gespeichertKey.current = "";
      }
      if (gespeichertKey.current !== key) {
        const r = await api<{ expiresAt: string }>(`/api/personalisierung/z/${z.ref}/entwuerfe/${ent.id}`, { method: "PUT", json: { datensaetze: ds }, headers: z.kopf() });
        ent = { ...ent, expiresAt: r.expiresAt };
        z.setzeEntwurf(ent);
        gespeichertKey.current = key;
      }
      return ent;
    },
    [z],
  );
  useEffect(() => {
    if (!bereit) return;
    const t = setTimeout(() => {
      speichern.current = sichere(eintraegeRef.current)
        .then(() => setSpeicherFehler(false))
        .catch(() => setSpeicherFehler(true));
    }, 1000);
    return () => clearTimeout(t);
  }, [eintraege, bereit, sichere]);
  // ---- Prüfen (serverseitig, Pausen gegen die Stundenbegrenzung)
  const pruefe = useCallback(
    async (liste: Eintrag[]) => {
      // Leere Zeilen (z. B. die vorbereitete erste) werden weder geprüft noch gesendet.
      const gefuellte = liste.filter((e) => !istLeer(e));
      if (gefuellte.length === 0) {
        setMeldungen(null);
        return;
      }
      const ds = zuDatensaetzen(gefuellte);
      setPruefLaedt(true);
      try {
        const r = await z.post<{ meldungen: Meldung[] }>("/pruefen", { datensaetze: ds });
        setMeldungen({ liste: r.meldungen, uids: gefuellte.map((e) => e.uid).join(","), schluessel: JSON.stringify(ds) });
        setPruefFehler(null);
      } catch (e) {
        setPruefFehler(e instanceof ApiFehler && e.status === 429 ? "Die automatische Prüfung pausiert kurz (zu viele Anfragen). Ihre Eingaben bleiben erhalten." : e instanceof Error ? e.message : "Die Prüfung ist gerade nicht möglich.");
      } finally {
        setPruefLaedt(false);
      }
    },
    [z],
  );
  const aktuellerSchluessel = JSON.stringify(zuDatensaetzen(eintraege.filter((e) => !istLeer(e))));
  useEffect(() => {
    if (!bereit || fertig) return;
    if (meldungen?.schluessel === aktuellerSchluessel) return;
    if (eintraegeRef.current.every(istLeer)) return;
    const t = setTimeout(() => void pruefe(eintraegeRef.current), schritt === "daten" ? 2500 : 700);
    return () => clearTimeout(t);
  }, [aktuellerSchluessel, bereit, schritt, fertig, meldungen?.schluessel, pruefe]);

  // Ergebnisse je Eintrag (nach Kennung), damit sie auch nach Löschen/Einfügen zum richtigen Eintrag passen
  const auswertungen = useMemo(() => {
    if (!meldungen) return null;
    const uids = meldungen.uids.split(",");
    const roh = wertePruefungAus(meldungen.liste, uids.length);
    return eintraege.map((e) => {
      const k = uids.indexOf(e.uid);
      return k >= 0 ? roh[k] : undefined;
    }) as (typeof roh[number] | undefined)[];
  }, [meldungen, eintraege]);
  const zaehler = auswertungen ? zaehleStatus(auswertungen.filter((a): a is NonNullable<typeof a> => !!a)) : null;
  const aktuelleMeldungen = meldungen?.schluessel === aktuellerSchluessel;
  const hatFehler = !!zaehler && zaehler.fehler > 0;
  const gefuellt = eintraege.filter((e) => !istLeer(e));

  // ---- Einträge ändern
  const aendereEintrag = useCallback((e: Eintrag) => setEintraege((l) => l.map((x) => (x.uid === e.uid ? e : x))), []);
  const neuerAnlegen = useCallback(() => {
    if (!ansicht) return;
    setEintraege((l) => {
      if (l.length >= ansicht.grenzen.maxDatensaetze) {
        toast.add({ description: `Es sind höchstens ${ansicht.grenzen.maxDatensaetze} Einträge möglich.`, type: "error" });
        return l;
      }
      const letzte = l[l.length - 1];
      const e = neuerEintrag(ansicht.variablen, letzte?.auflage ?? 1);
      setAuswahl(e.uid);
      setReiter("einzeln");
      return [...l, e];
    });
  }, [ansicht]);
  const loeschen = useCallback(
    (uid: string) => {
      if (!ansicht) return;
      setEintraege((l) => {
        const r = loescheEintrag(l, uid);
        if (r.eintraege.length === 0) {
          const e = neuerEintrag(ansicht.variablen);
          setAuswahl(e.uid);
          return [e];
        }
        setAuswahl((a) => (a === uid ? r.auswahl : a));
        return r.eintraege;
      });
    },
    [ansicht],
  );
  const duplizieren = useCallback((uid: string) => {
    setEintraege((l) => {
      const r = dupliziereEintrag(l, uid);
      if (r.uid) setAuswahl(r.uid);
      return r.eintraege;
    });
  }, []);

  function springeZuFeld(uid: string, variable: string) {
    setSchritt("daten");
    setReiter("einzeln");
    setAuswahl(uid);
    setFokus({ uid, variable });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function allesLoeschen() {
    if (z.entwurf) {
      try {
        await api(`/api/personalisierung/z/${z.ref}/entwuerfe/${z.entwurf.id}`, { method: "DELETE", headers: z.kopf() });
      } catch {
        /* abgelaufen = gelöscht */
      }
    }
    z.setzeEntwurf(null);
    schreibeSpeicher(z.ref, null);
    gespeichertKey.current = "";
    if (ansicht) {
      const e = neuerEintrag(ansicht.variablen);
      setEintraege([e]);
      setAuswahl(e.uid);
    }
    setMeldungen(null);
    setWiederaufgenommen(null);
    setSchritt("daten");
    toast.add({ description: "Alle Eingaben wurden gelöscht.", type: "success" });
  }

  // ---------------------------------------------------------------------------------- Darstellung
  if (ladeFehler) {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Vorlage nicht erreichbar</h1>
        <p className="text-muted-foreground">{ladeFehler.text}</p>
        {ladeFehler.anmelden ? <Button render={<Link href="/login" />}>Anmelden</Button> : <Button variant="secondary" render={<Link href="/" />}>Zur Startseite</Button>}
      </main>
    );
  }
  if (!ansicht || !bereit) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Vorlage wird geladen">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </main>
    );
  }

  if (fertig) {
    return (
      <main className="mx-auto max-w-xl space-y-5 px-4 py-12 text-center" data-tour="pers-erfolg">
        <div aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-600/15 text-2xl text-green-700">✓</div>
        <h1 className="text-2xl font-semibold">Vielen Dank, Ihr Auftrag ist eingegangen</h1>
        {fertig.nummer && (
          <p className="text-lg">
            Ihre Vorgangsnummer: <strong className="tabular-nums" data-testid="vorgangsnummer">{fertig.nummer}</strong>
          </p>
        )}
        <p className="text-muted-foreground">
          {ansicht.akteur === "gast" ? (fertig.kunde ? "Der Auftrag ist Ihrem Kundenkonto zugeordnet. Sie finden ihn nach der Anmeldung unter „Meine Aufträge“. Wir melden uns, sobald die Druckdaten geprüft sind." : "Wir haben Ihnen eine Bestätigung per E-Mail geschickt und melden uns persönlich bei Ihnen.") : "Die Druckdaten wurden erzeugt und hängen am Auftrag."} Ihre Eingaben wurden von unserem Server gelöscht.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {ansicht.akteur === "mitarbeiter" && <Button render={<Link href={`/staff/requests/${fertig.anfrageId}`} />}>Auftrag öffnen</Button>}
          {ansicht.akteur === "kunde" && <Button render={<Link href={`/requests/${fertig.anfrageId}`} />}>Auftrag ansehen</Button>}
          <Button variant="secondary" onClick={() => window.location.reload()}>Weiteren Auftrag anlegen</Button>
        </div>
      </main>
    );
  }

  const nrVorschau = Math.min(vorschauNr, Math.max(0, eintraege.length - 1));
  const aktueller = eintraege.find((e) => e.uid === auswahl) ?? eintraege[0];
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{ansicht.name}</h1>
            <p className="text-sm text-muted-foreground">{ansicht.endformat.breite} × {ansicht.endformat.hoehe} mm{ansicht.hatRueckseite ? " · beidseitig" : ""}</p>
            {ansicht.beschreibung && <p className="max-w-prose">{ansicht.beschreibung}</p>}
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground" data-tour="pers-anleitung">
              <li>Tragen Sie Ihre Daten ein, einzeln oder als Tabelle. Rechts sehen Sie sofort, wie es gedruckt aussieht.</li>
              <li>Prüfen Sie alle Einträge. Wir zeigen Ihnen, falls etwas nicht passt.</li>
              <li>{ansicht.akteur === "gast" ? "Geben Sie Ihre E-Mail-Adresse an und bestätigen Sie mit dem Code, den wir Ihnen schicken." : "Senden Sie den Auftrag ab."}</li>
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HilfeMenue kurs={ansicht.akteur === "mitarbeiter" ? "druckerei" : "kunden"} />
            <PageTour id="ausfuellen" />
          </div>
          <details className="w-full sm:w-auto" data-tour="pers-beispielvorschau">
            <summary className="cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted">Beispiel ansehen</summary>
            <div className="mt-2 w-full sm:w-72"><Vorschau z={z} datensatz={null} hatRueckseite={ansicht.hatRueckseite} maxBreite={280} /></div>
          </details>
        </div>
        {ansicht.akteur === "mitarbeiter" && <KundenAuswahl wert={kundeId} onWahl={setKundeId} />}
        {wiederaufgenommen && (
          <Meldungsbox ton="ok">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Willkommen zurück: Ihre Eingaben von vorhin sind wieder da. Gespeicherte Daten werden spätestens {ansicht.entwurfStunden} Stunden nach Ihrer letzten Änderung gelöscht.</span>
              <ConfirmAction triggerLabel="Alles löschen" title="Alle Eingaben löschen?" description="Ihre Einträge werden sofort vom Server gelöscht. Das lässt sich nicht rückgängig machen." confirmLabel="Löschen" onConfirm={allesLoeschen} />
            </div>
          </Meldungsbox>
        )}
        {speicherFehler && <Meldungsbox ton="hinweis">Zwischenspeichern gerade nicht möglich. Bleiben Sie bitte auf dieser Seite, Ihre Eingaben gehen nicht verloren.</Meldungsbox>}
      </header>

      <nav aria-label="Schritte" data-tour="pers-k-schritte">
        <ol className="grid grid-cols-3 gap-2">
          {SCHRITTE.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={schritt === s.id ? "step" : undefined}
                data-tour={s.tour}
                onClick={() => setSchritt(s.id)}
                className={cn("flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", schritt === s.id ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", schritt === s.id ? "bg-primary text-primary-foreground" : "bg-muted")}>{i + 1}</span>
                <span className="truncate">{s.titel}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {schritt === "daten" && (
        <div className="space-y-4">
          <div role="tablist" aria-label="Wie möchten Sie Ihre Daten eingeben?" className="flex flex-wrap gap-2" data-tour="pers-reiter">
            {(["einzeln", "tabelle"] as const).map((r) => (
              <button key={r} role="tab" type="button" aria-selected={reiter === r} data-tour={`pers-reiter-${r}`} onClick={() => setReiter(r)} className={cn("rounded-2xl border px-4 py-2 text-sm", reiter === r ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground hover:border-ring")}>
                {r === "einzeln" ? "Einzeln eingeben" : "Tabelle hochladen"}
              </button>
            ))}
          </div>
          {reiter === "einzeln" ? (
            <Einzeln ansicht={ansicht} z={z} eintraege={eintraege} auswertungen={auswertungen} auswahl={aktueller?.uid ?? null} setAuswahl={setAuswahl} onEintrag={aendereEintrag} onNeu={neuerAnlegen} onDuplizieren={duplizieren} onLoeschen={loeschen} fokus={fokus} zeigeFehler={false} />
          ) : (
            <Tabelle ansicht={ansicht} z={z} eintraege={eintraege} auswertungen={auswertungen} onUebernehmen={(neu) => { setEintraege(neu.length ? neu : [neuerEintrag(ansicht.variablen)]); setAuswahl(neu[0]?.uid ?? null); }} onEintrag={aendereEintrag} onLoeschen={loeschen} onNeu={neuerAnlegen} zeigeFehler={false} />
          )}
          <div className="flex justify-end">
            <Button size="lg" onClick={() => { setSchritt("pruefen"); window.scrollTo({ top: 0 }); }} disabled={gefuellt.length === 0} data-umami-event="Personalisierung: Zum Prüfen">
              Weiter: Prüfen
            </Button>
          </div>
        </div>
      )}

      {schritt === "pruefen" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section className="space-y-3" aria-label="Prüfergebnis" data-tour="pers-pruefung-liste">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{gefuellt.length} {gefuellt.length === 1 ? "Eintrag" : "Einträge"} prüfen</h2>
              <Button type="button" size="sm" variant="secondary" onClick={() => void pruefe(eintraege)} disabled={pruefLaedt}>{pruefLaedt ? "Wird geprüft …" : "Erneut prüfen"}</Button>
            </div>
            {pruefFehler && <Meldungsbox ton="hinweis">{pruefFehler}</Meldungsbox>}
            {zaehler && (
              <div role="status" aria-live="polite">
                {zaehler.fehler > 0 ? (
                  <Meldungsbox ton="fehler">{zaehler.fehler} {zaehler.fehler === 1 ? "Eintrag hat" : "Einträge haben"} einen Fehler. Klicken Sie auf „Zum Feld“, um ihn zu beheben.</Meldungsbox>
                ) : zaehler.hinweis > 0 ? (
                  <Meldungsbox ton="hinweis">Alles druckbar. {zaehler.hinweis} {zaehler.hinweis === 1 ? "Eintrag hat" : "Einträge haben"} einen Hinweis (z. B. verkleinerte Schrift).</Meldungsbox>
                ) : (
                  <Meldungsbox ton="ok">{aktuelleMeldungen ? "Alles in Ordnung. Sie können absenden." : "Bisher alles in Ordnung …"}</Meldungsbox>
                )}
              </div>
            )}
            <ul className="space-y-2">
              {eintraege.map((e, i) => {
                if (istLeer(e)) return null;
                const a = auswertungen?.[i];
                const st = statusVon(a, e);
                return (
                  <li key={e.uid} className={cn("rounded-2xl border p-3", i === nrVorschau && "border-primary/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPunkt status={st} />
                      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setVorschauNr(i)}>
                        {i + 1}. {kurzText(e, ansicht.variablen) || "Ohne Text"}
                      </button>
                      <span className="text-xs text-muted-foreground">{e.auflage}×</span>
                      <Button type="button" size="xs" variant="ghost" onClick={() => { setVorschauNr(i); }} aria-label={`Vorschau für Eintrag ${i + 1}`}>Vorschau</Button>
                      <Button type="button" size="xs" variant="secondary" onClick={() => springeZuFeld(e.uid, a?.fehler.find((m) => m.variable)?.variable ?? ansicht.variablen[0].schluessel)}>Bearbeiten</Button>
                    </div>
                    {a && (a.fehler.length > 0 || a.hinweise.length > 0) && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {a.fehler.map((m, k) => (
                          <li key={`f${k}`} className="flex flex-wrap items-center gap-2 text-destructive">
                            <span>{meldungsText(m)}</span>
                            {m.variable && <Button type="button" size="xs" variant="outline" onClick={() => springeZuFeld(e.uid, m.variable!)}>Zum Feld</Button>}
                          </li>
                        ))}
                        {a.hinweise.map((m, k) => (
                          <li key={`h${k}`} className="text-yellow-800 dark:text-yellow-300">{meldungsText(m)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSchritt("daten")}>Zurück zu den Daten</Button>
              <Button size="lg" onClick={() => { setSchritt("absenden"); window.scrollTo({ top: 0 }); }} disabled={hatFehler || gefuellt.length === 0} data-umami-event="Personalisierung: Zum Absenden">Weiter: Absenden</Button>
            </div>
          </section>
          <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Vorschau blättern">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Vorschau</h2>
              <div className="flex items-center gap-1" role="group" aria-label="Eintrag wechseln" data-tour="pers-pager">
                <Button type="button" size="sm" variant="secondary" disabled={nrVorschau <= 0} onClick={() => setVorschauNr(nrVorschau - 1)} aria-label="Voriger Eintrag">←</Button>
                <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">{nrVorschau + 1} von {eintraege.length}</span>
                <Button type="button" size="sm" variant="secondary" disabled={nrVorschau >= eintraege.length - 1} onClick={() => setVorschauNr(nrVorschau + 1)} aria-label="Nächster Eintrag">→</Button>
              </div>
            </div>
            <Vorschau z={z} datensatz={{ werte: eintraege[nrVorschau].werte, auflage: eintraege[nrVorschau].auflage }} hatRueckseite={ansicht.hatRueckseite} verzoegerung={400} />
          </aside>
        </div>
      )}

      {schritt === "absenden" && (
        <div className="space-y-4">
          <Absenden ansicht={ansicht} z={z} eintraege={gefuellt} onEintraege={(neu) => setEintraege((alle) => alle.map((e) => neu.find((n) => n.uid === e.uid) ?? e))} gesperrt={hatFehler || gefuellt.length === 0} sichereJetzt={async () => {
            // leere Zeilen nicht mitschicken
            const nurGefuellt = eintraegeRef.current.filter((e) => !istLeer(e));
            return sichereMit(nurGefuellt);
          }} kundeId={kundeId} onFertig={(r) => { z.setzeEntwurf(null); schreibeSpeicher(z.ref, null); setFertig(r); }} />
          <div className="mx-auto max-w-3xl"><Button variant="secondary" onClick={() => setSchritt("pruefen")}>Zurück</Button></div>
        </div>
      )}

      {ansicht.akteur === "gast" && (
        <footer className="mx-auto max-w-3xl rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground" data-tour="pers-datenschutz">
          <strong className="text-foreground">Datenschutz in Kürze:</strong> Ihre Eingaben werden zwischengespeichert, damit Sie später weitermachen können (in diesem Browser), und spätestens {ansicht.entwurfStunden} Stunden nach Ihrer letzten Änderung automatisch gelöscht. Mit dem Absenden gehen die Daten als Druckauftrag an die Druckerei. Alle Informationen in der <Link className="underline" href="/datenschutz" target="_blank">Datenschutzerklärung</Link>.
          {eintraege.some((e) => !istLeer(e)) && z.entwurf && (
            <> <ConfirmAction triggerLabel="Meine Eingaben jetzt löschen" title="Alle Eingaben löschen?" description="Ihre Einträge werden sofort vom Server gelöscht. Das lässt sich nicht rückgängig machen." confirmLabel="Löschen" onConfirm={allesLoeschen} /></>
          )}
        </footer>
      )}
    </main>
  );

  // Der Entwurf auf dem Server enthält nur ausgefüllte Einträge, damit „Absenden“ genau das sendet, was die Kundin sieht.
  async function sichereMit(liste: Eintrag[]) {
    try {
      await speichern.current;
      return await sichere(liste);
    } catch {
      return null;
    }
  }
}
