"use client";

/* Fetch-on-mount */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/requests/ConfirmAction";
import { PageHeader } from "@/components/layout/PageHeader";
import { Haken, Meldungsbox, Zeile, ZahlFeld, cmykZuCss } from "@/components/personalisierung/staff/bausteine";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { api, ladeBytes, STAFF_API } from "@/lib/personalisierung/ui/api";
import type { SchriftEintrag } from "@/lib/personalisierung/ui/browser-engine";
import { SCHRIFT_SCHNITTE, type SchriftSchnitt } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

const SCHNITT_NAMEN: Record<SchriftSchnitt, string> = { regular: "Normal", bold: "Fett", italic: "Kursiv", bolditalic: "Fett kursiv" };
const PROBE = "Erika Mustermann 0123456789 ÄÖÜß";

/** Schriftdatei lokal lesen: Familie und Schnitt erkennen, Vorschau mit FontFace. Alles im Browser, nichts wird gesendet. */
async function liesSchrift(datei: File): Promise<{ familie: string; schnitt: SchriftSchnitt; vorschauName: string }> {
  const bytes = new Uint8Array(await datei.arrayBuffer());
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const f = fontkit.create(bytes as unknown as Buffer) as unknown as { familyName?: string; subfamilyName?: string };
  const familie = (f.familyName ?? "").trim();
  if (!familie) throw new Error("kein Name");
  const sub = (f.subfamilyName ?? "").toLowerCase();
  const fett = /bold|black|heavy/.test(sub);
  const kursiv = /italic|oblique/.test(sub);
  const vorschauName = `vorschau-${Math.random().toString(36).slice(2)}`;
  const face = new FontFace(vorschauName, bytes.slice().buffer);
  await face.load();
  document.fonts.add(face);
  return { familie, schnitt: fett && kursiv ? "bolditalic" : fett ? "bold" : kursiv ? "italic" : "regular", vorschauName };
}

interface Entwurf {
  datei: File;
  familie: string;
  schnitt: SchriftSchnitt;
  vorschauName: string | null;
  fehler: string | null;
}

function SchriftVorschau({ s }: { s: SchriftEintrag }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    ladeBytes(`${STAFF_API}/schriften/${s.id}/datei`)
      .then(async (b) => {
        const n = `bib-${s.id}`;
        if (!document.fonts.check(`12px "${n}"`) || ![...document.fonts].some((x) => x.family === n)) {
          const face = new FontFace(n, b.slice().buffer);
          await face.load();
          document.fonts.add(face);
        }
        if (aktiv) setName(n);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, [s.id]);
  return (
    <span className="truncate text-lg" style={{ fontFamily: name ? `"${name}"` : undefined }}>
      {name ? PROBE : "Vorschau wird geladen …"}
    </span>
  );
}

function Schriften() {
  const meldeFehler = useStaffFehler();
  const [liste, setListe] = useState<SchriftEintrag[] | null>(null);
  const [entwuerfe, setEntwuerfe] = useState<Entwurf[]>([]);
  const [ueber, setUeber] = useState(false);
  const [busy, setBusy] = useState(false);
  const eingabe = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      setListe((await api<{ schriften: SchriftEintrag[] }>(`${STAFF_API}/schriften`)).schriften);
    } catch (e) {
      setListe([]);
      meldeFehler(e, "Die Schriften konnten nicht geladen werden.");
    }
  }, [meldeFehler]);
  useEffect(() => {
    void laden();
  }, [laden]);

  async function dateienWaehlen(dateien: File[]) {
    const neu: Entwurf[] = [];
    for (const datei of dateien) {
      if (!/\.(ttf|otf)$/i.test(datei.name)) {
        neu.push({ datei, familie: "", schnitt: "regular", vorschauName: null, fehler: "Nur TTF- und OTF-Dateien werden unterstützt." });
        continue;
      }
      try {
        const r = await liesSchrift(datei);
        neu.push({ datei, familie: r.familie, schnitt: r.schnitt, vorschauName: r.vorschauName, fehler: null });
      } catch {
        neu.push({ datei, familie: "", schnitt: "regular", vorschauName: null, fehler: "Die Datei ist keine lesbare Schrift." });
      }
    }
    setEntwuerfe((alt) => [...alt, ...neu]);
  }

  async function hochladen() {
    setBusy(true);
    const rest: Entwurf[] = [];
    let ok = 0;
    for (const e of entwuerfe) {
      if (e.fehler || !e.familie.trim()) {
        rest.push(e);
        continue;
      }
      try {
        const form = new FormData();
        form.append("datei", e.datei);
        form.append("familie", e.familie.trim());
        form.append("schnitt", e.schnitt);
        await api(`${STAFF_API}/schriften`, { method: "POST", body: form });
        ok++;
      } catch (err) {
        rest.push({ ...e, fehler: err instanceof Error ? err.message : "Fehler" });
      }
    }
    setEntwuerfe(rest);
    setBusy(false);
    if (ok) toast.add({ description: `${ok} ${ok === 1 ? "Schrift" : "Schriften"} hochgeladen.`, type: "success" });
    await laden();
  }

  async function loeschen(s: SchriftEintrag) {
    try {
      await api(`${STAFF_API}/schriften/${s.id}`, { method: "DELETE" });
      toast.add({ description: "Schrift gelöscht.", type: "success" });
      await laden();
    } catch (e) {
      meldeFehler(e, "Die Schrift konnte nicht gelöscht werden.");
    }
  }

  const familien = [...new Set((liste ?? []).map((s) => s.familie))];
  return (
    <section className="space-y-4" aria-label="Schriften" data-tour="pers-schriften">
      <h2 className="text-lg font-semibold">Schriften</h2>
      <p className="text-sm text-muted-foreground">Schriften, die in Vorlagen zur Auswahl stehen. Familie und Schnitt werden aus der Datei erkannt. Die Dateien bleiben intern und werden Kunden nie angezeigt oder ausgeliefert. Bitte nur Schriften hochladen, deren Lizenz das Einbetten in Druck-PDFs erlaubt.</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setUeber(true);
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUeber(false);
          void dateienWaehlen(Array.from(e.dataTransfer.files));
        }}
        className={cn("flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center", ueber ? "border-primary bg-primary/10" : "border-border bg-muted/30")}
      >
        <p className="text-sm">Schriftdateien (TTF oder OTF) hierher ziehen oder</p>
        <input ref={eingabe} type="file" multiple accept=".ttf,.otf" hidden aria-label="Schriftdateien auswählen" onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          e.target.value = "";
          void dateienWaehlen(f);
        }} />
        <Button type="button" variant="secondary" onClick={() => eingabe.current?.click()}>
          Dateien auswählen
        </Button>
      </div>
      {entwuerfe.length > 0 && (
        <div className="space-y-2 rounded-2xl border p-3">
          <h3 className="text-sm font-semibold">Zum Hochladen bereit</h3>
          <ul className="space-y-2">
            {entwuerfe.map((e, i) => (
              <li key={i} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-[1fr_12rem_9rem_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.datei.name}</p>
                  {e.fehler ? <p className="text-xs text-destructive">{e.fehler}</p> : <p className="truncate text-base" style={{ fontFamily: e.vorschauName ? `"${e.vorschauName}"` : undefined }}>{PROBE}</p>}
                </div>
                <Input aria-label={`Familie von ${e.datei.name}`} value={e.familie} disabled={!!e.fehler && !e.vorschauName} onChange={(ev) => setEntwuerfe((a) => a.map((x, j) => (j === i ? { ...x, familie: ev.target.value } : x)))} />
                <Select value={e.schnitt} onValueChange={(v) => setEntwuerfe((a) => a.map((x, j) => (j === i ? { ...x, schnitt: v as SchriftSchnitt } : x)))} options={SCHRIFT_SCHNITTE.map((s) => ({ value: s, label: SCHNITT_NAMEN[s] }))} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setEntwuerfe((a) => a.filter((_, j) => j !== i))}>
                  Entfernen
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" onClick={hochladen} disabled={busy || entwuerfe.every((e) => !!e.fehler)}>
            {busy ? "Wird hochgeladen …" : "Hochladen"}
          </Button>
        </div>
      )}
      {liste === null ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : familien.length === 0 ? (
        <Meldungsbox ton="hinweis">Noch keine eigene Schrift. Ohne eigene Schrift steht „Helvetica“ zur Verfügung.</Meldungsbox>
      ) : (
        <ul className="space-y-3">
          {familien.map((f) => (
            <li key={f}>
              <Card>
                <CardContent className="space-y-2">
                  <h3 className="text-base font-semibold">{f}</h3>
                  <ul className="divide-y">
                    {(liste ?? []).filter((s) => s.familie === f).map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                        <Badge variant="secondary">{SCHNITT_NAMEN[s.schnitt]}</Badge>
                        <SchriftVorschau s={s} />
                        <span className="ml-auto text-xs text-muted-foreground">{s.name} · {Math.round(s.groesse / 1024)} KB</span>
                        {s.scanStatus === "PENDING" && <Badge variant="outline">Virenprüfung läuft</Badge>}
                        {s.scanStatus === "INFECTED" && <Badge variant="destructive">Schadsoftware</Badge>}
                        <ConfirmAction triggerLabel="Löschen" title={`${f} (${SCHNITT_NAMEN[s.schnitt]}) löschen?`} description="Schriften, die in einer Vorlage verwendet werden, lassen sich nicht löschen." confirmLabel="Löschen" onConfirm={() => loeschen(s)} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface FarbeZeile {
  id: string;
  name: string;
  cmyk: [number, number, number, number];
  sonderfarbe: string | null;
}

function FarbForm({ start, onFertig, onAbbrechen }: { start?: FarbeZeile; onFertig: () => void; onAbbrechen?: () => void }) {
  const meldeFehler = useStaffFehler();
  const [name, setName] = useState(start?.name ?? "");
  const [cmyk, setCmyk] = useState<[number, number, number, number]>(start?.cmyk ?? [0, 0, 0, 100]);
  const [sonder, setSonder] = useState(!!start?.sonderfarbe);
  const [sonderName, setSonderName] = useState(start?.sonderfarbe ?? "");
  const [busy, setBusy] = useState(false);
  async function speichern() {
    if (!name.trim()) return toast.add({ description: "Bitte geben Sie der Farbe einen Namen.", type: "error" });
    if (sonder && !sonderName.trim()) return toast.add({ description: "Bitte nennen Sie die Sonderfarbe (z. B. „HKS 13 K“).", type: "error" });
    setBusy(true);
    try {
      const json = { name: name.trim(), cmyk, sonderfarbe: sonder ? sonderName.trim() : null };
      await api(start ? `${STAFF_API}/farben/${start.id}` : `${STAFF_API}/farben`, { method: start ? "PUT" : "POST", json });
      toast.add({ description: start ? "Farbe gespeichert." : "Farbe angelegt.", type: "success" });
      if (!start) {
        setName("");
        setCmyk([0, 0, 0, 100]);
        setSonder(false);
        setSonderName("");
      }
      onFertig();
    } catch (e) {
      meldeFehler(e, "Die Farbe konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-2xl border p-3">
      <div className="flex items-start gap-3">
        <span className="size-16 shrink-0 rounded-xl border" style={{ backgroundColor: cmykZuCss(cmyk) }} aria-hidden title="Farbfeld (Bildschirmnäherung)" />
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto]">
          <Zeile label="Name der Farbe" htmlFor={`farbe-name-${start?.id ?? "neu"}`}>
            <Input id={`farbe-name-${start?.id ?? "neu"}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="z. B. Firmenblau" />
          </Zeile>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {(["Cyan", "Magenta", "Gelb", "Schwarz"] as const).map((l, i) => (
          <ZahlFeld key={l} label={l} einheit="%" wert={cmyk[i]} min={0} max={100} schritt={1} onChange={(n) => setCmyk((c) => c.map((x, j) => (j === i ? n : x)) as [number, number, number, number])} />
        ))}
      </div>
      <Haken label="Sonderfarbe (z. B. HKS oder Pantone)" checked={sonder} onChange={setSonder} hilfe="Im PDF wird die Sonderfarbe als eigene Farbplatte geführt; die CMYK-Werte dienen als Ersatz für die Anzeige." />
      {sonder && (
        <Zeile label="Name der Sonderfarbe" htmlFor={`sonder-${start?.id ?? "neu"}`}>
          <Input id={`sonder-${start?.id ?? "neu"}`} value={sonderName} maxLength={60} onChange={(e) => setSonderName(e.target.value)} placeholder="z. B. HKS 13 K" />
        </Zeile>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={speichern} disabled={busy}>
          {start ? "Speichern" : "Farbe anlegen"}
        </Button>
        {onAbbrechen && (
          <Button type="button" variant="secondary" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}

function Farben() {
  const meldeFehler = useStaffFehler();
  const [liste, setListe] = useState<FarbeZeile[] | null>(null);
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const laden = useCallback(async () => {
    try {
      setListe((await api<{ farben: FarbeZeile[] }>(`${STAFF_API}/farben`)).farben);
    } catch (e) {
      setListe([]);
      meldeFehler(e, "Die Farben konnten nicht geladen werden.");
    }
  }, [meldeFehler]);
  useEffect(() => {
    void laden();
  }, [laden]);
  async function loeschen(f: FarbeZeile) {
    try {
      await api(`${STAFF_API}/farben/${f.id}`, { method: "DELETE" });
      toast.add({ description: "Farbe gelöscht.", type: "success" });
      await laden();
    } catch (e) {
      meldeFehler(e, "Die Farbe konnte nicht gelöscht werden.");
    }
  }
  return (
    <section className="space-y-4" aria-label="Farben" data-tour="pers-farben">
      <h2 className="text-lg font-semibold">Farben</h2>
      <p className="text-sm text-muted-foreground">Die Farbpalette für Texte und Codes. Schwarz und Weiß stehen immer zur Verfügung. Spätere Änderungen an einer Farbe wirken sich nicht auf bereits veröffentlichte Versionen aus.</p>
      <FarbForm onFertig={laden} />
      {liste === null ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : liste.length === 0 ? (
        <Meldungsbox ton="hinweis">Noch keine eigene Farbe angelegt.</Meldungsbox>
      ) : (
        <ul className="space-y-2">
          {liste.map((f) => (
            <li key={f.id}>
              {bearbeiten === f.id ? (
                <FarbForm start={f} onFertig={() => { setBearbeiten(null); void laden(); }} onAbbrechen={() => setBearbeiten(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2">
                  <span className="size-8 shrink-0 rounded-lg border" style={{ backgroundColor: cmykZuCss(f.cmyk) }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">C {f.cmyk[0]} · M {f.cmyk[1]} · Y {f.cmyk[2]} · K {f.cmyk[3]}{f.sonderfarbe ? ` · Sonderfarbe ${f.sonderfarbe}` : ""}</span>
                  </span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setBearbeiten(f.id)}>
                    Bearbeiten
                  </Button>
                  <ConfirmAction triggerLabel="Löschen" title={`„${f.name}“ löschen?`} description="Farben, die in einer Vorlage verwendet werden, lassen sich nicht löschen." confirmLabel="Löschen" onConfirm={() => loeschen(f)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Verwaltung der Schriftenbibliothek und der Farbpalette. */
export function Bibliothek() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 md:px-6">
      <PageHeader
        titel="Schriften & Farben"
        beschreibung="Die gemeinsame Bibliothek für alle Personalisierungs-Vorlagen."
        brotkrumen={[{ bezeichnung: "Backoffice", href: "/staff" }, { bezeichnung: "Personalisierung", href: "/staff/personalisierung" }, { bezeichnung: "Schriften & Farben" }]}
        aktionen={<Button variant="secondary" render={<Link href="/staff/personalisierung" />}>Zur Übersicht</Button>}
      />
      <Schriften />
      <Farben />
    </main>
  );
}
