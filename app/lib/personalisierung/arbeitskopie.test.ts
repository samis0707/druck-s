/** Arbeitskopie (Autospeichern), Veröffentlichen und Virenscan-Sperre im Batch-Modus (Postgres). */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const speicher = new Map<string, Buffer>();
vi.mock("@/lib/storageFiles", async (orig) => {
  const echt = await orig<typeof import("@/lib/storageFiles")>();
  return {
    ...echt,
    putRequestFile: async (key: string, bytes: Buffer) => void speicher.set(key, Buffer.from(bytes)),
    getRequestFile: async (key: string) => {
      const b = speicher.get(key);
      if (!b) throw new Error("nicht da");
      return b;
    },
  };
});
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ send: async () => ({}) }), bucketName: () => "test" }));
vi.mock("@/lib/clamav", () => ({ scanBuffer: async () => ({ status: "CLEAN" }) }));

import { config } from "@/lib/config";
import { query } from "@/lib/db";
import { PersFehler } from "./dateien";
import { dateiBytes, erstelleVorlage, holeArbeitskopie, holeVorlage, listeVorlagen, speichereArbeitskopie, speichereDatei, veroeffentlicheVorlage, verwerfeArbeitskopie } from "./repo";
import { testDesign, testVorlage } from "./test-support";

const tag = randomUUID().slice(0, 8);
let designId = "";

beforeAll(async () => {
  designId = (await speichereDatei("design", "d.pdf", await testDesign(91, 61), null)).datei.id;
});
afterAll(async () => {
  config.clamav.mode = "daemon";
  await query("DELETE FROM pers_templates WHERE name LIKE $1", [`%${tag}%`]);
});

const vorlage = (name: string, extra: Record<string, unknown> = {}) => testVorlage({ name: `${name} ${tag}`, design: { dateiId: designId, vorne: 1, hinten: 2, mitBeschnitt: true }, ...extra });

describe("Arbeitskopie", () => {
  it("speichert ohne neue Version, auch halbfertig; Veröffentlichen prüft streng und versioniert", async () => {
    const d = await erstelleVorlage(vorlage("Arbeit"), { userId: null, status: "aktiv", sichtbarkeit: "oeffentlich" });
    expect(d.aktuelleVersion).toBe(1);
    // halbfertig: Feld verweist auf unbekannte Eingabe (würde das Schema ablehnen), Autospeichern klappt trotzdem
    const halb = { ...d.vorlage, felder: [{ ...d.vorlage.felder[0], vorlage: "{{gibt_es_nicht}}" }] };
    expect(await speichereArbeitskopie(d.id, halb)).toBe(true);
    expect((await holeVorlage(d.id))!.aktuelleVersion).toBe(1);
    expect((await holeArbeitskopie(d.id))!.spec).toMatchObject({ name: `Arbeit ${tag}` });
    const karte = (await listeVorlagen()).find((k) => k.id === d.id)!;
    expect(karte).toMatchObject({ ungespeichert: true, designDateiId: designId, kundenAnzahl: 0 });
    expect(karte.endformat).toEqual({ breite: 85, hoehe: 55 });
    await expect(veroeffentlicheVorlage(d.id, { userId: null })).rejects.toMatchObject({ code: "schema" });
    expect((await holeVorlage(d.id))!.aktuelleVersion).toBe(1);
    // ordentliche Änderung: neue Version, Arbeitskopie leer
    await speichereArbeitskopie(d.id, { ...d.vorlage, beschreibung: "neu" });
    const v2 = await veroeffentlicheVorlage(d.id, { userId: null });
    expect(v2!.aktuelleVersion).toBe(2);
    expect(v2!.vorlage.beschreibung).toBe("neu");
    expect((await holeVorlage(d.id, 1))!.vorlage.beschreibung).toBe(""); // Version 1 unverändert
    expect(await holeArbeitskopie(d.id)).toBeNull();
  });

  it("lehnt Unsinn ab und kann verworfen werden", async () => {
    const d = await erstelleVorlage(vorlage("Verwerfen"), { userId: null });
    await expect(speichereArbeitskopie(d.id, "text")).rejects.toBeInstanceOf(PersFehler);
    await expect(speichereArbeitskopie(d.id, { name: "" })).rejects.toBeInstanceOf(PersFehler);
    await expect(speichereArbeitskopie(d.id, { name: "x".repeat(130) })).rejects.toBeInstanceOf(PersFehler);
    expect(await speichereArbeitskopie(randomUUID(), { name: "x" })).toBe(false);
    await speichereArbeitskopie(d.id, { ...d.vorlage, name: `Anderer Name ${tag}` });
    expect((await listeVorlagen()).find((k) => k.id === d.id)!.name).toBe(`Anderer Name ${tag}`);
    expect(await verwerfeArbeitskopie(d.id)).toBe(true);
    expect((await listeVorlagen()).find((k) => k.id === d.id)!.name).toBe(`Verwerfen ${tag}`);
  });
});

describe("Virenscan im Batch-Modus", () => {
  it("Dateien bleiben bis zum Scan nutzbar, aber die Vorlage lässt sich nicht veröffentlichen; INFECTED wird nie geliefert", async () => {
    config.clamav.mode = "batch";
    const up = await speichereDatei("design", "neu.pdf", await testDesign(91, 61), null);
    expect(up.datei.scanStatus).toBe("PENDING");
    config.clamav.mode = "daemon";
    const v = vorlage("Scan", { design: { dateiId: up.datei.id, vorne: 1, hinten: 2, mitBeschnitt: true } });
    // Entwurf anlegen und bearbeiten funktioniert (Mitarbeiter werden nicht blockiert)
    const d = await erstelleVorlage(v, { userId: null });
    expect(await dateiBytes(up.datei.id)).not.toBeNull();
    // Veröffentlichen: freundlicher Hinweis
    await expect(veroeffentlicheVorlage(d.id, { userId: null })).rejects.toMatchObject({ code: "scan_ausstehend", status: 409 });
    await expect(erstelleVorlage({ ...v, name: `Scan2 ${tag}` }, { userId: null, status: "aktiv" })).rejects.toMatchObject({ code: "scan_ausstehend" });
    // Scan fertig (so setzt es scripts/scan-pending.mjs)
    await query("UPDATE pers_files SET scan_status = 'CLEAN' WHERE id = $1", [up.datei.id]);
    expect((await veroeffentlicheVorlage(d.id, { userId: null }))!.status).toBe("aktiv");
    // später als befallen erkannt: nicht mehr ausgeliefert, nicht mehr veröffentlichbar
    await query("UPDATE pers_files SET scan_status = 'INFECTED' WHERE id = $1", [up.datei.id]);
    expect(await dateiBytes(up.datei.id)).toBeNull();
    await expect(veroeffentlicheVorlage(d.id, { userId: null })).rejects.toMatchObject({ code: "malware" });
  });
});
