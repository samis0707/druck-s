import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VorschauHinweis } from "@/components/vorschau/VorschauBanner";
import { ABSCHNITTE, checklistenIds, leitfadenMarkdown } from "./testleitfaden";

const mocks = vi.hoisted(() => ({
  user: null as null | { role: string },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  },
  usePathname: () => "/",
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => mocks.user,
  isStaff: (u: { role: string }) => u.role === "staff" || u.role === "admin",
}));

const MD = path.resolve(__dirname, "../../docs/vorschau-testleitfaden.md");

describe("Testleitfaden-Inhalt", () => {
  it("Markdown-Datei stimmt mit der TS-Quelle überein", () => {
    if (process.env.LEITFADEN_SCHREIBEN === "1") writeFileSync(MD, leitfadenMarkdown());
    expect(readFileSync(MD, "utf8")).toBe(leitfadenMarkdown());
  });

  it("enthält alle Szenarien A bis G und eindeutige Checklisten-Schlüssel", () => {
    const s = ABSCHNITTE.flatMap((a) => a.szenarien ?? []).map((x) => x.buchstabe);
    expect(s).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    const ids = checklistenIds();
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Seite /staff/vorschau-test", () => {
  beforeEach(() => {
    mocks.user = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("liefert 404 ohne Vorschau-Modus (auch für Mitarbeitende)", async () => {
    const { default: Seite } = await import("@/app/staff/vorschau-test/page");
    vi.stubEnv("PREVIEW_MODE", "");
    mocks.user = { role: "staff" };
    await expect(Seite()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("leitet ohne Staff-Session zum Staff-Login weiter", async () => {
    const { default: Seite } = await import("@/app/staff/vorschau-test/page");
    vi.stubEnv("PREVIEW_MODE", "1");
    await expect(Seite()).rejects.toThrow("NEXT_REDIRECT:/staff/login");
    mocks.user = { role: "customer" };
    await expect(Seite()).rejects.toThrow("NEXT_REDIRECT:/staff/login");
  });

  it("zeigt Mitarbeitenden in der Vorschau den Leitfaden und ist dynamisch", async () => {
    const mod = await import("@/app/staff/vorschau-test/page");
    vi.stubEnv("PREVIEW_MODE", "1");
    mocks.user = { role: "staff" };
    expect(mod.dynamic).toBe("force-dynamic");
    expect(renderToStaticMarkup(await mod.default())).toContain("So ist kalpri eingebunden");
  });
});

describe("Banner-Link und Staff-Schalter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Link nur mit Staff-Kennzeichen", () => {
    expect(renderToStaticMarkup(VorschauHinweis({ mitLeitfaden: true }))).toContain('href="/staff/vorschau-test"');
    expect(renderToStaticMarkup(VorschauHinweis({}))).not.toContain("Testleitfaden");
  });

  it("/api/vorschau/staff: nur Staff in der Vorschau", async () => {
    const { GET } = await import("@/app/api/vorschau/staff/route");
    const req = new Request("http://localhost/api/vorschau/staff");
    vi.stubEnv("PREVIEW_MODE", "1");
    mocks.user = null;
    expect(await (await GET(req)).json()).toEqual({ staff: false });
    mocks.user = { role: "customer" };
    expect(await (await GET(req)).json()).toEqual({ staff: false });
    mocks.user = { role: "admin" };
    expect(await (await GET(req)).json()).toEqual({ staff: true });
    vi.stubEnv("PREVIEW_MODE", "");
    expect(await (await GET(req)).json()).toEqual({ staff: false });
  });
});
