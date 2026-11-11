import { describe, expect, it } from "vitest";
import { generateCode, hashCode } from "./codes";
import { inquiryMessage } from "./messages";
import { maskEmail, normalizeCode, PRODUCT_VALUES, validateContact, validateInquiry } from "./validate";

describe("offene Anfrage: Eingaben", () => {
  it("nimmt eine vollständige Anfrage an und räumt Felder auf", () => {
    const parsed = validateInquiry({
      product: "flyer",
      description: "  500 Flyer A5\nbeidseitig  ",
      reference: "  Sommerfest  ",
      contact: { name: " Anna  Beispiel ", email: "Anna@Example.ORG", organisation: "", phone: "07131 / 12 34-0" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.description).toBe("500 Flyer A5\nbeidseitig");
    expect(parsed.value.reference).toBe("Sommerfest");
    expect(parsed.value.contact).toEqual({ name: "Anna Beispiel", email: "anna@example.org", organisation: null, phone: "07131 / 12 34-0" });
  });

  it("erlaubt eine Anfrage ohne Kontakt (folgt beim Code-Versand)", () => {
    const parsed = validateInquiry({ product: "other", description: "Preis für 20 Namensschilder?" });
    expect(parsed.ok && parsed.value.contact).toBeNull();
  });

  it("sammelt alle Fehler in einem Zug", () => {
    const parsed = validateInquiry({ product: "raumschiff", description: " ", contact: { name: "", email: "kein-at", phone: "abc" } });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual([
      `product must be one of: ${PRODUCT_VALUES.join(", ")}`,
      "description is required",
      "contact.name is required",
      "contact.email must be a valid email address",
      "contact.phone must be a phone number",
    ]);
  });

  it("lehnt Nicht-Objekte, zu lange Texte und falsche Typen ab", () => {
    expect(validateInquiry("flyer").ok).toBe(false);
    expect(validateInquiry([]).ok).toBe(false);
    expect(validateInquiry({ product: "flyer", description: "x".repeat(5001) }).ok).toBe(false);
    expect(validateContact({ name: 7, email: "a@b.de" }).ok).toBe(false);
    expect(validateContact(null).ok).toBe(false);
  });

  it("entfernt Steuerzeichen und Zeilenumbrüche aus einzeiligen Feldern", () => {
    const parsed = validateContact({ name: "Anna\r\nBcc: x@y.de\u0000", email: "a@b.de" });
    expect(parsed.ok && parsed.value.name).toBe("Anna Bcc: x@y.de");
  });
});

describe("offene Anfrage: Code", () => {
  it("erzeugt sechs Ziffern, auch mit führenden Nullen", () => {
    for (let i = 0; i < 200; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("bindet den Hash an den Entwurf", () => {
    const a = hashCode("11111111-1111-4111-8111-111111111111", "123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode("11111111-1111-4111-8111-111111111111", "123456")).toBe(a);
    expect(hashCode("22222222-2222-4222-8222-222222222222", "123456")).not.toBe(a);
    expect(hashCode("11111111-1111-4111-8111-111111111111", "123457")).not.toBe(a);
  });

  it("normalisiert die Eingabe und verwirft alles andere", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode(123456)).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });

  it("verkürzt E-Mail-Adressen und kennt deutsche Meldungen", () => {
    expect(maskEmail("anna@example.org")).toBe("a•••@example.org");
    expect(maskEmail("kaputt")).toBe("•••");
    expect(inquiryMessage("rate_limited", "x")).toContain("Zu viele Versuche");
    expect(inquiryMessage("gibt-es-nicht", "Ersatz")).toBe("Ersatz");
  });
});
