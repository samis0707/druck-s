import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { CSP_GLOBAL, CSP_WERKBANK, headerRegeln } from "./sicherheitsHeader";

const wert = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe("globale Sicherheits-Header", () => {
  it("next.config liefert die Regeln", async () => {
    expect(await nextConfig.headers!()).toEqual(headerRegeln());
  });

  it("setzt die geforderten Header für alle Pfade", () => {
    const global = headerRegeln()[0];
    expect(global.source).toBe("/:path*");
    expect(wert(global.headers, "x-content-type-options")).toBe("nosniff");
    expect(wert(global.headers, "referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(wert(global.headers, "strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(wert(global.headers, "permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(wert(global.headers, "x-frame-options")).toBe("DENY");
  });

  it("globale CSP ist konservativ: kein script-src/default-src (Next-Hydration, Umami), aber Rahmen-/Basis-Schutz", () => {
    expect(CSP_GLOBAL).not.toMatch(/script-src|default-src|style-src|connect-src/);
    for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src"]) expect(CSP_GLOBAL).toContain(d);
  });

  it("die Werkbank behält ihre strenge CSP (spätere Regel überschreibt die globale)", () => {
    const regeln = headerRegeln();
    const werk = regeln[1];
    expect(regeln.indexOf(werk)).toBeGreaterThan(0);
    expect(werk.source).toBe("/staff/kalkulation/werkbank/:path*");
    expect(wert(werk.headers, "content-security-policy")).toBe(CSP_WERKBANK);
    expect(CSP_WERKBANK).toContain("script-src 'self'");
    expect(wert(werk.headers, "x-frame-options")).toBe("SAMEORIGIN");
  });
});
