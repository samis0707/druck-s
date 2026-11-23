"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { StatusPunkt } from "@/components/personalisierung/kunde/Einzeln";
import type { Ansicht, Z } from "@/components/personalisierung/kunde/z";
import { Meldungsbox } from "@/components/personalisierung/staff/bausteine";
import { ApiFehler, fehlerText } from "@/lib/personalisierung/ui/api";
import { ausDatensaetzen, istLeer, leseAuflage, statusVon, uebernehmeTabelle, type Auswertung, type Eintrag } from "@/lib/personalisierung/ui/kunde";
import type { Datensatz } from "@/lib/personalisierung/schema";
import { cn } from "@/lib/utils";

interface TabellenAntwort {
  format: string;
  kopf: string[];
  zeilen: number;
  zuordnung: { variablen: Record<string, number | null>; auflage: number | null; unbenutzt: number[]; fehlend: { schluessel: string; bezeichnung: string; pflicht: boolean }[] };
  datensaetze: Datensatz[];
  warnungen: string[];
}

const KEINE = "__keine__";
const SEITE = 100;

/** Reiter „Tabelle hochladen“: Beispiel laden, Datei ablegen, Spalten bestätigen, in der Tabelle korrigieren. */
export function Tabelle({ ansicht, z, eintraege, auswertungen, onUebernehmen, onEintrag, onLoeschen, onNeu, zeigeFehler }: {
  ansicht: Ansicht;
  z: Z;
  eintraege: Eintrag[];
  auswertungen: (Auswertung | undefined)[] | null;
  onUebernehmen: (neu: Eintrag[]) => void;
  onEintrag: (e: Eintrag) => void;
  onLoeschen: (uid: string) => void;
  onNeu: () => void;
  zeigeFehler: boolean;
}) {
  const eingabe = useRef<HTMLInputElement>(null);
  const [datei, setDatei] = useState<File | null>(null);
  const [antwort, setAntwort] = useState<TabellenAntwort | null>(null);
  const [zuordnung, setZuordnung] = useState<TabellenAntwort["zuordnung"] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [ueber, setUeber] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [modus, setModus] = useState<"ersetzen" | "anhaengen">("ersetzen");
  const [seite, setSeite] = useState(0);
  const hatDaten = eintraege.some((e) => !istLeer(e));
  const effektivModus = hatDaten ? modus : "ersetzen";

  async function senden(d: File, manuell?: TabellenAntwort["zuordnung"]) {
    setLaedt(true);
    setFehler(null);
    try {
      const form = new FormData();
      form.append("datei", d);
      if (manuell) form.append("zuordnung", JSON.stringify({ variablen: manuell.variablen, auflage: manuell.auflage }));
      const res = await fetch(z.url("/tabelle"), { method: "POST", body: form, headers: z.kopf() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiFehler((json as { error?: string }).error ?? "Die Tabelle konnte nicht gelesen werden.", res.status, "tabelle");
      setAntwort(json as TabellenAntwort);
      setZuordnung((json as TabellenAntwort).zuordnung);
    } catch (e) {
      setAntwort(null);
      setFehler(fehlerText(e));
    } finally {
      setLaedt(false);
    }
  }
  function waehleDatei(d: File | undefined) {
    if (!d) return;
    if (!/\.(xlsx|csv|txt|tsv)$/i.test(d.name)) return setFehler("Bitte eine Excel-Datei (.xlsx) oder eine CSV-Datei wählen.");
    setDatei(d);
    void senden(d);
  }
  function uebernehmen() {
    if (!antwort) return;
    const neu = ausDatensaetzen(antwort.datensaetze, ansicht.variablen);
    onUebernehmen(uebernehmeTabelle(eintraege, neu, effektivModus));
    toast.add({ description: `${neu.length} ${neu.length === 1 ? "Eintrag" : "Einträge"} übernommen. Sie können sie unten noch korrigieren.`, type: "success" });
    setAntwort(null);
    setDatei(null);
    setSeite(0);
  }
  const mapGeaendert = antwort && zuordnung && JSON.stringify(zuordnung.variablen) !== JSON.stringify(antwort.zuordnung.variablen) || (antwort && zuordnung && zuordnung.auflage !== antwort.zuordnung.auflage);
  const beispielLink = (f: "xlsx" | "csv") => z.url("/beispiel", { format: f });

  const seiten = Math.max(1, Math.ceil(eintraege.length / SEITE));
  const sichtbar = useMemo(() => eintraege.slice(seite * SEITE, (seite + 1) * SEITE), [eintraege, seite]);

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Tabelle hochladen" data-tour="pers-tabelle-upload">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Laden Sie die Beispieltabelle herunter. Sie enthält schon die richtigen Spaltenköpfe.</li>
          <li>Tragen Sie Ihre Daten ein und speichern Sie die Datei.</li>
          <li>Ziehen Sie die Datei unten hinein. Wir ordnen die Spalten automatisch zu; Sie bestätigen nur.</li>
        </ol>
        <div className="flex flex-wrap gap-2" data-tour="pers-beispiel-tabelle">
          <Button variant="secondary" render={<a href={beispielLink("xlsx")} download />}>Beispieltabelle (Excel) laden</Button>
          <Button variant="secondary" render={<a href={beispielLink("csv")} download />}>Beispieltabelle (CSV) laden</Button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setUeber(true); }}
          onDragLeave={() => setUeber(false)}
          onDrop={(e) => { e.preventDefault(); setUeber(false); waehleDatei(e.dataTransfer.files?.[0]); }}
          className={cn("flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center", ueber ? "border-primary bg-primary/10" : "border-border bg-muted/30")}
        >
          <p className="text-sm">{laedt ? "Tabelle wird gelesen …" : "Excel- oder CSV-Datei hierher ziehen"}<span className="text-muted-foreground"> oder</span></p>
          <input ref={eingabe} type="file" accept=".xlsx,.csv,.tsv,.txt" hidden aria-label="Tabelle auswählen" onChange={(e) => { waehleDatei(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" onClick={() => eingabe.current?.click()} disabled={laedt}>Datei auswählen</Button>
          <p className="text-xs text-muted-foreground">Bis {ansicht.grenzen.maxDatensaetze} Zeilen. Die Datei wird nur ausgewertet, nicht gespeichert.</p>
        </div>
        {fehler && <Meldungsbox ton="fehler">{fehler}</Meldungsbox>}
      </section>

      {antwort && zuordnung && (
        <section className="space-y-3 rounded-2xl border p-4" aria-label="Spalten zuordnen" data-tour="pers-zuordnung">
          <h2 className="text-base font-semibold">Stimmen die Spalten? ({antwort.zeilen} {antwort.zeilen === 1 ? "Zeile" : "Zeilen"} in „{datei?.name}“)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {ansicht.variablen.map((v) => (
              <div key={v.schluessel} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                <span className="text-sm">{v.bezeichnung}{v.pflicht ? " *" : ""}</span>
                <Select
                  value={zuordnung.variablen[v.schluessel] === null || zuordnung.variablen[v.schluessel] === undefined ? KEINE : String(zuordnung.variablen[v.schluessel])}
                  onValueChange={(w) => setZuordnung({ ...zuordnung, variablen: { ...zuordnung.variablen, [v.schluessel]: w === KEINE ? null : Number(w) } })}
                  options={[{ value: KEINE, label: "— keine Spalte —" }, ...antwort.kopf.map((k, i) => ({ value: String(i), label: k || `Spalte ${i + 1}` }))]}
                />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr] items-center gap-2">
              <span className="text-sm">Auflage (optional)</span>
              <Select
                value={zuordnung.auflage === null ? KEINE : String(zuordnung.auflage)}
                onValueChange={(w) => setZuordnung({ ...zuordnung, auflage: w === KEINE ? null : Number(w) })}
                options={[{ value: KEINE, label: "— keine Spalte —" }, ...antwort.kopf.map((k, i) => ({ value: String(i), label: k || `Spalte ${i + 1}` }))]}
              />
            </div>
          </div>
          {Object.entries(zuordnung.variablen).some(([k, i]) => i === null && ansicht.variablen.find((v) => v.schluessel === k)?.pflicht) && (
            <Meldungsbox ton="hinweis">Für eine Pflichtangabe ist noch keine Spalte gewählt. Sie können das nach der Übernahme noch ergänzen.</Meldungsbox>
          )}
          {antwort.warnungen.length > 0 && <Meldungsbox ton="hinweis">{antwort.warnungen.slice(0, 3).join(" ")}{antwort.warnungen.length > 3 ? ` … (${antwort.warnungen.length} Hinweise)` : ""}</Meldungsbox>}
          {hatDaten && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Es gibt schon Einträge. Was soll passieren?</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="tabmodus" checked={modus === "ersetzen"} onChange={() => setModus("ersetzen")} /> Bisherige Einträge ersetzen</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="tabmodus" checked={modus === "anhaengen"} onChange={() => setModus("anhaengen")} /> Neue Zeilen anhängen</label>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-2">
            {mapGeaendert ? (
              <Button type="button" onClick={() => datei && senden(datei, zuordnung)} disabled={laedt}>Zuordnung anwenden</Button>
            ) : (
              <Button type="button" onClick={uebernehmen} data-umami-event="Personalisierung: Tabelle übernommen">Zuordnung bestätigen und übernehmen</Button>
            )}
            <Button type="button" variant="secondary" onClick={() => { setAntwort(null); setDatei(null); }}>Abbrechen</Button>
          </div>
        </section>
      )}

      {eintraege.length > 0 && (
        <section className="space-y-2" aria-label="Tabelle bearbeiten" data-tour="pers-tabelle">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Ihre Einträge ({eintraege.length})</h2>
            <Button type="button" size="sm" variant="secondary" onClick={onNeu}>+ Zeile hinzufügen</Button>
          </div>
          <div className="overflow-auto rounded-2xl border">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="w-10 px-2 py-2" scope="col"><span className="sr-only">Status</span></th>
                  <th className="w-10 px-2 py-2" scope="col">Nr.</th>
                  {ansicht.variablen.map((v) => <th key={v.schluessel} className="px-2 py-2 font-medium" scope="col">{v.bezeichnung}{v.pflicht ? " *" : ""}</th>)}
                  <th className="w-24 px-2 py-2 font-medium" scope="col">Auflage</th>
                  <th className="w-10 px-2 py-2" scope="col"><span className="sr-only">Löschen</span></th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((e, k) => {
                  const i = seite * SEITE + k;
                  const a = auswertungen?.[i];
                  const sichtbarFehler = zeigeFehler || !istLeer(e);
                  return (
                    <tr key={e.uid} className="border-t align-top">
                      <td className="px-2 py-1.5"><StatusPunkt status={statusVon(a, e)} /></td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                      {ansicht.variablen.map((v) => {
                        const f = sichtbarFehler ? a?.nachVariable[v.schluessel] : undefined;
                        return (
                          <td key={v.schluessel} className="px-1 py-1">
                            <Input
                              aria-label={`${v.bezeichnung}, Zeile ${i + 1}`}
                              aria-invalid={!!f?.length}
                              title={f?.join(" ")}
                              value={e.werte[v.schluessel] ?? ""}
                              onChange={(ev) => onEintrag({ ...e, werte: { ...e.werte, [v.schluessel]: ev.target.value } })}
                              className="min-w-28"
                            />
                            {f?.slice(0, 1).map((t, n) => <p key={n} className="mt-0.5 max-w-56 text-xs text-destructive">{t.replace(/^Datensatz \d+,\s*/, "")}</p>)}
                          </td>
                        );
                      })}
                      <td className="px-1 py-1"><Input aria-label={`Auflage, Zeile ${i + 1}`} inputMode="numeric" value={String(e.auflage)} onChange={(ev) => { const n = leseAuflage(ev.target.value); if (n !== null) onEintrag({ ...e, auflage: n }); }} /></td>
                      <td className="px-1 py-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Zeile ${i + 1} löschen`} onClick={() => onLoeschen(e.uid)}>✕</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {seiten > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm" role="navigation" aria-label="Seiten der Tabelle">
              <Button type="button" size="sm" variant="secondary" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>Zurück</Button>
              <span>Zeilen {seite * SEITE + 1} bis {Math.min(eintraege.length, (seite + 1) * SEITE)} von {eintraege.length}</span>
              <Button type="button" size="sm" variant="secondary" disabled={seite >= seiten - 1} onClick={() => setSeite(seite + 1)}>Weiter</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
