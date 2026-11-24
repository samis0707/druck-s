import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VorschauHinweis } from "@/components/vorschau/VorschauBanner";
import { filtereEmpfaenger, istProduktionsUrl, pruefeSeedErlaubnis, vorschauAktiv, vorschauBetreff, vorschauStaffEmails } from "./modus";
import { vorschauMail } from "./mail";

describe("Vorschau-Schalter", () => {
  it("ist ohne PREVIEW_MODE aus", () => {
    expect(vorschauAktiv({})).toBe(false);
    expect(vorschauAktiv({ PREVIEW_MODE: "0" })).toBe(false);
    expect(vorschauAktiv({ PREVIEW_MODE: "" })).toBe(false);
    expect(vorschauAktiv({ PREVIEW_MODE: "1" })).toBe(true);
  });

  it("erkennt die Produktions-Adressen", () => {
    expect(istProduktionsUrl("https://druck-s.de")).toBe(true);
    expect(istProduktionsUrl("https://www.druck-s.de/")).toBe(true);
    expect(istProduktionsUrl("https://WWW.DRUCK-S.DE:443/x")).toBe(true);
    expect(istProduktionsUrl("http://localhost:3100")).toBe(false);
    expect(istProduktionsUrl("https://vorschau.up.railway.app")).toBe(false);
    expect(istProduktionsUrl("https://druck-s.de.example.org")).toBe(false);
    expect(istProduktionsUrl(undefined)).toBe(false);
  });

  it("verweigert das Seeden ohne Schalter und gegen die Produktion", () => {
    expect(pruefeSeedErlaubnis({ APP_BASE_URL: "http://localhost:3100" }).ok).toBe(false);
    expect(pruefeSeedErlaubnis({ PREVIEW_MODE: "1", APP_BASE_URL: "http://localhost:3100" }).ok).toBe(true);
    const a = pruefeSeedErlaubnis({ PREVIEW_MODE: "1", APP_BASE_URL: "https://www.druck-s.de" });
    expect(a.ok).toBe(false);
    expect(!a.ok && a.grund).toMatch(/Produktion/);
    expect(pruefeSeedErlaubnis({ PREVIEW_MODE: "1", APP_BASE_URL: "http://x.test", BETTER_AUTH_URL: "https://druck-s.de" }).ok).toBe(false);
  });

  it("liest PREVIEW_STAFF_EMAILS", () => {
    expect(vorschauStaffEmails({ PREVIEW_STAFF_EMAILS: " A@Example.org, b@example.org,,kaputt, a@example.org " })).toEqual(["a@example.org", "b@example.org"]);
    expect(vorschauStaffEmails({})).toEqual([]);
  });
});

describe("Mail-Schutz", () => {
  it("setzt das Betreff-Präfix einmal", () => {
    expect(vorschauBetreff("Hallo")).toBe("[Vorschau] Hallo");
    expect(vorschauBetreff("[Vorschau] Hallo")).toBe("[Vorschau] Hallo");
  });

  it("lässt nur Mitarbeiter und bekannte Adressen durch", async () => {
    const bekannt = async (a: string) => a === "tester@example.net";
    const r = await filtereEmpfaenger({ to: ["Team <staff@example.org>", "fremd@example.com"], cc: "tester@example.net" }, ["staff@example.org"], bekannt);
    expect(r.to).toEqual(["Team <staff@example.org>"]);
    expect(r.cc).toEqual(["tester@example.net"]);
    expect(r.verworfen).toBe(1);
  });

  it("verwirft Mails ohne erlaubten Empfänger und prägt den Betreff", async () => {
    const nein = async () => false;
    expect(await vorschauMail({ to: "fremd@example.com", subject: "x", text: "t" }, ["staff@example.org"], nein)).toBeNull();
    const ok = await vorschauMail({ to: "staff@example.org", subject: "Code", text: "t" }, ["staff@example.org"], nein);
    expect(ok?.mail.subject).toBe("[Vorschau] Code");
  });
});

describe("Banner und Header", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("zeigt den Hinweistext", () => {
    expect(renderToStaticMarkup(VorschauHinweis())).toContain("Vorschau-Umgebung – nur Beispieldaten, keine echten Aufträge");
  });

  it("/api/vorschau meldet den Schalter zur Laufzeit", async () => {
    const { GET } = await import("@/app/api/vorschau/route");
    vi.stubEnv("PREVIEW_MODE", "");
    expect(await (await GET()).json()).toEqual({ vorschau: false });
    vi.stubEnv("PREVIEW_MODE", "1");
    expect(await (await GET()).json()).toEqual({ vorschau: true });
  });

  it("noindex nur im Vorschau-Modus (proxy, robots, Statistik)", async () => {
    const { proxy } = await import("@/proxy");
    const robots = (await import("@/app/robots")).default;
    const { GET: statistik } = await import("@/app/api/statistik/route");
    const req = new Request("http://localhost/") as never;
    vi.stubEnv("PREVIEW_MODE", "");
    expect(proxy(req).headers.get("x-robots-tag")).toBeNull();
    expect(JSON.stringify(robots().rules)).toContain("/staff");
    vi.stubEnv("PREVIEW_MODE", "1");
    vi.stubEnv("UMAMI_URL", "https://stats.example.org");
    vi.stubEnv("UMAMI_WEBSITE_ID", "abc");
    expect(proxy(req).headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(await (await statistik()).json()).toEqual({ aktiv: false });
  });
});
