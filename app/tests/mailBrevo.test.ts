import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMailTransport } from "@/lib/config";
import { BREVO_DEFAULT_LIMITS, brevoPayload, createBrevoTransport } from "@/lib/mailBrevo";
import {
  checkAttachments,
  MailAttachmentError,
  MailSendError,
  parseAddress,
  type ResolvedMail,
} from "@/lib/mailTransport";

const KEY = "xkeysib-test-secret-123";
const MB = 1024 * 1024;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseMail: ResolvedMail = {
  from: "dmp druckraum <druckraum@druck-s.de>",
  to: "kunde@example.com",
  subject: "Auftragsbestätigung zur Freigabe – Auftrag 250926-003",
  text: "Guten Tag,\n\nText",
  html: "<p>Guten Tag,</p>",
};

describe("mail transport selection (MAIL_TRANSPORT / BREVO_API_KEY)", () => {
  it("default: brevo with key, smtp without", () => {
    expect(resolveMailTransport({ BREVO_API_KEY: KEY })).toBe("brevo");
    expect(resolveMailTransport({})).toBe("smtp");
    expect(resolveMailTransport({ BREVO_API_KEY: "  " })).toBe("smtp");
  });

  it("explicit MAIL_TRANSPORT wins", () => {
    expect(resolveMailTransport({ MAIL_TRANSPORT: "smtp", BREVO_API_KEY: KEY })).toBe("smtp");
    expect(resolveMailTransport({ MAIL_TRANSPORT: "BREVO" })).toBe("brevo");
  });

  it("rejects unknown MAIL_TRANSPORT", () => {
    expect(() => resolveMailTransport({ MAIL_TRANSPORT: "sendgrid" })).toThrow(/MAIL_TRANSPORT/);
  });
});

describe("address and attachment rules", () => {
  it("parses sender with and without display name", () => {
    expect(parseAddress("dmp druckraum <druckraum@druck-s.de>")).toEqual({
      name: "dmp druckraum",
      email: "druckraum@druck-s.de",
    });
    expect(parseAddress('"Druck, S" <a@b.de>')).toEqual({ name: "Druck, S", email: "a@b.de" });
    expect(parseAddress("<a@b.de>")).toEqual({ email: "a@b.de" });
    expect(parseAddress(" a@b.de ")).toEqual({ email: "a@b.de" });
  });

  it("brevo limits: per-file, total (base64) and extension", () => {
    const small = { filename: "ab.pdf", content: Buffer.alloc(1 * MB) };
    expect(checkAttachments(BREVO_DEFAULT_LIMITS, [small])).toEqual({ ok: true });
    expect(checkAttachments(BREVO_DEFAULT_LIMITS, [])).toEqual({ ok: true });
    const big = { filename: "druck.pdf", content: Buffer.alloc(5 * MB) };
    expect(checkAttachments(BREVO_DEFAULT_LIMITS, [big])).toMatchObject({ ok: false, reason: "file_size" });
    // 5 × 3.5 MB roh = 17.5 MB, Base64 ≈ 23.3 MB > 20 MB
    const many = Array.from({ length: 5 }, (_, i) => ({
      filename: `d${i}.pdf`,
      content: Buffer.alloc(3.5 * MB),
    }));
    expect(checkAttachments(BREVO_DEFAULT_LIMITS, many)).toMatchObject({ ok: false, reason: "total_size" });
    expect(
      checkAttachments(BREVO_DEFAULT_LIMITS, [{ filename: "logo.ai", content: Buffer.alloc(10) }]),
    ).toMatchObject({ ok: false, reason: "extension" });
    expect(
      checkAttachments(BREVO_DEFAULT_LIMITS, [{ filename: "SCAN.TIF", content: Buffer.alloc(10) }]),
    ).toEqual({ ok: true });
  });
});

describe("brevo transport (mocked fetch)", () => {
  it("posts the full payload incl. base64 attachments and returns messageId", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { messageId: "<202611081200.1@smtp-relay.mailin.fr>" }));
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl });
    const pdf = Buffer.from("%PDF-1.7 Auftragsbestätigung");
    const tif = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0xff]);
    const result = await t.send({
      ...baseMail,
      to: ["kunde@example.com", "Einkauf <einkauf@example.com>"],
      cc: "cc@example.com",
      bcc: ["bcc@example.com"],
      replyTo: "Druckraum <print@druck-s.de>",
      attachments: [
        { filename: "AB-250926-003.pdf", content: pdf, contentType: "application/pdf" },
        { filename: "druck.tif", content: tif, contentType: "image/tiff" },
      ],
    });
    expect(result).toEqual({ transport: "brevo", messageId: "<202611081200.1@smtp-relay.mailin.fr>" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe(KEY);
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: "dmp druckraum", email: "druckraum@druck-s.de" },
      to: [{ email: "kunde@example.com" }, { name: "Einkauf", email: "einkauf@example.com" }],
      cc: [{ email: "cc@example.com" }],
      bcc: [{ email: "bcc@example.com" }],
      replyTo: { name: "Druckraum", email: "print@druck-s.de" },
      subject: baseMail.subject,
      textContent: baseMail.text,
      htmlContent: baseMail.html,
      attachment: [
        { name: "AB-250926-003.pdf", content: pdf.toString("base64") },
        { name: "druck.tif", content: tif.toString("base64") },
      ],
    });
  });

  it("omits optional fields that are not set (text-only mail)", () => {
    const payload = brevoPayload({ ...baseMail, html: undefined });
    expect(payload).not.toHaveProperty("htmlContent");
    expect(payload).not.toHaveProperty("cc");
    expect(payload).not.toHaveProperty("bcc");
    expect(payload).not.toHaveProperty("replyTo");
    expect(payload).not.toHaveProperty("attachment");
    expect(payload.textContent).toBe(baseMail.text);
  });

  it("401: throws MailSendError with Brevo code and message, never the key", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { code: "unauthorized", message: "Key not found" }),
    );
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl });
    const err = await t.send(baseMail).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailSendError);
    const e = err as MailSendError;
    expect(e.status).toBe(401);
    expect(e.code).toBe("unauthorized");
    expect(e.message).toBe("Brevo API HTTP 401 unauthorized: Key not found");
    expect(e.message).not.toContain(KEY);
  });

  it("non-JSON error body falls back to the status line", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }));
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl });
    await expect(t.send(baseMail)).rejects.toThrow("Brevo API HTTP 502: Bad Gateway");
  });

  it("times out (15 s in production) and reports it", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl, timeoutMs: 30 });
    await expect(t.send(baseMail)).rejects.toThrow(/Timeout/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("network error is wrapped", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl });
    await expect(t.send(baseMail)).rejects.toThrow("Brevo API nicht erreichbar: fetch failed");
  });

  it("oversized attachments fail cleanly before any request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { messageId: "x" }));
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl });
    const err = await t
      .send({ ...baseMail, attachments: [{ filename: "druck.pdf", content: Buffer.alloc(5 * MB) }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailAttachmentError);
    expect((err as MailAttachmentError).reason).toBe("file_size");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("missing key: clear error, no request", async () => {
    const fetchImpl = vi.fn();
    const t = createBrevoTransport({ apiKey: "", fetchImpl });
    await expect(t.send(baseMail)).rejects.toThrow("BREVO_API_KEY ist nicht gesetzt");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("health check calls GET /account and caches the result", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { email: "x" }));
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl, apiBase: "https://api.brevo.com/v3/" });
    expect(await t.check()).toEqual({ ok: true, detail: "brevo api reachable" });
    expect(await t.check()).toEqual({ ok: true, detail: "brevo api reachable" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/account");
    expect(init.method).toBe("GET");
  });

  it("health check reports a Brevo error (e.g. unauthorised IP)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { code: "unauthorized", message: "We have detected you are using an unrecognised IP address" }),
    );
    const t = createBrevoTransport({ apiKey: KEY, fetchImpl, checkCacheMs: 0 });
    const res = await t.check();
    expect(res.ok).toBe(false);
    expect(res.detail).toContain("unrecognised IP address");
    expect(res.detail).not.toContain(KEY);
  });
});

describe("sendMail picks the transport from env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("BREVO_API_KEY set: sends via Brevo with configured sender and reply-to", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "");
    vi.stubEnv("BREVO_API_KEY", KEY);
    vi.stubEnv("MAIL_FROM", "dmp druckraum <druckraum@druck-s.de>");
    vi.stubEnv("MAIL_REPLY_TO", "info@druck-s.de");
    const fetchMock = vi.fn(async () => jsonResponse(201, { messageId: "<id-1@brevo>" }));
    vi.stubGlobal("fetch", fetchMock);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.resetModules();
    const mail = await import("@/lib/mail");
    expect(mail.getMailTransport().name).toBe("brevo");
    const res = await mail.sendMail({ to: "kunde@example.com", subject: "S", text: "T", html: "<p>T</p>" });
    expect(res).toEqual({ transport: "brevo", messageId: "<id-1@brevo>" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.sender).toEqual({ name: "dmp druckraum", email: "druckraum@druck-s.de" });
    expect(body.replyTo).toEqual({ email: "info@druck-s.de" });
    expect(info.mock.calls.flat().join(" ")).not.toContain("kunde@example.com");
  });

  it("Brevo failure is logged without key, recipients or content and rethrown", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo");
    vi.stubEnv("BREVO_API_KEY", KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(400, { code: "invalid_parameter", message: "sender is invalid" })),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    const mail = await import("@/lib/mail");
    await expect(
      mail.sendMail({ to: "kunde@example.com", subject: "Geheimer Betreff", text: "Code 123456" }),
    ).rejects.toThrow("Brevo API HTTP 400 invalid_parameter: sender is invalid");
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("invalid_parameter");
    expect(logged).toContain("Empfänger: 1");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("kunde@example.com");
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain("Geheimer Betreff");
  });

  it("no key: SMTP (Mailpit) stays the default, without Brevo limits", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.resetModules();
    const mail = await import("@/lib/mail");
    expect(mail.getMailTransport().name).toBe("smtp");
    expect(mail.attachmentsFit([{ filename: "druck.ai", content: Buffer.alloc(5 * MB) }])).toEqual({ ok: true });
  });

  it("brevo: oversized attachments are reported as not fitting (caller sends a link)", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo");
    vi.stubEnv("BREVO_API_KEY", KEY);
    vi.resetModules();
    const mail = await import("@/lib/mail");
    expect(mail.attachmentsFit([{ filename: "druck.pdf", content: Buffer.alloc(5 * MB) }])).toMatchObject({
      ok: false,
      reason: "file_size",
    });
  });

  it("MAIL_MAX_ATTACHMENT_MB overrides the per-file limit", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "brevo");
    vi.stubEnv("BREVO_API_KEY", KEY);
    vi.stubEnv("MAIL_MAX_ATTACHMENT_MB", "10");
    vi.resetModules();
    const mail = await import("@/lib/mail");
    expect(mail.attachmentsFit([{ filename: "druck.pdf", content: Buffer.alloc(5 * MB) }])).toEqual({ ok: true });
  });
});
