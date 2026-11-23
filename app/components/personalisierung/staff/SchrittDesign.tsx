"use client";

/* Daten laden bzw. Zustand abgleichen: setState in Effekten ist hier gewollt. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Meldungsbox, Zeile, ZahlFeld } from "@/components/personalisierung/staff/bausteine";
import { PdfSeite, usePdfDokument } from "@/components/personalisierung/PdfSeite";
import type { SchrittProps } from "@/components/personalisierung/staff/Assistent";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { api, STAFF_API } from "@/lib/personalisierung/ui/api";
import { designBytes } from "@/lib/personalisierung/ui/browser-engine";
import { erkenneFormat, formatHinweis, type ErkanntesFormat, type SeitenMass } from "@/lib/personalisierung/ui/format";
import { cn } from "@/lib/utils";

interface UploadAntwort {
  datei: { id: string; name: string; scanStatus?: string };
  pdf?: { seiten: number; seitenMasse: SeitenMass[] };
}

const MM = 25.4 / 72;

function Seitenvorschau({ dokument, nr, vorne, hinten, onVorne, onHinten }: { dokument: NonNullable<ReturnType<typeof usePdfDokument>["dokument"]>; nr: number; vorne: boolean; hinten: boolean; onVorne: () => void; onHinten: () => void }) {
  return (
    <li className={cn("flex w-36 flex-col items-center gap-2 rounded-2xl border p-2", vorne || hinten ? "border-primary bg-primary/5" : "border-border")}>
      <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
        <PdfSeite dokument={dokument} seite={nr} breitePx={120} className="max-h-36 w-auto shadow-sm" label={`PDF-Seite ${nr}`} />
      </div>
      <p className="text-xs text-muted-foreground">Seite {nr}</p>
      <div className="flex w-full flex-col gap-1">
        <button type="button" aria-pressed={vorne} onClick={onVorne} className={cn("rounded-lg border px-2 py-1 text-xs", vorne ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-ring")}>
          Vorderseite
        </button>
        <button type="button" aria-pressed={hinten} onClick={onHinten} className={cn("rounded-lg border px-2 py-1 text-xs", hinten ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-ring")}>
          Rückseite
        </button>
      </div>
    </li>
  );
}

/** Schritt 1: Name, Design-PDF per Drag & Drop, Endformat und Beschnitt, Vorder- und Rückseite. */
export function SchrittDesign({ vorlage, aendere, istNeu }: SchrittProps & { istNeu: boolean }) {
  const meldeFehler = useStaffFehler();
  const eingabe = useRef<HTMLInputElement>(null);
  const [ueber, setUeber] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [erkannt, setErkannt] = useState<ErkanntesFormat | null>(null);
  const [masse, setMasse] = useState<SeitenMass[] | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [scan, setScan] = useState<string | null>(null);
  const dateiId = vorlage.design.dateiId;

  // Bestehendes Design für die Seitenvorschau laden
  useEffect(() => {
    if (!dateiId) {
      setBytes(null);
      return;
    }
    let aktiv = true;
    designBytes(dateiId).then((b) => aktiv && setBytes(b)).catch(() => aktiv && toast.add({ description: "Das Design konnte nicht geladen werden.", type: "error" }));
    return () => {
      aktiv = false;
    };
  }, [dateiId]);
  const { dokument, fehler } = usePdfDokument(bytes);
  // Seitengrößen aus pdf.js, falls das PDF nicht gerade hochgeladen wurde
  useEffect(() => {
    if (!dokument || masse) return;
    let aktiv = true;
    (async () => {
      const m: SeitenMass[] = [];
      for (let i = 1; i <= Math.min(dokument.numPages, 50); i++) {
        const p = await dokument.getPage(i);
        const [x0, y0, x1, y1] = p.view;
        m.push({ breiteMm: Math.round((x1 - x0) * MM * 100) / 100, hoeheMm: Math.round((y1 - y0) * MM * 100) / 100 });
      }
      if (aktiv) setMasse(m);
    })().catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, [dokument, masse]);

  const hochladen = useCallback(
    async (datei: File) => {
      if (!/\.pdf$/i.test(datei.name) && datei.type !== "application/pdf") return toast.add({ description: "Bitte eine PDF-Datei wählen.", type: "error" });
      setLaedt(true);
      try {
        const form = new FormData();
        form.append("datei", datei);
        form.append("art", "design");
        const r = await api<UploadAntwort>(`${STAFF_API}/dateien`, { method: "POST", body: form });
        const m = r.pdf?.seitenMasse ?? [];
        const e = m[0] ? erkenneFormat(m[0]) : null;
        setMasse(m.length ? m : null);
        setErkannt(e);
        setScan(r.datei.scanStatus ?? null);
        aendere((v) => ({
          ...v,
          name: v.name.trim() ? v.name : datei.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120),
          design: { dateiId: r.datei.id, vorne: 1, hinten: m.length > 1 ? 2 : null, mitBeschnitt: e?.mitBeschnitt ?? false },
          ...(e ? { endformat: e.endformat, beschnitt: e.beschnitt } : {}),
          // Felder bleiben, wenn nur das Design ersetzt wird
        }));
        toast.add({ description: e ? "Design geprüft. Format erkannt." : "Design hochgeladen.", type: "success" });
      } catch (err) {
        meldeFehler(err, "Das PDF konnte nicht hochgeladen werden.");
      } finally {
        setLaedt(false);
      }
    },
    [aendere, meldeFehler],
  );

  const hinweis = useMemo(() => (masse?.[vorlage.design.vorne - 1] ? formatHinweis(masse[vorlage.design.vorne - 1], vorlage.endformat, vorlage.beschnitt, vorlage.design.mitBeschnitt) : ""), [masse, vorlage.design, vorlage.endformat, vorlage.beschnitt]);
  const seiten = dokument?.numPages ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="space-y-4" aria-label="Name und Beschreibung">
        <Zeile label="Name der Vorlage" htmlFor="pers-name" hilfe="So heißt die Vorlage für Sie und Ihre Kunden, z. B. „Visitenkarte Außendienst“.">
          <Input id="pers-name" value={vorlage.name} maxLength={120} onChange={(e) => aendere((v) => ({ ...v, name: e.target.value }), "name")} data-tour="pers-name" autoFocus={istNeu} />
        </Zeile>
        <Zeile label="Kurze Beschreibung (optional)" htmlFor="pers-beschreibung" hilfe="Kunden sehen den Text über der Eingabe.">
          <Textarea id="pers-beschreibung" value={vorlage.beschreibung} maxLength={1000} onChange={(e) => aendere((v) => ({ ...v, beschreibung: e.target.value }), "beschreibung")} />
        </Zeile>
      </section>

      <section className="space-y-4" aria-label="Design-PDF">
        <div
          data-tour="pers-upload"
          onDragOver={(e) => {
            e.preventDefault();
            setUeber(true);
          }}
          onDragLeave={() => setUeber(false)}
          onDrop={(e) => {
            e.preventDefault();
            setUeber(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void hochladen(f);
          }}
          className={cn("flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors", ueber ? "border-primary bg-primary/10" : "border-border bg-muted/30")}
        >
          <HugeiconsIcon icon={CloudUploadIcon} size={32} aria-hidden />
          <p className="text-sm">
            {dateiId ? "Anderes Design-PDF hierher ziehen, um es zu ersetzen" : "Design-PDF hierher ziehen"}
            <span className="text-muted-foreground"> oder</span>
          </p>
          <input ref={eingabe} type="file" accept="application/pdf,.pdf" hidden aria-label="Design-PDF auswählen" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void hochladen(f);
          }} />
          <Button type="button" variant={dateiId ? "secondary" : "default"} onClick={() => eingabe.current?.click()} disabled={laedt}>
            {laedt ? "Wird hochgeladen und geprüft …" : "PDF auswählen"}
          </Button>
          <p className="text-xs text-muted-foreground">Das PDF ist die Grundlage für alle Kunden, die Felder legen Sie im nächsten Schritt darauf. Mehrseitig möglich (Vorder- und Rückseite).</p>
        </div>
        {scan === "PENDING" && <Meldungsbox ton="hinweis">Die Datei wird noch auf Viren geprüft (meist wenige Minuten). Sie können schon weiterarbeiten; veröffentlichen lässt sich die Vorlage danach.</Meldungsbox>}
        {fehler && <Meldungsbox ton="fehler">{fehler}</Meldungsbox>}
      </section>

      {dateiId && (
        <>
          <section className="space-y-3 lg:col-span-2" aria-label="Format">
            <h2 className="text-base font-semibold">Endformat und Beschnitt</h2>
            {erkannt && <Meldungsbox ton={erkannt.sicher ? "ok" : "hinweis"}>{erkannt.text}</Meldungsbox>}
            <div className="grid gap-3 sm:grid-cols-3" data-tour="pers-format">
              <ZahlFeld label="Endformat Breite" einheit="mm" wert={vorlage.endformat.breite} min={5} max={2000} onChange={(n) => aendere((v) => ({ ...v, endformat: { ...v.endformat, breite: n } }), "format")} />
              <ZahlFeld label="Endformat Höhe" einheit="mm" wert={vorlage.endformat.hoehe} min={5} max={2000} onChange={(n) => aendere((v) => ({ ...v, endformat: { ...v.endformat, hoehe: n } }), "format")} />
              <ZahlFeld label="Beschnitt rundum" einheit="mm" wert={vorlage.beschnitt} min={0} max={20} onChange={(n) => aendere((v) => ({ ...v, beschnitt: n }), "beschnitt")} hilfe="Üblich sind 3 mm." />
            </div>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">Wie groß sind die Seiten im PDF?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="beschnitt-modus" checked={vorlage.design.mitBeschnitt} onChange={() => aendere((v) => ({ ...v, design: { ...v.design, mitBeschnitt: true } }))} />
                Endformat plus Beschnitt rundum (Standard für Druckdaten)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="beschnitt-modus" checked={!vorlage.design.mitBeschnitt} onChange={() => aendere((v) => ({ ...v, design: { ...v.design, mitBeschnitt: false } }))} />
                Genau Endformat, ohne Beschnitt
              </label>
            </fieldset>
            {hinweis && <Meldungsbox ton="hinweis">{hinweis}</Meldungsbox>}
          </section>

          <section className="space-y-3 lg:col-span-2" aria-label="Seiten">
            <h2 className="text-base font-semibold">Vorder- und Rückseite wählen</h2>
            <p className="text-sm text-muted-foreground">Klicken Sie unter der Seite auf „Vorderseite“ oder „Rückseite“. Eine Rückseite ist optional.</p>
            {dokument && seiten > 0 ? (
              <ul className="flex flex-wrap gap-3" data-tour="pers-seiten">
                {Array.from({ length: seiten }, (_, i) => i + 1).map((nr) => (
                  <Seitenvorschau
                    key={nr}
                    dokument={dokument}
                    nr={nr}
                    vorne={vorlage.design.vorne === nr}
                    hinten={vorlage.design.hinten === nr}
                    onVorne={() => aendere((v) => ({ ...v, design: { ...v.design, vorne: nr, hinten: v.design.hinten === nr ? null : v.design.hinten } }))}
                    onHinten={() =>
                      aendere((v) => ({
                        ...v,
                        design: { ...v.design, hinten: v.design.hinten === nr ? null : nr, vorne: v.design.vorne === nr ? (nr === 1 ? Math.min(2, seiten) : 1) : v.design.vorne },
                        // Felder der Rückseite bleiben nur erhalten, wenn es eine gibt
                        felder: v.design.hinten === nr ? v.felder.map((f) => (f.seite === "hinten" ? { ...f, seite: "vorne" as const } : f)) : v.felder,
                      }))
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Seiten werden geladen …</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
