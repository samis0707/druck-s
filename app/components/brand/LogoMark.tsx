import Image from "next/image";

/** Passermarke als Logo: Kreis + Fadenkreuz, zwei Quadranten in Markenfarbe. Färbt sich über currentColor. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <path d="M16 16V7a9 9 0 0 1 9 9Z" fill="var(--color-brand-500)" />
      <path d="M16 16v9a9 9 0 0 1-9-9Z" fill="var(--color-brand-500)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 1.5v9M16 21.5v9M1.5 16h9M21.5 16h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wortmarke „dmp druckraum“ mit dem digitale-medien-Logo. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Image src="/digitale-medien-logo.png" alt="" width={36} height={36} priority className="size-9" />
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className="text-[13px] font-semibold tracking-[0.04em] text-(--color-ink-mid)">dmp</span>
        <span className="text-[20px] font-semibold tracking-[-0.02em]">druckraum</span>
      </span>
    </span>
  );
}
