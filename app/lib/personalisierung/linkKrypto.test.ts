import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { entschluesselToken, linkSchluessel, verschluesselToken } from "./linkKrypto";

const token = randomBytes(32).toString("hex");
const id = "11111111-1111-4111-8111-111111111111";

describe("Verschlüsselung der Kundenlinks", () => {
  const key = linkSchluessel({ key: randomBytes(32).toString("base64"), secret: "egal" });

  it("verschlüsselt und entschlüsselt wieder; Chiffretext enthält das Token nicht und ist je Aufruf anders", () => {
    const a = verschluesselToken(token, id, key);
    const b = verschluesselToken(token, id, key);
    expect(a).toMatch(/^v1:/);
    expect(a).not.toContain(token);
    expect(a).not.toBe(b);
    expect(entschluesselToken(a, id, key)).toBe(token);
  });

  it("liefert null bei falscher Link-ID, falschem Schlüssel, Manipulation oder fehlendem Wert", () => {
    const c = verschluesselToken(token, id, key);
    expect(entschluesselToken(c, "22222222-2222-4222-8222-222222222222", key)).toBeNull();
    expect(entschluesselToken(c, id, linkSchluessel({ key: randomBytes(32).toString("base64"), secret: "x" }))).toBeNull();
    const kaputt = c.slice(0, -4) + (c.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(entschluesselToken(kaputt, id, key)).toBeNull();
    expect(entschluesselToken(null, id, key)).toBeNull();
    expect(entschluesselToken("v1:abc", id, key)).toBeNull();
  });

  it("leitet ohne PERS_LINK_KEY stabil aus dem Geheimnis ab und prüft die Länge des Schlüssels", () => {
    const a = linkSchluessel({ secret: "geheimnis-1" });
    expect(a.length).toBe(32);
    expect(a.equals(linkSchluessel({ secret: "geheimnis-1" }))).toBe(true);
    expect(a.equals(linkSchluessel({ secret: "geheimnis-2" }))).toBe(false);
    expect(() => linkSchluessel({ key: Buffer.alloc(16).toString("base64"), secret: "x" })).toThrow(/32 Byte/);
  });
});
