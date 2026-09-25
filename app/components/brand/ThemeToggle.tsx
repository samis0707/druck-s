"use client";

import { useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";

export const THEME_KEY = "dmp-druckraum-theme";

/** Läuft vor dem ersten Paint (siehe layout.tsx), damit es keinen hellen Blitz gibt. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Hell/Dunkel-Umschalter; die `.dark`-Klasse an <html> ist die einzige Wahrheit. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const apply = () => {
      const next = !document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        /* Storage nicht verfügbar — Wahl gilt nur für diese Sitzung. */
      }
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && "startViewTransition" in document) {
      (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(apply);
    } else {
      apply();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Dunkelmodus"
      title={dark ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}
      className={`flex size-9 items-center justify-center rounded-2xl text-(--color-ink-mid) transition-colors hover:bg-muted hover:text-(--color-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className ?? ""}`}
    >
      <HugeiconsIcon icon={dark ? Sun03Icon : Moon02Icon} size={20} />
    </button>
  );
}
