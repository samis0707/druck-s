import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query } from "../db";
import { getSetting } from "../settings";
import { parseVorlage } from "../personalisierung/schema";
import { KUNDEN_RICHTPREIS_KEY, PRODUKTZUORDNUNG_KEY } from "../kalkulation/kundenRichtpreis";
import { PDFDocument } from "pdf-lib";
import { beispielDesign, beispielVorlage, seedKalkulation, seedMitarbeiter, seedPersonalisierung, seedRichtpreis } from "./seed";

// Der Seed legt Daten an: nur gegen die eigene Vorschau-Testdatenbank (DATABASE_URL=…/dam_vorschau) ausführen.
const dbName = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname;
  } catch {
    return "";
  }
})();
const mitDb = /vorschau/.test(dbName);

describe("Beispielvorlage (ohne Datenbank)", () => {
  it("ist gültig und das Design-PDF hat zwei Seiten", async () => {
    const v = beispielVorlage("11111111-1111-4111-8111-111111111111");
    expect(parseVorlage(v).ok).toBe(true);
    const pdf = await PDFDocument.load(await beispielDesign());
    expect(pdf.getPageCount()).toBe(2);
  });
});

describe.skipIf(!mitDb)("Seed gegen dam_vorschau", () => {
  beforeAll(async () => {
    await query("DELETE FROM kalkulation_bereiche").catch(() => {});
  });
  afterAll(async () => {
    await getPool().end();
  });

  it("legt Mitarbeiter idempotent an und fasst keine anderen Nutzer an", async () => {
    await query(`INSERT INTO "user" (id, email, name, role, status) VALUES (gen_random_uuid(), 'kunde-vorschau@example.org', 'K', 'customer', 'customer') ON CONFLICT (email) DO NOTHING`);
    await seedMitarbeiter(["vorschau-a@example.org", "kunde-vorschau@example.org"]);
    await seedMitarbeiter(["vorschau-a@example.org", "kunde-vorschau@example.org"]);
    const r = await query(`SELECT email, role, "emailVerified" FROM "user" WHERE email IN ('vorschau-a@example.org','kunde-vorschau@example.org') ORDER BY email`);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.role === "staff" && x.emailVerified === true)).toBe(true);
    expect((await query(`SELECT 1 FROM "user" WHERE email = 'vorschau-b@example.org'`)).rowCount).toBe(0);
  });

  it("lädt Stammdaten einmal und setzt Richtpreis-Schalter und Zuordnung", async () => {
    expect(await seedKalkulation()).toBe("geladen");
    expect(await seedKalkulation()).toBe("vorhanden");
    await seedRichtpreis();
    await seedRichtpreis();
    expect((await getSetting(KUNDEN_RICHTPREIS_KEY))?.value).toBe("an");
    expect(JSON.parse((await getSetting(PRODUKTZUORDNUNG_KEY))!.value)).toEqual({ flyer: ["A-FLYER"], "business-card": ["A-VISITENKARTE"] });
  });

  it("überspringt die Personalisierung ohne Speicher", async () => {
    // S3_ENDPOINT zeigt in diesem Test auf keinen laufenden Dienst (Standard localhost:9000).
    if (process.env.S3_ENDPOINT) return;
    expect(await seedPersonalisierung()).toBe("uebersprungen");
  });
});
