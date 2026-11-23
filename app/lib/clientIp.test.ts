import { describe, expect, it } from "vitest";
import { ermittleClientIp, normalisiereIp } from "./clientIp";

const h = (o: Record<string, string>) => new Headers(o);
const SECRET = "ein-langes-geheimnis-123";
const eins = { trustedProxies: 1, websiteSecret: "" };

describe("Client-Adresse hinter Proxys", () => {
  it("nimmt bei einem vertrauenswürdigen Proxy den rechten Eintrag, nicht den linken", () => {
    // Der Railway-Rand hängt die echte Adresse hinten an; „6.6.6.6“ hat der Client selbst vorangestellt.
    expect(ermittleClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), eins)).toBe("203.0.113.9");
    expect(ermittleClientIp(h({ "x-forwarded-for": "203.0.113.9" }), eins)).toBe("203.0.113.9");
  });

  it("zählt bei mehreren Proxys von rechts", () => {
    const zwei = { trustedProxies: 2, websiteSecret: "" };
    expect(ermittleClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), zwei)).toBe("203.0.113.9");
    // kürzere Kette als erwartet: erster Eintrag
    expect(ermittleClientIp(h({ "x-forwarded-for": "203.0.113.9" }), zwei)).toBe("203.0.113.9");
  });

  it("ignoriert den Header ganz bei 0 Proxys und gibt „unknown“ ohne Header", () => {
    expect(ermittleClientIp(h({ "x-forwarded-for": "1.2.3.4" }), { trustedProxies: 0, websiteSecret: "" })).toBe("unknown");
    expect(ermittleClientIp(h({}), eins)).toBe("unknown");
  });

  it("verwirft Müll statt ihn als Schlüssel zu verwenden", () => {
    expect(ermittleClientIp(h({ "x-forwarded-for": "nicht-ip" }), eins)).toBe("unknown");
    expect(ermittleClientIp(h({ "x-forwarded-for": "1.2.3.4:5555" }), eins)).toBe("1.2.3.4");
    expect(ermittleClientIp(h({ "x-forwarded-for": "::ffff:1.2.3.4" }), eins)).toBe("1.2.3.4");
    expect(normalisiereIp("[2001:DB8::1]")).toBe("2001:db8::1");
  });

  it("nimmt die Besucher-Adresse der Website nur mit passendem Geheimnis", () => {
    const o = { trustedProxies: 1, websiteSecret: SECRET };
    const mit = { "x-forwarded-for": "100.64.0.7", "x-dmp-client-ip": "198.51.100.23", "x-dmp-proxy-secret": SECRET };
    expect(ermittleClientIp(h(mit), o)).toBe("198.51.100.23");
    // falsches Geheimnis: Fälschungsversuch, es gilt der Rand
    expect(ermittleClientIp(h({ ...mit, "x-dmp-proxy-secret": "falsch" }), o)).toBe("100.64.0.7");
    expect(ermittleClientIp(h({ "x-forwarded-for": "100.64.0.7", "x-dmp-client-ip": "198.51.100.23" }), o)).toBe("100.64.0.7");
    // ohne konfiguriertes (oder mit zu kurzem) Geheimnis ist der Weg aus
    expect(ermittleClientIp(h(mit), { trustedProxies: 1, websiteSecret: "" })).toBe("100.64.0.7");
    expect(ermittleClientIp(h({ ...mit, "x-dmp-proxy-secret": "kurz" }), { trustedProxies: 1, websiteSecret: "kurz" })).toBe("100.64.0.7");
    // ungültige Adresse trotz Geheimnis: Rückfall auf den Rand
    expect(ermittleClientIp(h({ ...mit, "x-dmp-client-ip": "x" }), o)).toBe("100.64.0.7");
  });
});
