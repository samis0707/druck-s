import {
  addressList,
  checkAttachments,
  MailAttachmentError,
  MailSendError,
  parseAddress,
  type AttachmentLimits,
  type CheckResult,
  type MailTransport,
  type ResolvedMail,
  type SendResult,
} from "./mailTransport";

/**
 * Brevo-Transport über die HTTP-API (`POST /v3/smtp/email`, Header `api-key`), nur fetch,
 * kein SDK. Für Hoster ohne ausgehendes SMTP (Railway Hobby). Server-side only.
 */

const MB = 1024 * 1024;

/**
 * Erlaubte Anhang-Endungen laut Brevo-API-Referenz (sendTransacEmail, `attachment`).
 * Druckformate wie .ai, .svg, .webp, .indd fehlen; solche Mails gehen mit Download-Link raus.
 */
export const BREVO_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  "xlsx", "xls", "ods", "docx", "docm", "doc", "csv", "pdf", "txt", "gif", "jpg", "jpeg",
  "png", "tif", "tiff", "rtf", "bmp", "cgm", "css", "shtml", "html", "htm", "zip", "xml",
  "ppt", "pptx", "tar", "ez", "ics", "mobi", "msg", "pub", "eps", "odt", "mp3", "m4a",
  "m4v", "wma", "ogg", "flac", "wav", "aif", "aifc", "aiff", "mp4", "mov", "avi", "mkv",
  "mpeg", "mpg", "wmv", "pkpass", "xlsm",
]);

/**
 * Brevo begrenzt eine Transaktionsmail auf 20 MB inkl. Anhängen und Inhalt; einzelne Anhänge
 * sollen unter 4 MB bleiben (Brevo-Hilfe „Add an attachment to a transactional email“).
 * Konservativ angesetzt, per MAIL_MAX_ATTACHMENTS_MB / MAIL_MAX_ATTACHMENT_MB übersteuerbar.
 */
export const BREVO_DEFAULT_LIMITS: AttachmentLimits = {
  maxTotalEncodedBytes: 20 * MB,
  maxAttachmentBytes: 4 * MB,
  allowedExtensions: BREVO_ALLOWED_EXTENSIONS,
};

export const BREVO_TIMEOUT_MS = 15_000;

export interface BrevoOptions {
  apiKey: string;
  apiBase?: string;
  timeoutMs?: number;
  limits?: AttachmentLimits;
  fetchImpl?: typeof fetch;
  /** Gesundheitsprüfung (GET /account) wird so lange zwischengespeichert. */
  checkCacheMs?: number;
}

/** Brevo-Request-Body aus einer aufgelösten Mail (exportiert für Tests). */
export function brevoPayload(mail: ResolvedMail): Record<string, unknown> {
  const recipients = (v: string | string[] | undefined) => addressList(v).map(parseAddress);
  const payload: Record<string, unknown> = {
    sender: parseAddress(mail.from),
    to: recipients(mail.to),
    subject: mail.subject,
    textContent: mail.text,
  };
  if (mail.html) payload.htmlContent = mail.html;
  const cc = recipients(mail.cc);
  if (cc.length) payload.cc = cc;
  const bcc = recipients(mail.bcc);
  if (bcc.length) payload.bcc = bcc;
  if (mail.replyTo) payload.replyTo = parseAddress(mail.replyTo);
  if (mail.attachments?.length) {
    payload.attachment = mail.attachments.map((a) => ({
      name: a.filename,
      content: a.content.toString("base64"),
    }));
  }
  return payload;
}

async function errorFromResponse(res: Response): Promise<MailSendError> {
  let code: string | null = null;
  let message = res.statusText || "unbekannter Fehler";
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string") message = body.message;
  } catch {
    /* kein JSON: Statuszeile genügt */
  }
  return new MailSendError(
    `Brevo API HTTP ${res.status}${code ? ` ${code}` : ""}: ${message}`,
    res.status,
    code,
  );
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export function createBrevoTransport(options: BrevoOptions): MailTransport {
  const apiBase = (options.apiBase ?? "https://api.brevo.com/v3").replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? BREVO_TIMEOUT_MS;
  const limits = options.limits ?? BREVO_DEFAULT_LIMITS;
  const doFetch = options.fetchImpl ?? fetch;
  const checkCacheMs = options.checkCacheMs ?? 5 * 60_000;
  let cachedCheck: { at: number; result: CheckResult } | null = null;

  async function call(path: string, init: RequestInit): Promise<Response> {
    if (!options.apiKey) throw new MailSendError("BREVO_API_KEY ist nicht gesetzt");
    try {
      return await doFetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": options.apiKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) {
        throw new MailSendError(`Brevo API: keine Antwort nach ${Math.round(timeoutMs / 1000)} s (Timeout)`);
      }
      throw new MailSendError(
        `Brevo API nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    name: "brevo",
    limits,
    async send(mail) {
      const fits = checkAttachments(limits, mail.attachments, mail);
      if (!fits.ok) throw new MailAttachmentError(fits.reason, fits.detail);
      const res = await call("/smtp/email", { method: "POST", body: JSON.stringify(brevoPayload(mail)) });
      if (!res.ok) throw await errorFromResponse(res);
      let messageId: string | null = null;
      try {
        const body = (await res.json()) as { messageId?: unknown; messageIds?: unknown };
        if (typeof body.messageId === "string") messageId = body.messageId;
        else if (Array.isArray(body.messageIds) && typeof body.messageIds[0] === "string") {
          messageId = body.messageIds[0];
        }
      } catch {
        /* 201 ohne lesbaren Body: gesendet, nur ohne ID */
      }
      return { transport: "brevo", messageId } satisfies SendResult;
    },
    async check() {
      if (cachedCheck && Date.now() - cachedCheck.at < checkCacheMs) return cachedCheck.result;
      let result: CheckResult;
      try {
        const res = await call("/account", { method: "GET" });
        result = res.ok
          ? { ok: true, detail: "brevo api reachable" }
          : { ok: false, detail: (await errorFromResponse(res)).message };
      } catch (err) {
        result = { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
      cachedCheck = { at: Date.now(), result };
      return result;
    },
  };
}
