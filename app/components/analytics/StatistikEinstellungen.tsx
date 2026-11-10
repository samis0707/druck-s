"use client";

import { useEffect, useState } from "react";
import { EINSTELLUNGEN_EREIGNIS } from "@/lib/statistik";
import { statistikKonfig } from "./statistikKonfig";

/** Fußzeilen-Knopf, der den Statistik-Hinweis wieder öffnet (nur, wenn die Statistik eingerichtet ist) */
export function StatistikEinstellungen({ className }: { className?: string }) {
  const [aktiv, setAktiv] = useState(false);
  useEffect(() => {
    let an = true;
    void statistikKonfig().then((k) => an && setAktiv(k.aktiv));
    return () => {
      an = false;
    };
  }, []);
  if (!aktiv) return null;
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(EINSTELLUNGEN_EREIGNIS))}>
      Statistik-Einstellungen
    </button>
  );
}
