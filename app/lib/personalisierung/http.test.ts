import { describe, expect, it } from "vitest";
import { alsStaff, leseJson, leseUpload } from "./http";

/** Rumpf, der nach `gesamt` Bytes endet und mitzählt, wie viel tatsächlich gelesen wurde. */
function stromRequest(gesamt: number, opt: { laenge?: boolean; typ: string }) {
  const zaehler = { gelesen: 0 };
  const stueck = 64 * 1024;
  let gesendet = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (gesendet >= gesamt) return c.close();
      const n = Math.min(stueck, gesamt - gesendet);
      gesendet += n;
      zaehler.gelesen += n;
      c.enqueue(new Uint8Array(n));
    },
  });
  const headers: Record<string, string> = { "content-type": opt.typ };
  if (opt.laenge) headers["content-length"] = String(gesamt);
  const req = new Request("http://localhost/x", { method: "POST", headers, body, duplex: "half" } as RequestInit & { duplex: "half" });
  return { req, zaehler };
}

describe("Rumpfgrenzen vor dem Puffern", () => {
  it("lehnt per Content-Length ab, ohne den Rumpf zu lesen", async () => {
    const { req, zaehler } = stromRequest(50 * 1024 * 1024, { laenge: true, typ: "application/json" });
    await expect(leseJson(req, 1024)).rejects.toMatchObject({ status: 413 });
    expect(zaehler.gelesen).toBeLessThanOrEqual(64 * 1024); // höchstens der Vorlesepuffer des Streams, nicht der Rumpf
  });

  it("bricht ohne Content-Length (chunked) nach Überschreiten der Grenze ab", async () => {
    const { req, zaehler } = stromRequest(500 * 1024 * 1024, { typ: "application/json" });
    await expect(leseJson(req, 128 * 1024)).rejects.toMatchObject({ status: 413 });
    // gelesen wurde nur wenig mehr als die Grenze, nicht die 500 MB
    expect(zaehler.gelesen).toBeLessThan(2 * 1024 * 1024);
  });

  it("liest gültiges JSON unter der Grenze", async () => {
    const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: 1 }) });
    expect(await leseJson(req, 1024)).toEqual({ a: 1 });
  });

  it("Upload: große Datei wird per Content-Length vor dem Puffern abgelehnt", async () => {
    const { req, zaehler } = stromRequest(200 * 1024 * 1024, { laenge: true, typ: "multipart/form-data; boundary=x" });
    await expect(leseUpload(req, "datei", 10 * 1024 * 1024)).rejects.toMatchObject({ status: 413 });
    expect(zaehler.gelesen).toBeLessThanOrEqual(64 * 1024); // höchstens der Vorlesepuffer des Streams, nicht der Rumpf
  });

  it("Upload: Stream ohne Content-Length wird mit Zähler abgebrochen", async () => {
    const { req, zaehler } = stromRequest(400 * 1024 * 1024, { typ: "multipart/form-data; boundary=x" });
    await expect(leseUpload(req, "datei", 1024 * 1024)).rejects.toMatchObject({ status: 413 });
    expect(zaehler.gelesen).toBeLessThan(4 * 1024 * 1024);
  });

  it("Upload: gültige Datei wird gelesen", async () => {
    const fd = new FormData();
    fd.set("datei", new File([new Uint8Array([1, 2, 3])], "a.bin"));
    const req = new Request("http://localhost/x", { method: "POST", body: fd });
    const r = await leseUpload(req, "datei", 1024);
    expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(r.name).toBe("a.bin");
  });

  it("Upload: kein multipart ergibt 400", async () => {
    const req = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
    await expect(leseUpload(req, "datei", 1024)).rejects.toMatchObject({ status: 400 });
  });
});

describe("Ursprungsprüfung für Staff-Schreibaufrufe (CSRF)", () => {
  const fn = async () => new Response("ok");
  it("lehnt fremden Origin bei POST ab (auch multipart und ohne Rumpf), bevor irgendetwas geprüft wird", async () => {
    for (const body of [undefined, new FormData()]) {
      const req = new Request("http://localhost:3000/api/personalisierung/staff/dateien", {
        method: "POST",
        headers: { origin: "https://boese.example", host: "localhost:3000" },
        body,
      });
      const res = await alsStaff(req, "test", fn);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("ursprung");
    }
  });
  it("lehnt Sec-Fetch-Site cross-site ohne Origin ab, auch bei DELETE und PUT", async () => {
    for (const method of ["DELETE", "PUT", "PATCH"]) {
      const req = new Request("http://localhost:3000/x", { method, headers: { "sec-fetch-site": "cross-site", host: "localhost:3000" } });
      expect((await alsStaff(req, "test", fn)).status).toBe(403);
    }
  });
});
