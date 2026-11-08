import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransition } from "../requests/events";
import { STATUSES, TRANSITIONS } from "../requests/types";
import { originBadge, STAFF_STATUS, CUSTOMER_STATUS } from "../ui-text";
import { authenticatePartner, requirePartner, type PartnerKeyRow } from "./auth";
import { checkFileUrl, fetchPartnerFile, isBlockedAddress, PartnerFileError, safeLookup } from "./fetchFile";
import { partnerFreeText, partnerMeta, partnerMetaRows } from "./freeText";
import { bearerKey, hashMatches, hashPartnerKey, newPartnerKey, partnerKeyPrefix } from "./keys";
import { decryptWebhookSecret, encryptWebhookSecret } from "./secrets";
import { isIsoDate, safeFileName, validatePartnerRequest, type PartnerRequestBody } from "./validate";
import {
  backoffMinutes,
  buildWebhookPayload,
  isPermanentFailure,
  MAX_ATTEMPTS,
  PARTNER_VISIBLE_STATUSES,
  shouldNotifyPartner,
  signWebhook,
} from "./webhook";
import * as script from "../../scripts/partner-key.mjs";

/** Genau der Body, den Seeräuber digital (`partnerAuftrag`, src/lib/druck/druck-s.test.ts) erzeugt. */
const BODY = {
  partnerRef: "90000000-0000-4000-8000-000000000001",
  customer: { email: " Anna@Example.org ", name: "Anna", organisation: "Quartierszentrum Böckingen", phone: "07131 1234" },
  product: { hint: "poster", label: "Plakat A2", widthMm: 420, heightMm: 594, bleedMm: 3, sides: 1, paper: "Plakatpapier 135 g" },
  quantity: 10,
  wishDate: "2026-11-20",
  delivery: { mode: "abholung", address: null },
  note: "Bitte matt",
  event: "Kinderbasar, Sa, 14.11.",
  printerCheck: false,
  preflight: "ok",
  file: {
    url: "https://bciteqheblrwawokcvjg.supabase.co/storage/v1/object/sign/druckdaten/x/p-druck.pdf?token=abc",
    name: "plakat-druck.pdf",
    mime: "application/pdf",
    size: 2048,
    sha256: "CD".repeat(32),
  },
  source: { system: "seeraeuber-digital", publication: "Seeräuber-Blättle", link: "https://app.linqr.de/verlag/auftraege/x" },
};

function valid(overrides: Record<string, unknown> = {}): PartnerRequestBody {
  const r = validatePartnerRequest({ ...structuredClone(BODY), ...overrides });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
}

function errorsOf(input: unknown): string[] {
  const r = validatePartnerRequest(input);
  return r.ok ? [] : r.errors;
}

describe("Partner-Keys und Auth", () => {
  const { key, hash, prefix } = newPartnerKey();
  const row: PartnerKeyRow = {
    id: "p1",
    slug: "seeraeuber",
    name: "Seeräuber digital",
    webhookUrl: "https://app.linqr.de/api/druck-s/webhook",
    fileHosts: ["bciteqheblrwawokcvjg.supabase.co"],
    keyHash: hash,
    active: true,
  };

  it("Format, Hash und Präfix", () => {
    expect(key).toMatch(/^dmp_[0-9a-f]{64}$/);
    expect(hash).toBe(hashPartnerKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(partnerKeyPrefix(key)).toBe(prefix);
    expect(hashMatches(hash, key)).toBe(true);
    expect(hashMatches(hash, newPartnerKey().key)).toBe(false);
    expect(hashMatches("kurz", key)).toBe(false);
  });

  it("Bearer-Header lesen", () => {
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`bearer ${key}`)).toBe(key);
    expect(bearerKey(key)).toBeNull();
    expect(bearerKey(`Basic ${key}`)).toBeNull();
    expect(bearerKey("Bearer dmp_123")).toBeNull();
    expect(bearerKey(`Bearer ${key.toUpperCase()}`)).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });

  it("authentifiziert nur aktiven Partner mit passendem Hash, sucht über das Präfix", async () => {
    const seen: string[] = [];
    const lookup = async (p: string) => {
      seen.push(p);
      return [row];
    };
    expect(await authenticatePartner(`Bearer ${key}`, lookup)).toEqual({
      id: "p1",
      slug: "seeraeuber",
      name: "Seeräuber digital",
      webhookUrl: row.webhookUrl,
      fileHosts: row.fileHosts,
    });
    expect(seen).toEqual([prefix]);
    // gleiches Präfix, anderer Key
    const fake = `${prefix}${"0".repeat(64 - 8)}`;
    expect(fake).toMatch(/^dmp_[0-9a-f]{64}$/);
    expect(await authenticatePartner(`Bearer ${fake}`, lookup)).toBeNull();
    expect(await authenticatePartner(`Bearer ${key}`, async () => [{ ...row, active: false }])).toBeNull();
    expect(await authenticatePartner(`Bearer ${key}`, async () => [])).toBeNull();
    expect(await authenticatePartner(null, lookup)).toBeNull();
  });

  it("requirePartner: 401 mit WWW-Authenticate, sonst Partner", async () => {
    const lookup = async () => [row];
    const denied = await requirePartner(new Request("http://x/api/partner/requests"), lookup);
    expect("error" in denied && denied.error.status).toBe(401);
    expect("error" in denied && denied.error.headers.get("www-authenticate")).toContain("Bearer");
    const ok = await requirePartner(
      new Request("http://x/api/partner/requests", { headers: { authorization: `Bearer ${key}` } }),
      lookup,
    );
    expect("partner" in ok && ok.partner.slug).toBe("seeraeuber");
  });
});

describe("Validierung", () => {
  it("akzeptiert den Seeräuber-Body und normalisiert", () => {
    const v = valid();
    expect(v.customer.email).toBe("anna@example.org");
    expect(v.file.sha256).toBe("cd".repeat(32));
    expect(v.product.hint).toBe("poster");
    expect(v.delivery).toEqual({ mode: "abholung", address: null });
    expect(v.source.system).toBe("seeraeuber-digital");
  });

  it("meldet alle Fehler auf einmal", () => {
    const errs = errorsOf({
      ...BODY,
      partnerRef: "",
      customer: { ...BODY.customer, email: "kaputt" },
      product: { ...BODY.product, hint: "rakete", sides: 3 },
      quantity: 0,
      wishDate: "2026-02-30",
      file: { ...BODY.file, sha256: "xyz", size: 200 * 1024 * 1024, url: "http://evil.example/x" },
    });
    expect(errs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("partnerRef"),
        expect.stringContaining("customer.email"),
        expect.stringContaining("product.hint"),
        expect.stringContaining("product.sides"),
        expect.stringContaining("quantity"),
        expect.stringContaining("wishDate"),
        expect.stringContaining("file.sha256"),
        expect.stringContaining("file.size"),
        expect.stringContaining("https"),
      ]),
    );
  });

  it("Lieferung braucht eine Adresse; Abholung ignoriert sie", () => {
    expect(errorsOf({ ...BODY, delivery: { mode: "lieferung", address: null } })).toEqual([
      "delivery.address is required",
    ]);
    expect(valid({ delivery: { mode: "lieferung", address: "Hauptstr. 1\n74072 Heilbronn" } }).delivery.address).toBe(
      "Hauptstr. 1\n74072 Heilbronn",
    );
    expect(valid({ delivery: { mode: "abholung", address: "egal" } }).delivery.address).toBeNull();
    expect(errorsOf({ ...BODY, delivery: { mode: "post" } })).toEqual([expect.stringContaining("delivery.mode")]);
  });

  it("weitere Grenzfälle", () => {
    expect(errorsOf(null)).toEqual(["body must be a JSON object"]);
    expect(errorsOf([])).toEqual(["body must be a JSON object"]);
    expect(errorsOf({ ...BODY, partnerRef: "a/b" })).toEqual([expect.stringContaining("partnerRef")]);
    expect(errorsOf({ ...BODY, file: { ...BODY.file, url: "https://u:p@x.example/f" } })).toEqual([
      "file.url must not contain credentials",
    ]);
    expect(errorsOf({ ...BODY, customer: { ...BODY.customer, name: "A\u0000B" } })).toEqual([
      "customer.name contains control characters",
    ]);
    expect(errorsOf({ ...BODY, printerCheck: "ja" })).toEqual(["printerCheck must be a boolean"]);
    expect(errorsOf({ ...BODY, preflight: "super" })).toEqual([expect.stringContaining("preflight")]);
    expect(valid({ wishDate: null, note: "  ", preflight: null }).note).toBeNull();
    expect(valid({ source: { system: "x" } }).source).toEqual({ system: "x", publication: null, link: null });
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
  });

  it("Dateiname ohne Pfad und Steuerzeichen", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\tmp\\a.pdf")).toBe("a.pdf");
    expect(safeFileName("..")).toBe("partner-datei");
    expect(valid({ file: { ...BODY.file, name: "x/y/druck.pdf" } }).file.name).toBe("druck.pdf");
  });
});

describe("Freitext und Metadaten", () => {
  it("baut den Freitext aus Produkt, Auflage, Wunschtermin, Lieferung und Hinweis", () => {
    expect(partnerFreeText(valid(), "Seeräuber digital")).toBe(
      [
        "Auftrag über Seeräuber digital (Seeräuber-Blättle) für Quartierszentrum Böckingen",
        "Produkt: Plakat A2 – 420 × 594 mm, 3 mm Beschnitt, einseitig, Plakatpapier 135 g",
        "Auflage: 10 Stück",
        "Wunschtermin: 20.11.2026",
        "Übergabe: Abholung",
        "Termin: Kinderbasar, Sa, 14.11.",
        "Kontakt: Anna, anna@example.org, 07131 1234",
        "Druckvorbereitung beim Partner: passt",
        "Hinweis: Bitte matt",
      ].join("\n"),
    );
  });

  it("Lieferung, große Auflage, Prüfwunsch, ohne Optionales", () => {
    const text = partnerFreeText(
      valid({
        quantity: 2500,
        wishDate: null,
        note: null,
        event: null,
        preflight: "warnung",
        printerCheck: true,
        delivery: { mode: "lieferung", address: "Hauptstr. 1, Heilbronn" },
        product: { ...BODY.product, sides: 2, paper: null, bleedMm: 2.5 },
        customer: { ...BODY.customer, phone: null },
      }),
      "Seeräuber digital",
    );
    expect(text).toContain("Produkt: Plakat A2 – 420 × 594 mm, 2,5 mm Beschnitt, beidseitig\n");
    expect(text).toContain("Auflage: 2.500 Stück");
    expect(text).toContain("Wunschtermin: –");
    expect(text).toContain("Übergabe: Lieferung an Hauptstr. 1, Heilbronn");
    expect(text).toContain("Kontakt: Anna, anna@example.org\n");
    expect(text).toContain("Druckvorbereitung beim Partner: mit Hinweisen");
    expect(text).toContain("Bitte Datei prüfen");
    expect(text).not.toContain("Hinweis:");
    expect(text).not.toContain("Termin:");
  });

  it("Metadaten ohne signierte URL; lesbare Zeilen für Staff", () => {
    const meta = partnerMeta(valid());
    expect(JSON.stringify(meta)).not.toContain("token=");
    expect(meta.file).toEqual({
      name: "plakat-druck.pdf",
      mime: "application/pdf",
      size: 2048,
      sha256: "cd".repeat(32),
      host: "bciteqheblrwawokcvjg.supabase.co",
    });
    const rows = partnerMetaRows(meta);
    expect(rows.map((r) => r.label)).toEqual([
      "Organisation",
      "Kontakt",
      "Produkt",
      "Auflage",
      "Wunschtermin",
      "Übergabe",
      "Termin",
      "Druckvorbereitung",
      "Hinweis",
      "Datei",
      "Publikation",
      "Quelle",
    ]);
    expect(partnerMetaRows(null)).toEqual([]);
    expect(partnerMetaRows({ quantity: 5 })).toEqual([{ label: "Auflage", value: "5 Stück" }]);
  });
});

describe("Datei-Download (SSRF-Schutz, Größe, SHA-256)", () => {
  it("blockt private, lokale und reservierte Adressen", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "kein-ip",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["104.18.0.1", "8.8.8.8", "2606:4700::6810:1", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("nur HTTPS, Port 443 und freigegebene Hosts", () => {
    const hosts = ["bciteqheblrwawokcvjg.supabase.co"];
    expect(checkFileUrl(BODY.file.url, hosts).hostname).toBe(hosts[0]);
    expect(checkFileUrl(BODY.file.url, ["BCITEQHEBLRWAWOKCVJG.supabase.co "]).hostname).toBe(hosts[0]);
    const fails = [
      "http://bciteqheblrwawokcvjg.supabase.co/x",
      "https://bciteqheblrwawokcvjg.supabase.co:8443/x",
      "https://evil.example/x",
      "https://bciteqheblrwawokcvjg.supabase.co.evil.example/x",
      "https://127.0.0.1/x",
      "kaputt",
    ];
    for (const url of fails) {
      expect(() => checkFileUrl(url, hosts), url).toThrow(PartnerFileError);
    }
    try {
      checkFileUrl("https://evil.example/x", hosts);
    } catch (err) {
      expect((err as PartnerFileError).status).toBe(400);
      expect((err as PartnerFileError).code).toBe("file_host_not_allowed");
      expect((err as Error).message).not.toContain("evil.example");
    }
  });

  it("DNS-Auflösung auf localhost wird verweigert", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      safeLookup("localhost", {}, (e) => resolve(e)),
    );
    expect(err?.code).toBe("EBLOCKEDADDRESS");
  });

  it("prüft Größe und SHA-256 der geladenen Datei", async () => {
    const bytes = Buffer.from("%PDF-1.7 test");
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const hosts = ["files.example.org"];
    const file = { url: "https://files.example.org/a.pdf?token=geheim", size: bytes.length, sha256: sha };
    const download = async () => bytes;
    await expect(fetchPartnerFile(file, hosts, { timeoutMs: 1000, download })).resolves.toEqual(bytes);
    await expect(
      fetchPartnerFile({ ...file, size: bytes.length + 1 }, hosts, { timeoutMs: 1000, download }),
    ).rejects.toMatchObject({ status: 422, code: "file_size_mismatch" });
    await expect(
      fetchPartnerFile({ ...file, sha256: "0".repeat(64) }, hosts, { timeoutMs: 1000, download }),
    ).rejects.toMatchObject({ status: 422, code: "file_sha256_mismatch" });
    let called = false;
    await expect(
      fetchPartnerFile({ ...file, url: "https://evil.example/a.pdf" }, hosts, {
        timeoutMs: 1000,
        download: async () => {
          called = true;
          return bytes;
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(called).toBe(false);
  });
});

/** Prüfung wie in Seeräuber digital (`webhookPruefen`, src/lib/druck/druck-s.ts). */
function seeraeuberPruefen(secret: string, rawBody: string, timestamp: string, signatur: string): boolean {
  const erwartet = Buffer.from(`v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`);
  const erhalten = Buffer.from(signatur);
  return erwartet.length === erhalten.length && timingSafeEqual(erwartet, erhalten);
}

/** Statusliste des Clients (`DRUCK_S_STATUS` in Seeräuber digital). */
const CLIENT_STATUS = ["DRAFT", "RECEIVED", "IN_REVIEW", "WAITING_APPROVAL", "IN_PROGRESS", "SHIPPED", "WITHDRAWN"];

describe("Webhook: Signatur, Payload, Statusabbildung, Retry", () => {
  it("Signatur v1=HMAC-SHA256(secret, `${ts}.${body}`) passt zur Prüfung beim Partner", () => {
    const body = JSON.stringify({ event: "status_changed", partnerRef: "r", number: null, status: "IN_REVIEW" });
    const sig = signWebhook("geheim", "1762596000", body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(sig).toBe(`v1=${createHmac("sha256", "geheim").update(`1762596000.${body}`).digest("hex")}`);
    expect(seeraeuberPruefen("geheim", body, "1762596000", sig)).toBe(true);
    expect(seeraeuberPruefen("anders", body, "1762596000", sig)).toBe(false);
    expect(seeraeuberPruefen("geheim", `${body} `, "1762596000", sig)).toBe(false);
    expect(seeraeuberPruefen("geheim", body, "1762596001", sig)).toBe(false);
  });

  it("Payload entspricht dem Vertrag (parseWebhook beim Partner)", () => {
    const at = new Date("2026-11-09T10:00:00Z");
    expect(buildWebhookPayload({ partnerRef: "r1", number: "091126-001", status: "IN_PROGRESS", occurredAt: at })).toEqual({
      event: "status_changed",
      partnerRef: "r1",
      number: "091126-001",
      status: "IN_PROGRESS",
      occurredAt: "2026-11-09T10:00:00.000Z",
    });
    expect(
      buildWebhookPayload({
        partnerRef: "r1",
        number: "091126-001",
        status: "SHIPPED",
        occurredAt: at,
        shipment: { trackingNumber: "00340434", specialDeliveryDate: null },
      }),
    ).toMatchObject({ status: "SHIPPED", trackingNumber: "00340434", specialDeliveryDate: null });
  });

  it("Statusabbildung: alle druck-s-Status kennt der Client; gemeldet werden nur echte Wechsel", () => {
    for (const s of STATUSES) expect(CLIENT_STATUS, s).toContain(s);
    expect(PARTNER_VISIBLE_STATUSES).not.toContain("DRAFT");
    expect(shouldNotifyPartner("DRAFT", "RECEIVED")).toBe(true);
    expect(shouldNotifyPartner("RECEIVED", "IN_REVIEW")).toBe(true);
    expect(shouldNotifyPartner("IN_REVIEW", "WITHDRAWN")).toBe(true);
    expect(shouldNotifyPartner("IN_PROGRESS", "SHIPPED")).toBe(true);
    expect(shouldNotifyPartner("WAITING_APPROVAL", "WAITING_APPROVAL")).toBe(false); // resent/change_requested
    expect(shouldNotifyPartner("IN_PROGRESS", "IN_PROGRESS")).toBe(false); // invoice_attached
  });

  it("Zustandsmaschine: partner_submitted und withdrawn", () => {
    expect(TRANSITIONS.partner_submitted).toEqual({ from: ["DRAFT"], to: "RECEIVED" });
    expect(canTransition("RECEIVED", "withdrawn")).toBe(true);
    expect(canTransition("IN_REVIEW", "withdrawn")).toBe(true);
    for (const s of ["DRAFT", "WAITING_APPROVAL", "IN_PROGRESS", "SHIPPED", "WITHDRAWN"] as const) {
      expect(canTransition(s, "withdrawn"), s).toBe(false);
    }
    // Aus WITHDRAWN führt kein Event heraus.
    for (const [event, rule] of Object.entries(TRANSITIONS)) {
      expect(rule.from.includes("WITHDRAWN"), event).toBe(false);
    }
    expect(STAFF_STATUS.WITHDRAWN).toBe("Zurückgezogen");
    expect(CUSTOMER_STATUS.WITHDRAWN).toBe("Zurückgezogen");
  });

  it("Backoff und endgültige Fehler", () => {
    expect(backoffMinutes(1)).toBe(1);
    expect(backoffMinutes(2)).toBe(5);
    expect(backoffMinutes(4)).toBe(60);
    expect(backoffMinutes(99)).toBe(720);
    expect(MAX_ATTEMPTS).toBe(10);
    expect(isPermanentFailure(400)).toBe(true);
    expect(isPermanentFailure(422)).toBe(true);
    expect(isPermanentFailure(404)).toBe(false);
    expect(isPermanentFailure(401)).toBe(false);
    expect(isPermanentFailure(503)).toBe(false);
  });
});

describe("Staff-Herkunft", () => {
  it("Partnername statt Vertrauensstufe", () => {
    expect(originBadge("VOUCHED", "Seeräuber digital")).toEqual({ label: "Über Seeräuber digital", tone: "blue" });
    expect(originBadge("VOUCHED", null)).toEqual({ label: "Per Link", tone: "yellow" });
    expect(originBadge("VERIFIED")).toEqual({ label: "Verifiziert", tone: "green" });
  });
});

describe("Webhook-Secret und Skript", () => {
  it("verschlüsselt (AES-256-GCM, Schlüssel aus BETTER_AUTH_SECRET); Skript und App sind kompatibel", () => {
    const enc = encryptWebhookSecret("whsec_abc", "auth-secret");
    expect(enc).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(enc).not.toContain("whsec_abc");
    expect(encryptWebhookSecret("whsec_abc", "auth-secret")).not.toBe(enc); // frischer IV
    expect(decryptWebhookSecret(enc, "auth-secret")).toBe("whsec_abc");
    expect(() => decryptWebhookSecret(enc, "anderes-secret")).toThrow();
    expect(() => decryptWebhookSecret("kaputt", "auth-secret")).toThrow();
    const fromScript = script.encryptWebhookSecret("whsec_xyz", "auth-secret");
    expect(decryptWebhookSecret(fromScript, "auth-secret")).toBe("whsec_xyz");
  });

  it("Skript: Key wie die App, Argumente, Prüfungen", () => {
    const k = script.newPartnerKey();
    expect(k.key).toMatch(/^dmp_[0-9a-f]{64}$/);
    expect(k.hash).toBe(hashPartnerKey(k.key));
    expect(k.prefix).toBe(partnerKeyPrefix(k.key));
    expect(script.newWebhookSecret()).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(
      script.parseArgs(["create", "seeraeuber", "Seeräuber digital", "--webhook-url", "https://a.example/h", "--file-host", "X.supabase.co"]),
    ).toEqual({
      positional: ["create", "seeraeuber", "Seeräuber digital"],
      flags: { webhookUrl: "https://a.example/h", fileHosts: ["x.supabase.co"] },
    });
    expect(() => script.parseArgs(["update", "x", "--webhook-url"])).toThrow();
    expect(() => script.checkWebhookUrl("http://a.example/h")).toThrow();
    expect(script.checkWebhookUrl("http://localhost:3000/h", true)).toBe("http://localhost:3000/h");
    expect(() => script.checkFileHost("https://x.supabase.co/")).toThrow();
    expect(script.checkFileHost("bciteqheblrwawokcvjg.supabase.co")).toBe("bciteqheblrwawokcvjg.supabase.co");
  });
});
