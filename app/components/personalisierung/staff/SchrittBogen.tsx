"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Haken, Meldungsbox, Zeile, ZahlFeld } from "@/components/personalisierung/staff/bausteine";
import type { SchrittProps } from "@/components/personalisierung/staff/Assistent";
import { useStaffFehler } from "@/components/personalisierung/staff/hooks";
import { api, STAFF_API } from "@/lib/personalisierung/ui/api";
import { berechneNutzen } from "@/lib/personalisierung/render/geometrie";
import { BOGENFORMATE } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

const EIGENES = "eigen";

/** Schritt 3: Ausgabeart, Bogenformat, Abstände, Überlagerung, Skizze mit Nutzenzahl. */
export function SchrittBogen({ vorlage, aendere }: SchrittProps) {
  const meldeFehler = useStaffFehler();
  const a = vorlage.ausgabe;
  const eingabe = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const voreinstellung = BOGENFORMATE.find((f) => f.breite === a.bogen.breite && f.hoehe === a.bogen.hoehe);
  const [eigen, setEigen] = useState(!voreinstellung);
  const raster = useMemo(() => berechneNutzen({ endformat: vorlage.endformat, beschnitt: vorlage.beschnitt, bogen: a.bogen, rand: a.rand, abstand: a.abstand }), [vorlage.endformat, vorlage.beschnitt, a.bogen, a.rand, a.abstand]);
  const set = (teil: Partial<typeof a>, key?: string) => aendere((v) => ({ ...v, ausgabe: { ...v.ausgabe, ...teil } }), key);
  const zelle = raster.zelle;

  async function ueberlagerungHochladen(datei: File) {
    setLaedt(true);
    try {
      const form = new FormData();
      form.append("datei", datei);
      form.append("art", "ueberlagerung");
      const r = await api<{ datei: { id: string } }>(`${STAFF_API}/dateien`, { method: "POST", body: form });
      set({ ueberlagerung: { dateiId: r.datei.id, nurVorderseite: a.ueberlagerung?.nurVorderseite ?? false } });
      toast.add({ description: "Stanz- bzw. Overlay-PDF übernommen.", type: "success" });
    } catch (e) {
      meldeFehler(e, "Das PDF konnte nicht hochgeladen werden.");
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <fieldset className="space-y-2" data-tour="pers-ausgabeart">
          <legend className="mb-1 text-base font-semibold">Wie sollen die Druckdaten aussehen?</legend>
          {(
            [
              { wert: "einzeln", titel: "Einzelseiten mit Beschnitt (Standard)", text: `Jede Karte ist eine eigene PDF-Seite (${zelle.breite} × ${zelle.hoehe} mm inkl. Beschnitt, mit Beschnitt- und Endformat-Box). Ideal, wenn die Druckerei selbst ausschießt.` },
              { wert: "ausgeschossen", titel: "Ausgeschossen auf Druckbögen", text: "Die Karten werden automatisch platziert und Rückseiten passend gespiegelt. Für Bogenformat, Abstände und Stanzkontur gibt es die Einstellungen unten." },
            ] as const
          ).map((o) => (
            <label key={o.wert} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-3", a.modus === o.wert ? "border-primary bg-primary/10" : "border-border hover:border-ring")}>
              <input type="radio" name="ausgabeart" className="mt-1" checked={a.modus === o.wert} onChange={() => set({ modus: o.wert })} />
              <span>
                <span className="block text-sm font-semibold">{o.titel}</span>
                <span className="block text-sm text-muted-foreground">{o.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {a.modus === "ausgeschossen" && (
          <>
            <section className="space-y-3" aria-label="Bogenformat">
              <h2 className="text-base font-semibold">Bogenformat</h2>
              <Zeile label="Format wählen">
                <Select
                  value={eigen ? EIGENES : voreinstellung ? voreinstellung.name : EIGENES}
                  onValueChange={(w) => {
                    if (w === EIGENES) setEigen(true);
                    else {
                      setEigen(false);
                      const f = BOGENFORMATE.find((x) => x.name === w)!;
                      set({ bogen: { breite: f.breite, hoehe: f.hoehe } });
                    }
                  }}
                  options={[...BOGENFORMATE.map((f) => ({ value: f.name, label: `${f.name}, ${f.breite} × ${f.hoehe} mm` })), { value: EIGENES, label: "Eigenes Format …" }]}
                />
              </Zeile>
              {eigen && (
                <div className="grid grid-cols-2 gap-3">
                  <ZahlFeld label="Bogenbreite" einheit="mm" wert={a.bogen.breite} min={20} max={2000} onChange={(n) => set({ bogen: { ...a.bogen, breite: n } }, "bogen")} />
                  <ZahlFeld label="Bogenhöhe" einheit="mm" wert={a.bogen.hoehe} min={20} max={2000} onChange={(n) => set({ bogen: { ...a.bogen, hoehe: n } }, "bogen")} />
                </div>
              )}
            </section>
            <section className="space-y-3" aria-label="Ränder und Abstände">
              <h2 className="text-base font-semibold">Ränder und Abstände</h2>
              <p className="text-sm text-muted-foreground">Der Rand bleibt unbedruckt (Greiferrand, Marken). Der Abstand trennt die Nutzen voneinander.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ZahlFeld label="Rand oben" einheit="mm" wert={a.rand.oben} min={0} max={200} onChange={(n) => set({ rand: { ...a.rand, oben: n } }, "rand")} />
                <ZahlFeld label="Rand unten" einheit="mm" wert={a.rand.unten} min={0} max={200} onChange={(n) => set({ rand: { ...a.rand, unten: n } }, "rand")} />
                <ZahlFeld label="Rand links" einheit="mm" wert={a.rand.links} min={0} max={200} onChange={(n) => set({ rand: { ...a.rand, links: n } }, "rand")} />
                <ZahlFeld label="Rand rechts" einheit="mm" wert={a.rand.rechts} min={0} max={200} onChange={(n) => set({ rand: { ...a.rand, rechts: n } }, "rand")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ZahlFeld label="Abstand zwischen Spalten" einheit="mm" wert={a.abstand.spalten} min={0} max={100} onChange={(n) => set({ abstand: { ...a.abstand, spalten: n } }, "abstand")} />
                <ZahlFeld label="Abstand zwischen Zeilen" einheit="mm" wert={a.abstand.zeilen} min={0} max={100} onChange={(n) => set({ abstand: { ...a.abstand, zeilen: n } }, "abstand")} />
              </div>
            </section>
            <section className="space-y-3" aria-label="Stanzkontur" data-tour="pers-ueberlagerung">
              <h2 className="text-base font-semibold">Stanz- oder Overlay-PDF (optional)</h2>
              <p className="text-sm text-muted-foreground">Ein PDF in Bogengröße mit Stanzkontur oder Schnittmarken wird über jeden Bogen gelegt.</p>
              <input ref={eingabe} type="file" accept="application/pdf,.pdf" hidden aria-label="Overlay-PDF auswählen" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void ueberlagerungHochladen(f);
              }} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" disabled={laedt} onClick={() => eingabe.current?.click()}>
                  {laedt ? "Wird hochgeladen …" : a.ueberlagerung ? "PDF ersetzen" : "PDF hochladen"}
                </Button>
                {a.ueberlagerung && (
                  <Button type="button" variant="destructive" onClick={() => set({ ueberlagerung: null })}>
                    Entfernen
                  </Button>
                )}
              </div>
              {a.ueberlagerung && <Haken label="Nur auf den Vorderseiten" checked={a.ueberlagerung.nurVorderseite} onChange={(b) => set({ ueberlagerung: { dateiId: a.ueberlagerung!.dateiId, nurVorderseite: b } })} />}
            </section>
          </>
        )}
      </div>

      <aside className="space-y-3" aria-label="Vorschau des Bogens">
        {a.modus === "ausgeschossen" ? (
          <>
            <h2 className="text-base font-semibold">Skizze des Bogens</h2>
            {raster.proBogen < 1 ? (
              <Meldungsbox ton="fehler">Der Nutzen ({zelle.breite} × {zelle.hoehe} mm inkl. Beschnitt) passt nicht auf den Bogen. Wählen Sie ein größeres Format oder kleinere Ränder.</Meldungsbox>
            ) : (
              <p className="text-lg font-semibold" aria-live="polite" data-tour="pers-nutzen">
                {raster.proBogen} Nutzen pro Bogen <span className="text-sm font-normal text-muted-foreground">({raster.spalten} Spalten × {raster.zeilen} Zeilen, Auslastung {Math.round(raster.auslastung * 100)} %)</span>
              </p>
            )}
            <SkizzeMitAbstand bogen={a.bogen} raster={raster} rand={a.rand} abstand={a.abstand} />
            <p className="text-xs text-muted-foreground">Ein Nutzen ist {zelle.breite} × {zelle.hoehe} mm groß (Endformat plus Beschnitt).</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold">Einzelseiten</h2>
            <p className="text-sm text-muted-foreground">Eine Seite je Karte, {zelle.breite} × {zelle.hoehe} mm inklusive {vorlage.beschnitt} mm Beschnitt. Vorder- und Rückseite folgen aufeinander.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function SkizzeMitAbstand({ bogen, raster, rand, abstand }: { bogen: { breite: number; hoehe: number }; raster: ReturnType<typeof berechneNutzen>; rand: { oben: number; unten: number; links: number; rechts: number }; abstand: { spalten: number; zeilen: number } }) {
  const maxB = 360;
  const s = Math.min(maxB / bogen.breite, 420 / bogen.hoehe);
  const zellen = [];
  for (let z = 0; z < raster.zeilen; z++) for (let sp = 0; sp < raster.spalten; sp++) zellen.push({ z, sp });
  return (
    <svg width={bogen.breite * s} height={bogen.hoehe * s} viewBox={`0 0 ${bogen.breite} ${bogen.hoehe}`} role="img" aria-label={`Bogen ${bogen.breite} mal ${bogen.hoehe} Millimeter mit ${raster.proBogen} Nutzen`} className="max-w-full rounded-sm border border-border bg-white shadow-sm" data-tour="pers-skizze">
      <rect x={rand.links} y={rand.oben} width={Math.max(0, bogen.breite - rand.links - rand.rechts)} height={Math.max(0, bogen.hoehe - rand.oben - rand.unten)} fill="none" stroke="#5d648e" strokeDasharray="3 2" strokeWidth={0.6} />
      {zellen.map(({ z, sp }) => (
        <rect key={`${z}-${sp}`} data-nutzen x={raster.start.x + sp * (raster.zelle.breite + abstand.spalten)} y={raster.start.y + z * (raster.zelle.hoehe + abstand.zeilen)} width={raster.zelle.breite} height={raster.zelle.hoehe} fill="rgba(100,179,45,0.22)" stroke="#38730f" strokeWidth={0.5} />
      ))}
    </svg>
  );
}
