/**
 * Globale Sicherheits-Header (next.config.ts `headers()`).
 *
 * Die CSP ist bewusst konservativ und enthält KEIN script-src/default-src: die Seiten laden Skripte von
 * Next.js (inline-Hydration) und optional von Umami (UMAMI_URL, zur Laufzeit konfiguriert); eine
 * Skript-Richtlinie bräuchte Nonces und würde beides brechen. Die strenge Richtlinie der Werkbank
 * (staff/kalkulation/werkbank/…) setzt die Route selbst; die Werkbank ist hier ausgenommen.
 *
 * object-src 'self' statt 'none': die Mitarbeiter-Dateivorschau bettet PDFs per <embed> aus der eigenen
 * Herkunft ein (components/finder/FilePreview.tsx); 'none' würde sie blockieren.
 */
export const CSP_GLOBAL = "frame-ancestors 'none'; base-uri 'self'; object-src 'self'; form-action 'self'";

export const HSTS = "max-age=31536000; includeSubDomains";
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

/** Header für alle Seiten und Schnittstellen außer der Werkbank-Auslieferung. */
export const GLOBALE_HEADER: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: HSTS },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: CSP_GLOBAL },
];

/**
 * Strenge Richtlinie der Werkbank-Auslieferung: nur eigene Quellen; Stile inline (React-Style-Attribute),
 * Bilder auch data:/blob:. Gilt für /staff/kalkulation/werkbank/… und ersetzt dort die globale CSP.
 */
export const CSP_WERKBANK =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

/** Für die Werkbank-Pfade überschreiben diese Header die globalen (spätere Regel gewinnt in next.config.ts). */
export const WERKBANK_HEADER: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: CSP_WERKBANK },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "same-origin" },
];

export const WERKBANK_SOURCE = "/staff/kalkulation/werkbank/:path*";

/** Alle Header-Regeln für next.config.ts, in der richtigen Reihenfolge. */
export function headerRegeln(): { source: string; headers: { key: string; value: string }[] }[] {
  return [
    { source: "/:path*", headers: GLOBALE_HEADER },
    { source: WERKBANK_SOURCE, headers: WERKBANK_HEADER },
  ];
}
