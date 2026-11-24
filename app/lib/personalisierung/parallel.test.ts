import { describe, expect, it } from "vitest";
import { mitRenderPlatz, renderAuslastung } from "./parallel";

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Begrenzer für gleichzeitige Erzeugungen", () => {
  it("lehnt über der Grenze mit 503 und deutscher Meldung ab", async () => {
    let freigeben!: () => void;
    const blockiert = new Promise<void>((r) => (freigeben = r));
    const l1 = mitRenderPlatz(() => blockiert);
    const l2 = mitRenderPlatz(() => blockiert);
    await expect(mitRenderPlatz(async () => 1)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Bitte gleich nochmal versuchen") });
    expect(renderAuslastung().aktiv).toBe(2);
    freigeben();
    await Promise.all([l1, l2]);
    expect(renderAuslastung()).toEqual({ aktiv: 0, wartend: 0 });
    expect(await mitRenderPlatz(async () => 7)).toBe(7);
  });

  it("wartet auf Wunsch, bis ein Platz frei wird, und gibt bei Fehlern den Platz frei", async () => {
    let freigeben!: () => void;
    const blockiert = new Promise<void>((r) => (freigeben = r));
    const l1 = mitRenderPlatz(() => blockiert);
    const l2 = mitRenderPlatz(() => blockiert);
    const wartend = mitRenderPlatz(async () => "fertig", { warteMs: 5000 });
    await warte(20);
    expect(renderAuslastung().wartend).toBe(1);
    freigeben();
    expect(await wartend).toBe("fertig");
    await Promise.all([l1, l2]);
    await expect(mitRenderPlatz(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(renderAuslastung()).toEqual({ aktiv: 0, wartend: 0 });
  });

  it("gibt nach Ablauf der Wartezeit 503 zurück", async () => {
    let freigeben!: () => void;
    const blockiert = new Promise<void>((r) => (freigeben = r));
    const l = [mitRenderPlatz(() => blockiert), mitRenderPlatz(() => blockiert)];
    await expect(mitRenderPlatz(async () => 1, { warteMs: 30 })).rejects.toMatchObject({ status: 503 });
    freigeben();
    await Promise.all(l);
  });
});
