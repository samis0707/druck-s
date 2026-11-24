"use client";

import { useEffect, useState } from "react";
import type { Szenario } from "@/lib/vorschau/testleitfaden";

const KEY = "vorschau-testleitfaden.v1";

function lade(): Record<string, boolean> {
  try {
    const roh = localStorage.getItem(KEY);
    const w = roh ? (JSON.parse(roh) as unknown) : {};
    return w && typeof w === "object" ? (w as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function speichere(w: Record<string, boolean>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* Speicher nicht verfügbar: Haken gelten nur bis zum Neuladen. */
  }
}

/** Abhakbare Schritte eines Szenarios; der Zustand bleibt nur in diesem Browser (localStorage). */
export function TestleitfadenSzenario({ szenario }: { szenario: Szenario }) {
  const [haken, setHaken] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHaken(lade());
  }, []);
  function umschalten(id: string, an: boolean) {
    const neu = { ...lade(), ...haken, [id]: an };
    setHaken(neu);
    speichere(neu);
  }
  return (
    <ul className="space-y-1.5">
      {szenario.tun.map((text, i) => {
        const id = `${szenario.id}-${i}`;
        return (
          <li key={id}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={haken[id] === true} onChange={(e) => umschalten(id, e.target.checked)} />
              <span className={haken[id] ? "text-muted-foreground line-through" : ""}>{text}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
