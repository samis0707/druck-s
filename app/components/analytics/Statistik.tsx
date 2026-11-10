"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  datenschutzSignal,
  EINSTELLUNGEN_EREIGNIS,
  FILTER_NAME,
  istIntern,
  nutzlastBereinigen,
  STATISTIK_KEY,
  wahlLesen,
  wahlText,
  type StatistikWert,
} from "@/lib/statistik";
import { statistikKonfig, type StatistikKonfig } from "./statistikKonfig";

const SKRIPT_ID = "umami-statistik";

function speicher(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Umami-Skript einfügen (nur nach Einwilligung) */
function skriptLaden(k: Extract<StatistikKonfig, { aktiv: true }>) {
  speicher()?.removeItem("umami.disabled");
  if (document.getElementById(SKRIPT_ID)) return;
  (window as unknown as Record<string, unknown>)[FILTER_NAME] = (_typ: string, nutzlast: { url?: string; referrer?: string }) =>
    nutzlastBereinigen(nutzlast, window.location.origin);
  const s = document.createElement("script");
  s.id = SKRIPT_ID;
  s.src = `${k.url}/script.js`;
  s.defer = true;
  s.dataset.websiteId = k.websiteId;
  s.dataset.domains = "druck-s.de,www.druck-s.de";
  s.dataset.doNotTrack = "true";
  s.dataset.beforeSend = FILTER_NAME;
  document.head.appendChild(s);
}

/** Nach Widerruf: offizieller Umami-Ausschalter (gilt sofort, auch für ein schon geladenes Skript) und Skript entfernen */
function skriptStoppen() {
  speicher()?.setItem("umami.disabled", "1");
  document.getElementById(SKRIPT_ID)?.remove();
}

/**
 * Freundlicher Einwilligungshinweis für die Besucherstatistik (Umami). Nicht blockierend, unten links, kein Modal.
 * Erst nach „Ja, gerne“ wird das Skript geladen. „Do not track“/„Global Privacy Control“ gelten als „Nein“.
 * Wieder öffnen: Knopf „Statistik-Einstellungen“ in der Fußzeile (Ereignis EINSTELLUNGEN_EREIGNIS).
 */
export function Statistik() {
  const pfad = usePathname() ?? "/";
  const [konfig, setKonfig] = useState<StatistikKonfig | null>(null);
  const [wahl, setWahl] = useState<StatistikWert | null>(null);
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    void statistikKonfig().then((k) => {
      if (!aktiv || !k.aktiv) return;
      setKonfig(k);
      if (datenschutzSignal(navigator as Navigator & { globalPrivacyControl?: boolean })) {
        setWahl("nein");
        skriptStoppen();
        return;
      }
      const gespeichert = wahlLesen(speicher()?.getItem(STATISTIK_KEY), Date.now());
      if (gespeichert) {
        setWahl(gespeichert.wert);
        if (gespeichert.wert === "ja") skriptLaden(k);
        else skriptStoppen();
      } else {
        setOffen(true);
      }
    });
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    const oeffnen = () => setOffen(true);
    window.addEventListener(EINSTELLUNGEN_EREIGNIS, oeffnen);
    return () => window.removeEventListener(EINSTELLUNGEN_EREIGNIS, oeffnen);
  }, []);

  const entscheiden = useCallback(
    (wert: StatistikWert) => {
      if (!konfig?.aktiv) return;
      try {
        speicher()?.setItem(STATISTIK_KEY, wahlText(wert, Date.now()));
      } catch {
        /* Speicher voll oder gesperrt – Wahl gilt nur für diesen Besuch */
      }
      setWahl(wert);
      setOffen(false);
      if (wert === "ja") skriptLaden(konfig);
      else skriptStoppen();
    },
    [konfig],
  );

  if (!konfig?.aktiv || !offen || istIntern(pfad)) return null;

  return (
    <section
      role="region"
      aria-label="Besucherstatistik"
      className="fixed inset-x-4 bottom-4 z-40 sm:right-auto sm:max-w-sm"
    >
      <div className="rounded-2xl bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/10 dark:ring-foreground/15">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 text-xl leading-none">
            📊
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Dürfen wir mitzählen?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wir möchten verstehen, welche Seiten im druckraum genutzt werden – anonym, ohne Cookies, auf unserem eigenen
              Server in der EU. Keine Werbung, keine Weitergabe.{" "}
              <Link href="/datenschutz#reichweitenmessung" className="underline underline-offset-2 hover:text-foreground">
                Mehr dazu
              </Link>
            </p>
            {wahl && (
              <p className="mt-2 text-xs text-muted-foreground">
                Aktuell: {wahl === "ja" ? "Sie haben zugestimmt." : "Sie haben abgelehnt."} Sie können Ihre Wahl jederzeit ändern.
              </p>
            )}
          </div>
        </div>
        {/* Beide Knöpfe gleich groß und gleich gestaltet – keine Entscheidung wird nahegelegt */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => entscheiden("ja")} aria-pressed={wahl === "ja"}>
            Ja, gerne
          </Button>
          <Button variant="outline" size="lg" onClick={() => entscheiden("nein")} aria-pressed={wahl === "nein"}>
            Nein, danke
          </Button>
        </div>
      </div>
    </section>
  );
}
