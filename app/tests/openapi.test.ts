import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INQUIRY_LIMITS, PRODUCT_VALUES } from "@/lib/inquiry/validate";
import { INQUIRY_ERROR_CODES, openApiDocument } from "@/lib/openapi";

/** Hält die von Hand gepflegte OpenAPI-Beschreibung mit dem Code zusammen (ohne Infrastruktur). */
const doc = openApiDocument() as unknown as {
  openapi: string;
  paths: Record<string, Record<string, { operationId: string; tags: string[]; responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, { properties?: Record<string, { enum?: string[]; maxLength?: number }> }> };
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Pfad aus der Beschreibung auf die Route-Datei abbilden; `{name}` passt auf jeden `[…]`-Ordner. */
function routeFile(route: string): string | null {
  let dir = "app";
  for (const segment of route.split("/").filter(Boolean)) {
    if (!segment.startsWith("{")) {
      dir = path.join(dir, segment);
      continue;
    }
    const dynamic = existsSync(dir) ? readdirSync(dir).find((name) => name.startsWith("[")) : undefined;
    if (!dynamic) return null;
    dir = path.join(dir, dynamic);
  }
  return path.join(dir, "route.ts");
}

describe("OpenAPI-Beschreibung", () => {
  it("beschreibt jede Route der Anfrage-Schnittstelle, und jede beschriebene Route existiert", () => {
    expect(doc.openapi).toBe("3.1.0");
    for (const route of Object.keys(doc.paths)) {
      const file = routeFile(route);
      expect(file !== null && existsSync(file), `${route} → ${file}`).toBe(true);
      if (!file) continue;
      const source = readFileSync(file, "utf8");
      for (const method of Object.keys(doc.paths[route])) {
        expect(source, `${method.toUpperCase()} ${route}`).toMatch(new RegExp(`export (async )?function ${method.toUpperCase()}\\b`));
      }
    }
    const described = Object.keys(doc.paths).filter((p) => p.startsWith("/api/v1/"));
    const routes = sources("app/api/v1")
      .filter((f) => f.endsWith("route.ts") && !f.includes("openapi.json"))
      .map((f) => "/" + path.dirname(f).split(path.sep).slice(1).join("/").replace(/\[(\w+)\]/g, "{$1}"));
    expect(described.sort()).toEqual(routes.sort());
  });

  it("vergibt eindeutige operationIds und nennt zu jeder Operation eine Erfolgsantwort", () => {
    const ids = Object.values(doc.paths).flatMap((ops) => Object.values(ops).map((op) => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    for (const ops of Object.values(doc.paths)) {
      for (const op of Object.values(ops)) {
        expect(Object.keys(op.responses).some((status) => status.startsWith("2"))).toBe(true);
      }
    }
  });

  it("übernimmt Produktliste und Feldgrenzen aus dem Code", () => {
    const create = doc.components.schemas.InquiryCreate.properties!;
    expect(create.product.enum).toEqual(PRODUCT_VALUES);
    expect(create.description.maxLength).toBe(INQUIRY_LIMITS.description);
    const contact = doc.components.schemas.Contact.properties!;
    expect(contact.name.maxLength).toBe(INQUIRY_LIMITS.name);
    expect(contact.email.maxLength).toBe(INQUIRY_LIMITS.email);
  });

  it("führt jeden Fehlercode, den lib/inquiry und die Routen verwenden", () => {
    const used = new Set<string>();
    for (const file of [...sources("lib/inquiry"), ...sources("app/api/v1")]) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/(?:InquiryError\([^)]*?,\s*\d{3},\s*|inquiryError\(\d{3},\s*)"([a-z_]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(8);
    for (const code of used) expect(INQUIRY_ERROR_CODES, code).toContain(code);
  });

  it("verweist jede $ref auf ein vorhandenes Schema", () => {
    const text = JSON.stringify(doc);
    for (const m of text.matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)) {
      expect(doc.components.schemas[m[1]], m[1]).toBeDefined();
    }
  });
});
