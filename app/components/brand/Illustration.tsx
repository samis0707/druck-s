/** Leerzustands-Illustrationen im Papier-Stil; Farben folgen den Theme-Tokens. */
export function Illustration({ kind, className }: { kind: "tray" | "search"; className?: string }) {
  const stroke = "var(--color-ink-soft)";
  const paper = "var(--color-surface)";
  const sunk = "var(--color-surface-sunk)";
  return (
    <svg viewBox="0 0 132 104" width="132" height="104" className={className} aria-hidden="true" fill="none">
      {kind === "tray" ? (
        <>
          <g stroke={stroke} strokeWidth="1.5" strokeLinejoin="round">
            <rect x="30" y="16" width="46" height="60" rx="3" fill={paper} transform="rotate(-9 53 46)" />
            <rect x="52" y="10" width="46" height="60" rx="3" fill={paper} transform="rotate(7 75 40)" />
            <rect x="42" y="14" width="46" height="60" rx="3" fill={paper} />
            <path d="M50 30h30M50 38h30M50 46h20" strokeLinecap="round" />
            <path d="M14 62h26l8 12h36l8-12h26v26a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5Z" fill={sunk} />
          </g>
          <circle cx="66" cy="27" r="0" />
          <path d="M6 6v8M2 10h8" stroke="var(--color-brand-500)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M124 76v6M121 79h6" stroke="var(--color-brand-500)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <g stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            <rect x="28" y="10" width="54" height="72" rx="3" fill={paper} />
            <path d="M38 26h34M38 36h34M38 46h22M38 56h26" />
            <circle cx="84" cy="62" r="17" fill={paper} fillOpacity="0.85" />
            <path d="M96.5 74.5 112 90" strokeWidth="4" />
          </g>
          <path d="M77 62h14" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 20v8M10 24h8" stroke="var(--color-brand-500)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
