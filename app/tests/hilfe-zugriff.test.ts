import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Zielgruppen-Zugriff der Hilfe: Der Mitarbeiter-Kurs „druckerei“ ist nur mit Staff-Sitzung erreichbar (Seiten, Markdown,
 * PDFs, Bilder, Tour-Texte); der Kunden- und der Partner-Kurs bleiben öffentlich. Geprüft direkt an Seiten, Route Handlers
 * und Hilfsfunktionen — die Sitzung ist gemockt (wie in tests/kalkulation.test.ts). Kein Server, keine Datenbank.
 */
type Sitzung = { id: string; email: string; name: string | null; role: string; status: string; firm: string | null } | null;
let sitzung: Sitzung = null;

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => sitzung,
  isStaff: (u: { role: string }) => u.role === "staff" || u.role === "admin",
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// Client-Komponenten der Lektion (useRouter) brauchen im Test keinen echten App-Router; redirect/notFound bleiben echt.
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ push() {}, replace() {}, prefetch() {} }), usePathname: () => "/" }));

import { KURSE_OEFFENTLICH, kursDownloads, lektionsPfad } from "@/lib/hilfe/inhalte";
import { KURS_MITARBEITER } from "@/lib/hilfe/inhalte-mitarbeiter";
import { alleKurseUngefiltert, downloadsFuer, kursFuer, lektionFuer, sichtbareKurse } from "@/lib/hilfe/kurse";
import { darfSehen, istMitarbeiterKurs, mitarbeiterLoginUrl, sichererRuecksprung, zielgruppeVon } from "@/lib/hilfe/zugriff";
import { istInternesBild } from "@/lib/hilfe/bilder-pfad";
import { internesZiel } from "@/lib/hilfe/intern";
import intern from "@/lib/hilfe/intern.json";
import { hilfeStartMarkdown, llmsFullTxt, llmsTxt } from "@/lib/hilfe/markdown";
import { GET as markdownGet } from "@/app/hilfe-md/[[...pfad]]/route";
import { GET as dateiGet } from "@/app/hilfe-intern/[...datei]/route";
import { GET as tourGet } from "@/app/api/staff/hilfe/tour/[id]/route";
import { GET as llmsGet } from "@/app/llms.txt/route";
import { GET as llmsFullGet } from "@/app/llms-full.txt/route";
import { generateStaticParams as kursParams } from "@/app/hilfe/[kurs]/page";
import { generateStaticParams as lektionParams } from "@/app/hilfe/[kurs]/[lektion]/page";
import { KursAnsicht, kursMetadaten } from "@/components/hilfe/KursAnsicht";
import { LektionAnsicht, lektionMetadaten } from "@/components/hilfe/LektionAnsicht";
import HilfeStart from "@/app/hilfe/page";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { TOUREN_MITARBEITER } from "@/components/tour/touren-mitarbeiter";
import { MITARBEITER_TOUR_IDS } from "@/components/tour/touren";

const ROOT = path.resolve(__dirname, "..");
const ANONYM: Sitzung = null;
const KUNDE: Sitzung = { id: "k1", email: "kunde@example.org", name: null, role: "customer", status: "customer", firm: null };
const STAFF: Sitzung = { id: "s1", email: "staff@example.org", name: null, role: "staff", status: "customer", firm: null };

const lektion0 = KURS_MITARBEITER.lektionen[0];
const lektionPfad = lektionsPfad(KURS_MITARBEITER, lektion0);
const interneBilder = KURS_MITARBEITER.lektionen.flatMap((l) => l.bilder ?? []).map((b) => b.name);
const internePdf = path.basename(kursDownloads(KURS_MITARBEITER)[0].href);

const req = () => new Request("http://localhost/x");
const pfadCtx = (...pfad: string[]) => ({ params: Promise.resolve({ pfad }) }) as never;
const dateiCtx = (...datei: string[]) => ({ params: Promise.resolve({ datei }) }) as never;

beforeEach(() => {
  sitzung = ANONYM;
});

/** Alle Texte, an denen man den Mitarbeiter-Kurs erkennt (Titel von Kurs und Lektionen, Slugs). */
const MITARBEITER_MERKMALE = [KURS_MITARBEITER.titel, ...KURS_MITARBEITER.lektionen.map((l) => l.titel), "/hilfe/druckerei", "hilfe-intern", "Kurzanleitung Kalkulation"];

function ohneMerkmale(text: string) {
  for (const m of MITARBEITER_MERKMALE) expect(text, m).not.toContain(m);
}

async function umleitung(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return decodeURIComponent(digest.split(";")[2]);
    if (digest.includes("NEXT_HTTP_ERROR_FALLBACK;404") || digest.includes("NEXT_NOT_FOUND")) return "404";
    throw e;
  }
  return null;
}

describe("Zielgruppen-Regeln", () => {
  it("ordnet die Kurse zu: kunden und partner öffentlich, druckerei nur Mitarbeitende", () => {
    expect(zielgruppeVon("kunden")).toBe("oeffentlich");
    expect(zielgruppeVon("partner")).toBe("oeffentlich");
    expect(zielgruppeVon("druckerei")).toBe("mitarbeiter");
    expect(zielgruppeVon("toString")).toBeUndefined();
    expect(zielgruppeVon("gibt-es-nicht")).toBeUndefined();
    expect(istMitarbeiterKurs("druckerei")).toBe(true);
    expect(darfSehen("druckerei", false)).toBe(false);
    expect(darfSehen("druckerei", true)).toBe(true);
    expect(darfSehen("kunden", false)).toBe(true);
    expect(darfSehen("gibt-es-nicht", true)).toBe(false);
  });

  it("filtert Kurse und Downloads nach Zielgruppe", () => {
    expect(sichtbareKurse(false).map((k) => k.slug).sort()).toEqual(["kunden", "partner"]);
    expect(sichtbareKurse(true).map((k) => k.slug).sort()).toEqual(["druckerei", "kunden", "partner"]);
    expect(sichtbareKurse(true)[0].slug).toBe("druckerei");
    expect(kursFuer("druckerei", false)).toBeUndefined();
    expect(lektionFuer("druckerei", lektion0.slug, false)).toBeUndefined();
    expect(lektionFuer("druckerei", lektion0.slug, true)?.lektion.slug).toBe(lektion0.slug);
    expect(downloadsFuer(false).some((d) => d.href.includes("hilfe-intern"))).toBe(false);
    expect(downloadsFuer(true).some((d) => d.href.includes("hilfe-intern"))).toBe(true);
    expect(KURSE_OEFFENTLICH.map((k) => k.slug)).not.toContain("druckerei");
  });

  it("lässt als Rücksprung nur interne Pfade zu", () => {
    expect(sichererRuecksprung("/hilfe/druckerei/x")).toBe("/hilfe/druckerei/x");
    for (const boese of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", null, undefined, "/a\nb"]) {
      expect(sichererRuecksprung(boese)).toBe("/staff");
    }
    expect(mitarbeiterLoginUrl("/hilfe/druckerei")).toBe("/staff/login?weiter=%2Fhilfe%2Fdruckerei");
  });
});

describe("Seiten", () => {
  it("hat für jeden Mitarbeiter-Kurs eine eigene, dynamische Route (statisches Segment) und baut ihn nie vorab", () => {
    for (const k of alleKurseUngefiltert().filter((x) => istMitarbeiterKurs(x.slug))) {
      for (const datei of [`app/hilfe/${k.slug}/page.tsx`, `app/hilfe/${k.slug}/[lektion]/page.tsx`]) {
        const quelle = readFileSync(path.join(ROOT, datei), "utf8");
        expect(quelle, datei).toMatch(/export const dynamic = "force-dynamic"/);
        expect(quelle, datei).not.toMatch(/generateStaticParams/);
      }
    }
    // Die dynamischen Segmente [kurs] bauen nur öffentliche Kurse und erzeugen nichts nachträglich (kein ISR-Cache ohne Sitzungsprüfung).
    for (const datei of ["app/hilfe/[kurs]/page.tsx", "app/hilfe/[kurs]/[lektion]/page.tsx"]) {
      expect(readFileSync(path.join(ROOT, datei), "utf8"), datei).toMatch(/export const dynamicParams = false/);
    }
  });

  it("rendert Mitarbeiter-Kurs und -Lektion nie vorab statisch", () => {
    expect(kursParams().map((p) => p.kurs)).not.toContain("druckerei");
    expect(lektionParams().some((p) => p.kurs === "druckerei")).toBe(false);
    expect(lektionParams().some((p) => p.kurs === "kunden")).toBe(true);
  });

  for (const [name, wer] of [["anonym", ANONYM], ["Kunde", KUNDE]] as const) {
    it(`leitet ${name} bei Kurs und Lektion zur Mitarbeiter-Anmeldung um — auch bei unbekannter Lektion`, async () => {
      sitzung = wer;
      expect(await umleitung(() => KursAnsicht({ slug: "druckerei" }))).toBe("/staff/login?weiter=/hilfe/druckerei");
      expect(await umleitung(() => LektionAnsicht({ kurs: "druckerei", lektion: lektion0.slug }))).toBe(`/staff/login?weiter=${lektionPfad}`);
      expect(await umleitung(() => LektionAnsicht({ kurs: "druckerei", lektion: "gibt-es-nicht" }))).toBe("/staff/login?weiter=/hilfe/druckerei/gibt-es-nicht");
    });

    it(`liefert ${name} keine Metadaten des Mitarbeiter-Kurses`, async () => {
      sitzung = wer;
      const k = JSON.stringify(await kursMetadaten("druckerei"));
      const l = JSON.stringify(await lektionMetadaten("druckerei", lektion0.slug));
      ohneMerkmale(k);
      ohneMerkmale(l);
      expect(k).not.toContain(KURS_MITARBEITER.kurz);
      expect(l).not.toContain(lektion0.kurz);
    });
  }

  it("lässt Mitarbeitende Kurs, Lektion und Metadaten sehen (nicht indexierbar)", async () => {
    sitzung = STAFF;
    const kurs = await KursAnsicht({ slug: "druckerei" });
    const html = renderToStaticMarkup(kurs);
    expect(html).toContain(KURS_MITARBEITER.titel);
    expect(html).toContain("/hilfe-intern/dmp-druckraum-kurzanleitung-druckerei.pdf");
    const lek = renderToStaticMarkup(await LektionAnsicht({ kurs: "druckerei", lektion: lektion0.slug }));
    expect(lek).toContain(lektion0.titel);
    const meta = await lektionMetadaten("druckerei", lektion0.slug);
    expect(meta.title).toContain(lektion0.titel);
    expect(meta.robots).toMatchObject({ index: false });
    expect(await umleitung(() => LektionAnsicht({ kurs: "druckerei", lektion: "gibt-es-nicht" }))).toBe("404");
  });

  it("zeigt Mitarbeiter-Bilder über die gesicherte Route, öffentliche weiter aus /hilfe/img", async () => {
    sitzung = STAFF;
    const mitBild = KURS_MITARBEITER.lektionen.find((l) => l.bilder?.length)!;
    const html = renderToStaticMarkup(await LektionAnsicht({ kurs: "druckerei", lektion: mitBild.slug }));
    expect(html).toContain(`/hilfe-intern/img/${mitBild.bilder![0].name}.webp`);
    expect(html).not.toContain(`/hilfe/img/${mitBild.bilder![0].name}`);
    const oeff = KURSE_OEFFENTLICH[0].lektionen.find((l) => l.bilder?.length)!;
    const htmlOeff = renderToStaticMarkup(await LektionAnsicht({ kurs: KURSE_OEFFENTLICH[0].slug, lektion: oeff.slug }));
    expect(htmlOeff).toContain(`/hilfe/img/${oeff.bilder![0].name}`);
  });

  it("zeigt Kunden und Gästen den Kunden- und den Partner-Kurs weiterhin ohne Anmeldung", async () => {
    for (const wer of [ANONYM, KUNDE]) {
      sitzung = wer;
      for (const k of KURSE_OEFFENTLICH) {
        expect(renderToStaticMarkup(await KursAnsicht({ slug: k.slug }))).toContain(k.titel);
        expect(renderToStaticMarkup(await LektionAnsicht({ kurs: k.slug, lektion: k.lektionen[0].slug }))).toContain(k.lektionen[0].titel);
      }
    }
    expect(await umleitung(() => KursAnsicht({ slug: "gibt-es-nicht" }))).toBe("404");
  });

  it("zeigt in der Übersicht Gästen und Kunden nichts vom Mitarbeiter-Kurs, Mitarbeitenden alles", async () => {
    for (const wer of [ANONYM, KUNDE]) {
      sitzung = wer;
      const html = renderToStaticMarkup(await HilfeStart());
      ohneMerkmale(html);
      expect(html).not.toContain("Kurs für Mitarbeitende");
      for (const k of KURSE_OEFFENTLICH) expect(html).toContain(k.titel);
    }
    sitzung = STAFF;
    const html = renderToStaticMarkup(await HilfeStart());
    expect(html).toContain(KURS_MITARBEITER.titel);
    expect(html).toContain("/hilfe/druckerei");
    expect(html).toContain("/hilfe-intern/dmp-druckraum-kurzanleitung-kalkulation.pdf");
  });
});

describe("Markdown und llms.txt", () => {
  it("liefert den Mitarbeiter-Kurs als Markdown nur an Mitarbeitende (sonst 404)", async () => {
    for (const wer of [ANONYM, KUNDE]) {
      sitzung = wer;
      for (const pfad of [["druckerei"], ["druckerei", lektion0.slug], ["druckerei", "gibt-es-nicht"]]) {
        const res = await markdownGet(req(), pfadCtx(...pfad));
        expect(res.status, pfad.join("/")).toBe(404);
        ohneMerkmale(await res.text());
      }
    }
    sitzung = STAFF;
    const kurs = await markdownGet(req(), pfadCtx("druckerei"));
    expect(kurs.status).toBe(200);
    expect(await kurs.text()).toContain(KURS_MITARBEITER.titel);
    const lek = await markdownGet(req(), pfadCtx("druckerei", lektion0.slug));
    expect(lek.status).toBe(200);
    expect(lek.headers.get("cache-control")).toBe("private, no-store");
    expect(await lek.text()).toContain(lektion0.titel);
    expect((await markdownGet(req(), pfadCtx("druckerei", "gibt-es-nicht"))).status).toBe(404);
  });

  it("lässt öffentliche Kurse als Markdown für alle zu", async () => {
    sitzung = ANONYM;
    const res = await markdownGet(req(), pfadCtx("kunden", KURSE_OEFFENTLICH[0].lektionen[0].slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    expect((await markdownGet(req(), pfadCtx("partner"))).status).toBe(200);
  });

  it("nennt den Mitarbeiter-Kurs weder in /hilfe.md noch in llms.txt oder llms-full.txt — auch nicht für Mitarbeitende", async () => {
    sitzung = STAFF;
    ohneMerkmale(hilfeStartMarkdown());
    ohneMerkmale(llmsTxt());
    ohneMerkmale(llmsFullTxt());
    ohneMerkmale(await (await llmsGet()).text());
    ohneMerkmale(await (await llmsFullGet()).text());
    ohneMerkmale(await (await markdownGet(req(), pfadCtx())).text());
  });
});

describe("PDFs und Screenshots", () => {
  it("liefert interne Dateien nur mit Staff-Sitzung aus (sonst 404)", async () => {
    const ziele = [[internePdf], ["img", `${interneBilder[0]}.webp`]];
    for (const wer of [ANONYM, KUNDE]) {
      sitzung = wer;
      for (const z of ziele) {
        const res = await dateiGet(req(), dateiCtx(...z));
        expect(res.status, z.join("/")).toBe(404);
        expect((await res.arrayBuffer()).byteLength).toBeLessThan(100);
      }
    }
    sitzung = STAFF;
    const pdf = await dateiGet(req(), dateiCtx(internePdf));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pdf.headers.get("cache-control")).toMatch(/^private/);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const bild = await dateiGet(req(), dateiCtx("img", `${interneBilder[0]}.webp`));
    expect(bild.status).toBe(200);
    expect(bild.headers.get("content-type")).toBe("image/webp");
    expect(bild.headers.get("x-content-type-options")).toBe("nosniff");
    expect(bild.headers.get("cache-control")).toMatch(/^private/);
  });

  it("gibt nur freigegebene Dateien heraus (kein Pfad-Durchgriff, keine öffentlichen Dateien)", async () => {
    sitzung = STAFF;
    const nein = [
      ["..", "package.json"],
      ["pdf", internePdf],
      ["img", "..", "pdf", internePdf],
      ["img", "kunde-start.webp"],
      ["img", `${interneBilder[0]}.png`],
      ["img", "%2e%2e"],
      [`${internePdf}.zip`],
      ["dmp-druckraum-kurzanleitung-kunden.pdf"],
      [],
    ];
    for (const z of nein) expect((await dateiGet(req(), dateiCtx(...z))).status, z.join("/")).toBe(404);
    expect(internesZiel(["..", "x"])).toBeNull();
  });
});

describe("Tour-Texte", () => {
  it("liefert Tour-Texte des Mitarbeiter-Kurses nur mit Staff-Sitzung", async () => {
    const hole = async (id: string) => (await tourGet(req(), { params: Promise.resolve({ id }) } as never))!;
    for (const wer of [ANONYM, KUNDE]) {
      sitzung = wer;
      const res = await hole("kalkulation");
      expect([401, 403]).toContain(res.status);
      expect(await res.text()).not.toContain(TOUREN_MITARBEITER.kalkulation.einladung);
    }
    sitzung = STAFF;
    const ok = await hole("kalkulation");
    expect(ok.status).toBe(200);
    expect((await ok.json()).einladung).toBe(TOUREN_MITARBEITER.kalkulation.einladung);
    expect((await hole("upload")).status).toBe(404);
    expect((await hole("gibt-es-nicht")).status).toBe(404);
    expect(Object.keys(TOUREN_MITARBEITER).sort()).toEqual([...MITARBEITER_TOUR_IDS].sort());
  });
});

describe("Sitemap und robots.txt", () => {
  it("nimmt Mitarbeiter-Hilfeseiten nicht in die Sitemap auf und sperrt sie in robots.txt", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.includes("/hilfe/druckerei"))).toBe(false);
    expect(urls.some((u) => u.includes("hilfe-intern"))).toBe(false);
    expect(urls.some((u) => u.includes("/hilfe/kunden/"))).toBe(true);
    for (const e of sitemap()) for (const bild of Array.isArray(e.images) ? e.images : []) expect(bild).not.toContain("hilfe-intern");
    const regeln = robots().rules as { disallow: string[] }[];
    for (const r of regeln) {
      expect(r.disallow).toContain("/hilfe/druckerei");
      expect(r.disallow).toContain("/hilfe-intern/");
    }
  });
});

describe("Dateien und Bundles", () => {
  it("hält intern.json, Kurse und Ordner zusammen: Mitarbeiter-Dateien nicht in public/", () => {
    const oeffentlicheBilder = KURSE_OEFFENTLICH.flatMap((k) => k.lektionen.flatMap((l) => l.bilder ?? [])).map((b) => b.name);
    for (const n of interneBilder) expect(istInternesBild(n), n).toBe(true);
    for (const n of oeffentlicheBilder) expect(istInternesBild(n), n).toBe(false);
    const internePdfs = kursDownloads(KURS_MITARBEITER).map((d) => path.basename(d.href));
    for (const d of kursDownloads(KURS_MITARBEITER)) expect(d.href.startsWith("/hilfe-intern/"), d.href).toBe(true);
    for (const k of KURSE_OEFFENTLICH) for (const d of kursDownloads(k)) expect(d.href.startsWith("/hilfe/"), d.href).toBe(true);
    expect([...intern.pdfs].sort()).toEqual([...new Set(internePdfs)].sort());
    for (const n of intern.bilder) expect(existsSync(path.join(ROOT, "hilfe-intern/img", `${n}.webp`)), n).toBe(true);
    for (const n of intern.pdfs) expect(existsSync(path.join(ROOT, "hilfe-intern/pdf", n)), n).toBe(true);
    // Nichts Internes in public/ — und nichts Öffentliches im internen Ordner.
    for (const f of readdirSync(path.join(ROOT, "public/hilfe/img"))) expect(intern.bilder, f).not.toContain(f.replace(/\.webp$/, ""));
    for (const f of readdirSync(path.join(ROOT, "public/hilfe")).filter((x) => x.endsWith(".pdf"))) expect(intern.pdfs, f).not.toContain(f);
    for (const f of readdirSync(path.join(ROOT, "hilfe-intern/img"))) expect(intern.bilder, f).toContain(f.replace(/\.webp$/, ""));
    for (const f of readdirSync(path.join(ROOT, "hilfe-intern/pdf"))) expect(intern.pdfs, f).toContain(f);
    expect(alleKurseUngefiltert()).toHaveLength(KURSE_OEFFENTLICH.length + 1);
  });

  it("importiert Mitarbeiter-Inhalte in keiner Client-Datei (sonst stünden sie in öffentlichen JavaScript-Dateien)", () => {
    const verboten = /inhalte-mitarbeiter|touren-mitarbeiter|hilfe\/kurse["']|\.\/kurse["']|zugriff-server/;
    const dateien: string[] = [];
    const laufen = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) laufen(p);
        else if (/\.(tsx?)$/.test(name) && !name.endsWith(".test.ts")) dateien.push(p);
      }
    };
    for (const d of ["app", "components", "lib"]) laufen(path.join(ROOT, d));
    const client = dateien.filter((d) => /^\s*["']use client["']/m.test(readFileSync(d, "utf8").slice(0, 400)));
    expect(client.length).toBeGreaterThan(20);
    for (const d of client) expect(readFileSync(d, "utf8"), path.relative(ROOT, d)).not.toMatch(verboten);
    // touren.ts (im Bundle jeder Seite mit Tour) und inhalte.ts (im Bundle des Hilfe-Menüs) bleiben frei davon.
    for (const f of ["components/tour/touren.ts", "components/tour/PageTour.tsx", "lib/hilfe/inhalte.ts", "lib/hilfe/zugriff.ts", "lib/hilfe/bilder-pfad.ts"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).not.toMatch(/from\s+["'][^"']*(inhalte-mitarbeiter|touren-mitarbeiter)/);
    }
  });
});
