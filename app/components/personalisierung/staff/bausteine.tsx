"use client";

/* Daten laden bzw. Zustand abgleichen: setState in Effekten ist hier gewollt. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Farbe } from "@/lib/personalisierung/schema";

/** Kleine Formular-Bausteine des Editors. */

export function Zeile({ label, hilfe, children, htmlFor }: { label: string; hilfe?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
    </div>
  );
}

/** Zahlenfeld mit deutscher Eingabe („12,5“): tippt frei, übernimmt gültige Werte sofort, formatiert beim Verlassen. */
export function ZahlFeld({
  label,
  wert,
  onChange,
  min,
  max,
  schritt = 0.1,
  einheit,
  hilfe,
  className,
  disabled,
  dataTour,
}: {
  label: string;
  wert: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  schritt?: number;
  einheit?: string;
  hilfe?: string;
  className?: string;
  disabled?: boolean;
  dataTour?: string;
}) {
  const id = useId();
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  const [text, setText] = useState(fmt(wert));
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    if (!fokus) setText(fmt(wert));
  }, [wert, fokus]);
  function uebernehmen(t: string) {
    setText(t);
    const n = Number(t.replace(",", ".").trim());
    if (t.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
  }
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>
        {label}
        {einheit ? <span className="font-normal text-muted-foreground"> ({einheit})</span> : null}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        data-tour={dataTour}
        onFocus={() => setFokus(true)}
        onBlur={() => {
          setFokus(false);
          setText(fmt(wert));
        }}
        onChange={(e) => uebernehmen(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = Math.round((wert + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? schritt * 10 : schritt)) * 100) / 100;
            if ((min === undefined || n >= min) && (max === undefined || n <= max)) {
              onChange(n);
              setText(fmt(n));
            }
          }
        }}
        aria-describedby={hilfe ? `${id}-h` : undefined}
      />
      {hilfe && (
        <p id={`${id}-h`} className="text-xs text-muted-foreground">
          {hilfe}
        </p>
      )}
    </div>
  );
}

/** Umschalter aus Schaltflächen (genau eine Option aktiv). */
export function Segment<T extends string>({ label, wert, optionen, onChange, dataTour }: { label: string; wert: T; optionen: { wert: T; text: string; titel?: string }[]; onChange: (v: T) => void; dataTour?: string }) {
  return (
    <div role="group" aria-label={label} data-tour={dataTour} className="flex flex-wrap gap-1">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          title={o.titel}
          aria-pressed={wert === o.wert}
          onClick={() => onChange(o.wert)}
          className={cn(
            "rounded-xl border px-2.5 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            wert === o.wert ? "border-primary bg-primary/10 font-semibold" : "border-border bg-card text-muted-foreground hover:border-ring",
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function Haken({ label, checked, onChange, hilfe, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hilfe?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" className="size-4" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {hilfe && <p className="pl-6 text-xs text-muted-foreground">{hilfe}</p>}
    </div>
  );
}

/** CSS-Farbe aus CMYK (Prozent) für Farbfelder; nur Anzeige, keine Farbverwaltung. */
export function cmykZuCss(c: [number, number, number, number]): string {
  const [C, M, Y, K] = c.map((v) => v / 100);
  const r = Math.round(255 * (1 - C) * (1 - K));
  const g = Math.round(255 * (1 - M) * (1 - K));
  const b = Math.round(255 * (1 - Y) * (1 - K));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Farbe aus der Palette wählen (Farbfelder mit Namen). */
export function FarbWahl({ label, wert, farben, onChange, keine }: { label: string; wert: string | null; farben: Farbe[]; onChange: (name: string | null) => void; keine?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {keine && (
        <button type="button" aria-pressed={wert === null} onClick={() => onChange(null)} className={cn("rounded-xl border px-2 py-1 text-xs", wert === null ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground")}>
          {keine}
        </button>
      )}
      {farben.map((f) => (
        <button
          key={f.name}
          type="button"
          title={`${f.name}${f.sonderfarbe ? ` (Sonderfarbe ${f.sonderfarbe})` : ""}`}
          aria-label={f.name}
          aria-pressed={wert === f.name}
          onClick={() => onChange(f.name)}
          className={cn("size-7 rounded-full border-2 transition", wert === f.name ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-ring")}
          style={{ backgroundColor: cmykZuCss(f.cmyk as [number, number, number, number]) }}
        />
      ))}
      {wert && !farben.some((f) => f.name === wert) && <span className="self-center text-xs text-destructive">„{wert}“ fehlt in der Palette</span>}
    </div>
  );
}

export function Meldungsbox({ ton, children }: { ton: "fehler" | "hinweis" | "ok"; children: ReactNode }) {
  return (
    <div
      role={ton === "fehler" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        ton === "fehler" && "border-destructive/40 bg-destructive/10 text-destructive",
        ton === "hinweis" && "border-yellow-500/40 bg-yellow-500/10",
        ton === "ok" && "border-primary/30 bg-primary/10",
      )}
    >
      {children}
    </div>
  );
}
