import Script from "next/script";

const DEFAULT_SRC = "https://plausible.io/js/script.js";

/**
 * Plausible Analytics (cookielos). Rendert nichts, solange keine Domain gesetzt ist.
 * NEXT_PUBLIC_* wird beim Build eingebacken — daher im Docker-Build als Build-Arg setzen.
 */
export function Plausible() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || DEFAULT_SRC;
  return <Script src={src} data-domain={domain} strategy="afterInteractive" />;
}
