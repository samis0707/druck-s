import type { CSSProperties } from "react";

const CHIPS: { text: string; tone: "ok" | "warn"; style: CSSProperties }[] = [
  { text: "Anschnitt 3 mm", tone: "ok", style: { top: "9%", left: 0, ["--d" as string]: "0.85s" } },
  { text: "Schriften eingebettet", tone: "ok", style: { top: "31%", right: 0, ["--d" as string]: "1.7s" } },
  { text: "Bild 220 dpi · bitte prüfen", tone: "warn", style: { top: "55%", left: 0, ["--d" as string]: "2.65s" } },
  { text: "Alle Seiten einheitlich", tone: "ok", style: { top: "78%", right: 0, ["--d" as string]: "3.5s" } },
];

const INK = "#16191c";

/**
 * Zeigt die Vorabprüfung statt sie zu beschreiben: Ein Druckbogen mit Schnittmarken,
 * Anschnitt-, Beschnitt- und Sicherheitsrahmen; eine Scanlinie fährt darüber, Befunde erscheinen.
 * Ohne Bewegungswunsch steht der fertige Zustand (siehe globals.css).
 */
export function PreflightHero() {
  return (
    <div
      className="hero-stage"
      role="img"
      aria-label="Animierte Vorschau: Eine Druckdatei wird geprüft — Anschnitt, Schriften und Bildauflösung."
    >
      <svg className="hero-sheet" viewBox="-20 -20 340 420" aria-hidden="true">
        <defs>
          <linearGradient id="hero-scan-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand-500)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--color-brand-500)" stopOpacity="0.4" />
          </linearGradient>
          <clipPath id="hero-art">
            <rect x="0" y="0" width="300" height="380" />
          </clipPath>
          <clipPath id="hero-paper">
            <rect x="-20" y="-20" width="340" height="420" rx="3" />
          </clipPath>
        </defs>

        {/* Papier bleibt in beiden Themes weiß: es ist ein physischer Bogen. */}
        <rect x="-20" y="-20" width="340" height="420" rx="3" fill="#ffffff" />

        {/* Druckbild, läuft bis in den Anschnitt. */}
        <g clipPath="url(#hero-art)">
          <rect width="300" height="150" fill="var(--color-signal-600)" />
          <circle cx="238" cy="70" r="74" fill="var(--color-signal-500)" />
          <circle cx="262" cy="40" r="34" fill="var(--color-brand-400)" />
          <rect x="24" y="176" width="200" height="16" rx="3" fill={INK} />
          <rect x="24" y="200" width="140" height="16" rx="3" fill={INK} />
          {[238, 252, 266, 280, 294].map((y, i) => (
            <rect key={y} x="24" y={y} width={[250, 236, 252, 208, 150][i]} height="6" rx="3" fill="#d5d9d2" />
          ))}
          <rect x="24" y="326" width="112" height="26" rx="13" fill="var(--color-brand-500)" />
          <rect x="38" y="336" width="60" height="6" rx="3" fill="#ffffff" opacity="0.9" />
        </g>

        {/* Anschnitt (rot, gestrichelt), Endformat (schwarz), Sicherheitsrand (blau, gepunktet). */}
        <rect x="0" y="0" width="300" height="380" fill="none" stroke="var(--color-danger)" strokeWidth="1" strokeDasharray="4 3" />
        <rect x="12" y="12" width="276" height="356" fill="none" stroke={INK} strokeWidth="1" />
        <rect x="24" y="24" width="252" height="332" fill="none" stroke="var(--color-signal-400)" strokeWidth="1" strokeDasharray="1 3" />

        {/* Schnittmarken außerhalb des Anschnitts + Passermarke. */}
        <path
          d="M-16 12H-2M12 -16V-2M302 12H316M288 -16V-2M-16 368H-2M12 382V396M302 368H316M288 382V396"
          stroke={INK}
          strokeWidth="1"
        />
        <g stroke={INK} strokeWidth="1" fill="none">
          <circle cx="150" cy="-10" r="4" />
          <path d="M150 -16V-4M144 -10H156" />
        </g>

        {/* Markierung am niedrig aufgelösten Bild. */}
        <circle className="hero-ping" cx="262" cy="40" r="34" />

        {/* Scanlinie */}
        <g clipPath="url(#hero-paper)">
          <g className="hero-scan">
            <rect x="-20" y="-40" width="340" height="40" fill="url(#hero-scan-g)" />
            <line x1="-20" x2="320" y1="0" y2="0" stroke="var(--color-brand-500)" strokeWidth="2" />
          </g>
        </g>
      </svg>

      {CHIPS.map((chip) => (
        <span key={chip.text} className="hero-chip" data-tone={chip.tone} style={chip.style} aria-hidden="true">
          <span className="hero-chip-dot">{chip.tone === "ok" ? "✓" : "!"}</span>
          {chip.text}
        </span>
      ))}
    </div>
  );
}
