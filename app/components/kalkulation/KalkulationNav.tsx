import Link from "next/link";

const PUNKTE = [
  { key: "kalkulation", href: "/staff/kalkulation", label: "Kalkulation", tour: "kalkulation-nav-rechner" },
  { key: "stammdaten", href: "/staff/kalkulation/stammdaten", label: "Stammdaten", tour: "kalkulation-nav-stammdaten" },
  { key: "einstellungen", href: "/staff/kalkulation/einstellungen", label: "Preis-Einstellungen", tour: "kalkulation-nav-einstellungen" },
] as const;

/** Kleine Navigation innerhalb des Kalkulationsbereichs. */
export function KalkulationNav({ aktiv }: { aktiv: (typeof PUNKTE)[number]["key"] }) {
  return (
    <nav aria-label="Kalkulation" data-tour="kalkulation-nav" className="flex flex-wrap gap-2">
      {PUNKTE.map((p) => (
        <Link
          key={p.key}
          href={p.href}
          data-tour={p.tour}
          aria-current={p.key === aktiv ? "page" : undefined}
          className={`rounded-2xl px-3 py-1.5 text-sm transition-colors ${
            p.key === aktiv ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
