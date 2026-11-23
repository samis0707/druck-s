"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Vorschau } from "@/components/personalisierung/kunde/Vorschau";
import type { Ansicht, Z } from "@/components/personalisierung/kunde/z";
import { cn } from "@/lib/utils";
import { kurzText, leseAuflage, statusVon, type Auswertung, type Eintrag } from "@/lib/personalisierung/ui/kunde";

export const feldId = (uid: string, key: string) => `feld-${uid}-${key}`;

const STATUS_TEXT = { ok: "Alles in Ordnung", hinweis: "Hinweis", fehler: "Bitte prüfen", leer: "Noch leer" } as const;
const STATUS_ZEICHEN = { ok: "✓", hinweis: "!", fehler: "✕", leer: "•" } as const;

export function StatusPunkt({ status }: { status: keyof typeof STATUS_TEXT }) {
  return (
    <span
      role="img"
      aria-label={STATUS_TEXT[status]}
      title={STATUS_TEXT[status]}
      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", status === "ok" && "bg-green-600/15 text-green-700 dark:text-green-400", status === "hinweis" && "bg-yellow-500/25 text-yellow-800 dark:text-yellow-300", status === "fehler" && "bg-destructive/15 text-destructive", status === "leer" && "bg-muted text-muted-foreground")}
    >
      {STATUS_ZEICHEN[status]}
    </span>
  );
}

/** Formular für einen Eintrag: je Eingabe ein Feld mit Hilfetext, Zeichenzähler und Fehlermeldung an der Stelle. */
export function Eintragsformular({ eintrag, nummer, ansicht, auswertung, zeigeFehler, onAendern, fokus }: { eintrag: Eintrag; nummer: number; ansicht: Ansicht; auswertung?: Auswertung; zeigeFehler: boolean; onAendern: (e: Eintrag) => void; fokus: { uid: string; variable: string } | null }) {
  const [beruehrt, setBeruehrt] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (fokus && fokus.uid === eintrag.uid) {
      const el = document.getElementById(feldId(eintrag.uid, fokus.variable));
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }, [fokus, eintrag.uid]);
  const setWert = (key: string, w: string) => onAendern({ ...eintrag, werte: { ...eintrag.werte, [key]: w } });
  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label={`Eintrag ${nummer}`} data-tour="pers-formular">
      {ansicht.variablen.map((v) => {
        const wert = eintrag.werte[v.schluessel] ?? "";
        const fehler = (zeigeFehler || beruehrt.has(v.schluessel)) ? (auswertung?.nachVariable[v.schluessel] ?? []) : [];
        const id = feldId(eintrag.uid, v.schluessel);
        const mehrzeilig = v.beispiel.includes("\n");
        const zu = v.maxLaenge !== null && wert.length > v.maxLaenge;
        const gemeinsam = {
          id,
          value: wert,
          autoComplete: "off",
          "aria-invalid": fehler.length > 0 || zu,
          "aria-required": v.pflicht,
          "aria-describedby": `${id}-h`,
          onBlur: () => setBeruehrt((s) => new Set(s).add(v.schluessel)),
          placeholder: v.beispiel ? `z. B. ${v.beispiel.split("\n")[0]}` : undefined,
        };
        return (
          <div key={v.schluessel} className="space-y-1">
            <Label htmlFor={id}>
              {v.bezeichnung}
              {v.pflicht ? <span aria-hidden className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
            </Label>
            {mehrzeilig ? <Textarea {...gemeinsam} rows={3} onChange={(e) => setWert(v.schluessel, e.target.value)} /> : <Input {...gemeinsam} onChange={(e) => setWert(v.schluessel, e.target.value)} />}
            <div id={`${id}-h`} className="flex flex-wrap items-start justify-between gap-x-3 text-xs">
              <span className="text-muted-foreground">{v.hilfe}</span>
              {v.maxLaenge !== null && <span className={cn("ml-auto tabular-nums", zu ? "font-semibold text-destructive" : "text-muted-foreground")}>{wert.length} / {v.maxLaenge}</span>}
            </div>
            {fehler.map((t, i) => (
              <p key={i} className="text-sm text-destructive" role="alert">
                {t.replace(/^Datensatz \d+,\s*/, "")}
              </p>
            ))}
          </div>
        );
      })}
      <div className="max-w-[12rem] space-y-1">
        <Label htmlFor={feldId(eintrag.uid, "auflage")}>Auflage (Stück)</Label>
        <Input id={feldId(eintrag.uid, "auflage")} inputMode="numeric" value={String(eintrag.auflage)} onChange={(e) => { const n = leseAuflage(e.target.value); if (n !== null) onAendern({ ...eintrag, auflage: n }); }} />
      </div>
    </form>
  );
}

/** Reiter „Einzeln eingeben“: Liste, Formular, Live-Vorschau (mobil untereinander). */
export function Einzeln({ ansicht, z, eintraege, auswertungen, auswahl, setAuswahl, onEintrag, onNeu, onDuplizieren, onLoeschen, fokus, zeigeFehler }: {
  ansicht: Ansicht;
  z: Z;
  eintraege: Eintrag[];
  auswertungen: (Auswertung | undefined)[] | null;
  auswahl: string | null;
  setAuswahl: (uid: string) => void;
  onEintrag: (e: Eintrag) => void;
  onNeu: () => void;
  onDuplizieren: (uid: string) => void;
  onLoeschen: (uid: string) => void;
  fokus: { uid: string; variable: string } | null;
  zeigeFehler: boolean;
}) {
  const nr = Math.max(0, eintraege.findIndex((e) => e.uid === auswahl));
  const aktuell = eintraege[nr];
  const [bestaetigeLoeschen, setBestaetigeLoeschen] = useState<string | null>(null);
  if (!aktuell) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-5">
        <section aria-label="Einträge" className="space-y-2" data-tour="pers-eintraege">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Ihre Einträge ({eintraege.length})</h2>
            <Button type="button" size="sm" onClick={onNeu} data-tour="pers-weitere" data-umami-event="Personalisierung: Weiteren Eintrag hinzugefügt">
              + Weitere hinzufügen
            </Button>
          </div>
          <ul className="max-h-56 space-y-1 overflow-auto rounded-2xl border p-1">
            {eintraege.map((e, i) => {
              const st = statusVon(auswertungen?.[i], e);
              const aktiv = e.uid === aktuell.uid;
              return (
                <li key={e.uid} className={cn("flex flex-wrap items-center gap-1 rounded-xl px-2 py-1", aktiv ? "bg-primary/10" : "hover:bg-muted/60")}>
                  <button type="button" onClick={() => setAuswahl(e.uid)} aria-current={aktiv ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm">
                    <StatusPunkt status={st} />
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="truncate">{kurzText(e, ansicht.variablen) || <em className="text-muted-foreground">Noch leer</em>}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.auflage}×</span>
                  </button>
                  <span className="flex gap-1">
                    <Button type="button" size="xs" variant="ghost" onClick={() => setAuswahl(e.uid)} aria-label={`Eintrag ${i + 1} bearbeiten`}>Bearbeiten</Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => onDuplizieren(e.uid)} aria-label={`Eintrag ${i + 1} duplizieren`}>Duplizieren</Button>
                    {bestaetigeLoeschen === e.uid ? (
                      <>
                        <Button type="button" size="xs" variant="destructive" onClick={() => { onLoeschen(e.uid); setBestaetigeLoeschen(null); }}>Wirklich löschen</Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => setBestaetigeLoeschen(null)}>Abbrechen</Button>
                      </>
                    ) : (
                      <Button type="button" size="xs" variant="ghost" onClick={() => (istLeerEintrag(e) ? onLoeschen(e.uid) : setBestaetigeLoeschen(e.uid))} aria-label={`Eintrag ${i + 1} löschen`}>Löschen</Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-label={`Eintrag ${nr + 1} bearbeiten`} className="space-y-3 rounded-2xl border p-4">
          <h2 className="text-base font-semibold">Eintrag {nr + 1} ausfüllen</h2>
          <Eintragsformular eintrag={aktuell} nummer={nr + 1} ansicht={ansicht} auswertung={auswertungen?.[nr]} zeigeFehler={zeigeFehler} onAendern={onEintrag} fokus={fokus} />
        </section>
      </div>
      <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Vorschau">
        <h2 className="mb-2 text-base font-semibold">Vorschau</h2>
        <Vorschau z={z} datensatz={{ werte: aktuell.werte, auflage: aktuell.auflage }} hatRueckseite={ansicht.hatRueckseite} dataTour="pers-vorschau" />
        <p className="mt-2 text-xs text-muted-foreground">Die Vorschau aktualisiert sich kurz nach Ihrer Eingabe.</p>
      </aside>
    </div>
  );
}

function istLeerEintrag(e: Eintrag) {
  return Object.values(e.werte).every((w) => w.trim() === "");
}
