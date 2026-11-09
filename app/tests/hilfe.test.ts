import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOWNLOADS, FRAGEN, KURSE, lektionsPfad } from "@/lib/hilfe/inhalte";
import { BILDER } from "@/lib/hilfe/bilder";
import { hilfeStartMarkdown, kursMarkdown, lektionMarkdown, llmsFullTxt, llmsTxt } from "@/lib/hilfe/markdown";
import { faqSeite, kursDaten, lektionDaten, serialisieren } from "@/lib/hilfe/jsonld";
import { TOUREN, TOUR_KNOPF } from "@/components/tour/touren";

const ROOT = path.resolve(__dirname, "..");

/** Quelltexte der Oberfläche (ohne die Hilfe selbst) — dort müssen zitierte Beschriftungen vorkommen. */
function uiQuelltext(): string {
  const dateien: string[] = [];
  const laufen = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!["hilfe", "hilfe-md", "tour"].includes(name)) laufen(p);
      } else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts")) {
        dateien.push(p);
      }
    }
  };
  for (const d of ["app", "components", "lib"]) laufen(path.join(ROOT, d));
  return dateien.map((d) => readFileSync(d, "utf8")).join("\n");
}

/** Zitate, die bewusst keine Beschriftung der App sind (Beispieltexte, Fachbegriffe). */
const KEINE_BESCHRIFTUNG = new Set([
  "wie letztes Mal",
  "Schriften einbetten",
  ".md",
  "Rechnung gespeichert — der Versand folgt …",
  "Über …",
  "Zurückgezogen",
]);

function zitate(text: string): string[] {
  return [...text.matchAll(/„([^“]+)“/g)].map((m) => m[1]);
}

describe("Hilfe-Inhalte", () => {
  it("hat eindeutige Slugs und kurze Beschreibungen", () => {
    expect(new Set(KURSE.map((k) => k.slug)).size).toBe(KURSE.length);
    for (const k of KURSE) {
      expect(new Set(k.lektionen.map((l) => l.slug)).size).toBe(k.lektionen.length);
      expect(k.kurz.length).toBeLessThanOrEqual(170);
      for (const l of k.lektionen) {
        expect(l.slug).toMatch(/^[a-z0-9-]+$/);
        expect(l.kurz.length, l.slug).toBeLessThanOrEqual(170);
        expect(l.schritte.length, l.slug).toBeGreaterThanOrEqual(3);
        expect(l.schritte.length, l.slug).toBeLessThanOrEqual(7);
        if (l.quiz) expect(l.quiz.antworten.filter((a) => a.richtig)).toHaveLength(1);
      }
    }
  });

  it("zitiert nur Beschriftungen, die es in der App wirklich gibt", () => {
    const quelle = uiQuelltext();
    const fehlend = new Set<string>();
    const texte = [
      ...KURSE.flatMap((k) => k.lektionen.flatMap((l) => [l.einleitung, ...l.schritte, l.gutZuWissen ?? "", ...(l.details ?? []).flatMap((d) => d.punkte)])),
      ...FRAGEN.map((f) => f.antwort),
      ...Object.values(TOUREN).flatMap((t) => t.schritte.map((s) => s.text)),
    ];
    for (const z of texte.flatMap(zitate)) {
      if (KEINE_BESCHRIFTUNG.has(z)) continue;
      if (!quelle.includes(z)) fehlend.add(z);
    }
    expect([...fehlend]).toEqual([]);
  });

  it("verweist nur auf vorhandene Bilder und PDFs", () => {
    for (const k of KURSE) {
      for (const l of k.lektionen) {
        for (const b of l.bilder ?? []) {
          expect(BILDER[b.name], `Maße für ${b.name}`).toBeDefined();
          expect(existsSync(path.join(ROOT, "public/hilfe/img", `${b.name}.webp`)), b.name).toBe(true);
        }
      }
    }
    for (const d of DOWNLOADS) expect(existsSync(path.join(ROOT, "public", d.href)), d.href).toBe(true);
  });

  it("hat für jede Tour-Station einen data-tour-Anker im Code", () => {
    const quelle = uiQuelltext() + readFileSync(path.join(ROOT, "components/tour/PageTour.tsx"), "utf8") + readFileSync(path.join(ROOT, "components/hilfe/HilfeMenue.tsx"), "utf8");
    for (const tour of Object.values(TOUREN)) {
      for (const s of tour.schritte) {
        if (!s.ziel || s.ziel === TOUR_KNOPF) continue;
        const direkt = quelle.includes(`data-tour="${s.ziel}"`);
        const fotoband = s.ziel.startsWith("fb-") && quelle.includes("data-tour={`fb-${p.id}`}") && quelle.includes(`id: "${s.ziel.slice(3)}"`);
        expect(direkt || fotoband, s.ziel).toBe(true);
      }
    }
  });
});

describe("Markdown für KI-Assistenten", () => {
  it("llms.txt folgt der Konvention und verlinkt jede Lektion als .md", () => {
    const txt = llmsTxt();
    expect(txt.startsWith("# dmp druckraum\n\n> ")).toBe(true);
    for (const k of KURSE) for (const l of k.lektionen) expect(txt).toContain(`${lektionsPfad(k, l)}.md`);
    expect(txt).not.toMatch(/undefined|\[object Object\]/);
  });

  it("llms-full.txt enthält alle Lektionen, Fragen und Codebeispiele", () => {
    const txt = llmsFullTxt();
    for (const k of KURSE) for (const l of k.lektionen) expect(txt).toContain(l.titel);
    for (const f of FRAGEN) expect(txt).toContain(f.frage);
    expect(txt).toContain("```bash");
    expect(txt).not.toMatch(/undefined|\[object Object\]/);
  });

  it("erzeugt Seiten-Markdown ohne Lücken", () => {
    expect(hilfeStartMarkdown()).toContain("## Häufige Fragen");
    for (const k of KURSE) {
      expect(kursMarkdown(k)).toContain(`# ${k.titel}`);
      for (const l of k.lektionen) expect(lektionMarkdown(k, l)).toMatch(/## Schritt für Schritt\n\n1\. /);
    }
  });
});

describe("Strukturierte Daten", () => {
  it("baut FAQPage, Course und HowTo und maskiert spitze Klammern", () => {
    expect(faqSeite().mainEntity).toHaveLength(FRAGEN.length);
    const kurs = KURSE[0];
    expect(kursDaten(kurs)["@type"]).toBe("Course");
    const howto = lektionDaten(kurs, kurs.lektionen[0]) as { step: unknown[] };
    expect(howto.step).toHaveLength(kurs.lektionen[0].schritte.length);
    expect(serialisieren({ x: "</script>" })).not.toContain("</script>");
  });
});
