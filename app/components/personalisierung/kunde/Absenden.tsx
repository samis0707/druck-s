"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ansicht, Z } from "@/components/personalisierung/kunde/z";
import { Meldungsbox } from "@/components/personalisierung/staff/bausteine";
import { api, fehlerText } from "@/lib/personalisierung/ui/api";
import { gesamtAuflage, kurzText, leseAuflage, setzeAuflageFuerAlle, type Eintrag } from "@/lib/personalisierung/ui/kunde";

interface Ergebnis {
  anfrageId: string;
  nummer: string | null;
  kunde?: boolean;
}

/** Letzter Schritt: Auflage, Kontakt, Anmerkung, Bestätigung per Code (Gast) bzw. direktes Absenden. */
export function Absenden({ ansicht, z, eintraege, onEintraege, gesperrt, sichereJetzt, kundeId, onFertig }: {
  ansicht: Ansicht;
  z: Z;
  eintraege: Eintrag[];
  onEintraege: (e: Eintrag[]) => void;
  /** Es gibt noch Fehler in den Einträgen */
  gesperrt: boolean;
  /** Entwurf serverseitig sichern und dessen Kennung liefern */
  sichereJetzt: () => Promise<{ id: string } | null>;
  kundeId: string | null;
  onFertig: (e: Ergebnis) => void;
}) {
  const gast = ansicht.akteur === "gast";
  const mitarbeiter = ansicht.akteur === "mitarbeiter";
  const [alle, setAlle] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firma, setFirma] = useState("");
  const [anmerkung, setAnmerkung] = useState("");
  const [phase, setPhase] = useState<"formular" | "code">("formular");
  const [anfrageId, setAnfrageId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function senden() {
    setFehler(null);
    setInfo(null);
    if (gesperrt) return setFehler("Bitte beheben Sie zuerst die Fehler in den Einträgen (Schritt „Prüfen“).");
    if (gast) {
      if (!name.trim()) return setFehler("Bitte geben Sie Ihren Namen an.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setFehler("Bitte geben Sie eine gültige E-Mail-Adresse an.");
    }
    if (mitarbeiter && !kundeId) return setFehler("Bitte wählen Sie oben zuerst den Kunden aus, für den Sie ausfüllen.");
    setBusy(true);
    try {
      const entwurf = await sichereJetzt();
      if (!entwurf) throw new Error("Ihre Einträge konnten nicht zwischengespeichert werden. Bitte versuchen Sie es noch einmal.");
      const body = gast ? { entwurfId: entwurf.id, kontakt: { name, email, organisation: firma || null }, anmerkung } : { entwurfId: entwurf.id, anmerkung, ...(mitarbeiter ? { fuerKundeId: kundeId } : {}) };
      const r = await z.post<{ modus: "code" | "direkt"; anfrageId: string; sentTo?: string; nummer?: string | null }>("/absenden", body);
      if (r.modus === "code") {
        setAnfrageId(r.anfrageId);
        setSentTo(r.sentTo ?? "");
        setPhase("code");
        setInfo(`Wir haben einen Code an ${r.sentTo} geschickt.`);
      } else {
        onFertig({ anfrageId: r.anfrageId, nummer: r.nummer ?? null });
      }
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  async function bestaetigen() {
    setFehler(null);
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) return setFehler("Bitte geben Sie die sechs Ziffern aus der E-Mail ein.");
    setBusy(true);
    try {
      const r = await api<{ anfrageId: string; nummer: string | null; kunde: boolean }>(z.url("/bestaetigen"), { method: "POST", json: { entwurfId: z.entwurf?.id, anfrageId, code: code.replace(/\s+/g, "") }, headers: z.kopf() });
      onFertig({ anfrageId: r.anfrageId, nummer: r.nummer, kunde: r.kunde });
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  const summe = gesamtAuflage(eintraege);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="space-y-3 rounded-2xl border p-4" aria-label="Auflage" data-tour="pers-auflage">
        <h2 className="text-base font-semibold">Auflage</h2>
        <p className="text-sm text-muted-foreground">Wie oft soll jeder Eintrag gedruckt werden? Insgesamt {summe.toLocaleString("de-DE")} Stück bei {eintraege.length} {eintraege.length === 1 ? "Eintrag" : "Einträgen"}.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="auflage-alle">Auflage für alle Einträge</Label>
            <Input id="auflage-alle" inputMode="numeric" className="w-32" value={alle} placeholder="z. B. 100" onChange={(e) => setAlle(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" onClick={() => { const n = leseAuflage(alle); if (n === null) return setFehler("Bitte eine ganze Zahl ab 1 eingeben."); setFehler(null); onEintraege(setzeAuflageFuerAlle(eintraege, n)); }}>Für alle übernehmen</Button>
        </div>
        <ul className="max-h-64 divide-y overflow-auto rounded-xl border">
          {eintraege.map((e, i) => (
            <li key={e.uid} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="w-8 tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{kurzText(e, ansicht.variablen) || "—"}</span>
              <label className="sr-only" htmlFor={`auf-${e.uid}`}>Auflage Eintrag {i + 1}</label>
              <Input id={`auf-${e.uid}`} inputMode="numeric" className="w-24" value={String(e.auflage)} onChange={(ev) => { const n = leseAuflage(ev.target.value); if (n !== null) onEintraege(eintraege.map((x) => (x.uid === e.uid ? { ...x, auflage: n } : x))); }} />
            </li>
          ))}
        </ul>
      </section>

      {phase === "formular" ? (
        <section className="space-y-4 rounded-2xl border p-4" aria-label={gast ? "Ihre Kontaktdaten" : "Absenden"} data-tour="pers-kontakt">
          {gast ? (
            <>
              <h2 className="text-base font-semibold">Ihre Kontaktdaten</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="k-name">Name <span aria-hidden className="text-destructive">*</span></Label>
                  <Input id="k-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="k-mail">E-Mail <span aria-hidden className="text-destructive">*</span></Label>
                  <Input id="k-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="k-firma">Firma oder Verein <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="k-firma" autoComplete="organization" value={firma} onChange={(e) => setFirma(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <h2 className="text-base font-semibold">{mitarbeiter ? "Im Namen des Kunden absenden" : "Absenden"}</h2>
          )}
          <div className="space-y-1">
            <Label htmlFor="k-anm">Anmerkung <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="k-anm" maxLength={2000} value={anmerkung} onChange={(e) => setAnmerkung(e.target.value)} placeholder="Termin, Lieferung oder Abholung, Besonderheiten …" />
          </div>
          {gast && (
            <p className="text-sm text-muted-foreground">
              Wir schicken Ihnen einen Code an diese E-Mail-Adresse. Erst wenn Sie ihn eingeben, geht der Auftrag bei uns ein. Ihre Daten verwenden wir nur für diesen Druckauftrag, siehe <Link className="underline" href="/datenschutz" target="_blank">Datenschutzerklärung</Link>.
            </p>
          )}
          {gesperrt && <Meldungsbox ton="fehler">Einige Einträge haben noch Fehler. Gehen Sie zurück zu „Prüfen“ und korrigieren Sie sie.</Meldungsbox>}
          {fehler && <Meldungsbox ton="fehler">{fehler}</Meldungsbox>}
          <Button type="button" size="lg" onClick={senden} disabled={busy || gesperrt} data-umami-event="Personalisierung: Absenden">
            {busy ? "Wird gesendet …" : gast ? "Weiter zur Bestätigung" : mitarbeiter ? "Im Namen des Kunden absenden" : "Jetzt verbindlich absenden"}
          </Button>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border p-4" aria-label="Bestätigung" data-tour="pers-code">
          <h2 className="text-base font-semibold">Fast geschafft: Code eingeben</h2>
          {info && <p className="text-sm" role="status">{info} Der Code ist wenige Minuten gültig. Schauen Sie bitte auch im Spam-Ordner nach.</p>}
          <div className="space-y-1">
            <Label htmlFor="code">Sechsstelliger Code</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} className="max-w-[12rem] text-lg tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && bestaetigen()} autoFocus />
          </div>
          {fehler && <Meldungsbox ton="fehler">{fehler}</Meldungsbox>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="lg" onClick={bestaetigen} disabled={busy} data-umami-event="Personalisierung: Bestätigt">{busy ? "Wird geprüft …" : "Bestätigen und absenden"}</Button>
            <Button type="button" variant="secondary" onClick={senden} disabled={busy}>Code erneut senden</Button>
            <Button type="button" variant="ghost" onClick={() => { setPhase("formular"); setCode(""); setFehler(null); }}>E-Mail-Adresse ändern</Button>
          </div>
          <p className="text-xs text-muted-foreground">Gesendet an {sentTo}. Ihre Einträge bleiben solange gespeichert.</p>
        </section>
      )}
      {phase === "formular" && info && <p className="text-sm">{info}</p>}
    </div>
  );
}
