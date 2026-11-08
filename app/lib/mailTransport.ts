/**
 * Transport-neutrale Mail-Typen und Regeln (rein, ohne Netzwerk). Server-side only.
 * Umsetzungen: SMTP (nodemailer, lokal Mailpit) in mail.ts, Brevo-HTTP-API in mailBrevo.ts.
 */

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface OutboundMail {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  /** Überschreibt MAIL_REPLY_TO für diese Mail. */
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

/** Vom Transport aufgelöste Mail: Absender und Antwortadresse stehen fest. */
export interface ResolvedMail extends OutboundMail {
  from: string;
}

export interface SendResult {
  transport: string;
  /** Message-ID des Anbieters (SMTP: Message-ID-Header, Brevo: `messageId` der Antwort). */
  messageId: string | null;
}

export interface CheckResult {
  ok: boolean;
  detail: string;
}

export interface AttachmentLimits {
  /** Summe aller Anhänge, Base64-kodiert, plus Text und HTML (so zählt Brevo die Mailgröße). */
  maxTotalEncodedBytes: number;
  /** Einzelner Anhang, Rohgröße. */
  maxAttachmentBytes: number;
  /** Erlaubte Dateiendungen (klein, ohne Punkt); null = alle. */
  allowedExtensions: ReadonlySet<string> | null;
}

export interface MailTransport {
  readonly name: string;
  readonly limits: AttachmentLimits;
  send(mail: ResolvedMail): Promise<SendResult>;
  check(): Promise<CheckResult>;
}

export type AttachmentCheck =
  | { ok: true }
  | { ok: false; reason: "total_size" | "file_size" | "extension"; detail: string };

/** Fehler, der den Versand vor dem Aufruf des Anbieters stoppt (Anhänge passen nicht). */
export class MailAttachmentError extends Error {
  constructor(
    readonly reason: "total_size" | "file_size" | "extension",
    detail: string,
  ) {
    super(`Mail-Anhänge passen nicht zum Transport: ${detail}`);
    this.name = "MailAttachmentError";
  }
}

/** Fehler des Anbieters (HTTP-Status, Fehlercode und -meldung, nie Schlüssel oder Inhalte). */
export class MailSendError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "MailSendError";
  }
}

const MB = 1024 * 1024;

export function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Base64-Länge ohne Kodieren: 4 Zeichen je angefangene 3 Bytes. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** Prüft Anhänge gegen die Grenzen eines Transports, bevor gesendet wird. */
export function checkAttachments(
  limits: AttachmentLimits,
  attachments: readonly MailAttachment[] | undefined,
  body: { text?: string; html?: string } = {},
): AttachmentCheck {
  const list = attachments ?? [];
  if (list.length === 0) return { ok: true };
  for (const a of list) {
    const ext = extensionOf(a.filename);
    if (limits.allowedExtensions && !limits.allowedExtensions.has(ext)) {
      return { ok: false, reason: "extension", detail: `Dateityp „.${ext || "?"}“ ist nicht erlaubt` };
    }
    if (a.content.length > limits.maxAttachmentBytes) {
      return {
        ok: false,
        reason: "file_size",
        detail: `ein Anhang hat ${formatMb(a.content.length)} (Grenze ${formatMb(limits.maxAttachmentBytes)})`,
      };
    }
  }
  const total =
    list.reduce((sum, a) => sum + base64Length(a.content.length), 0) +
    Buffer.byteLength(body.text ?? "") +
    Buffer.byteLength(body.html ?? "");
  if (total > limits.maxTotalEncodedBytes) {
    return {
      ok: false,
      reason: "total_size",
      detail: `Mail mit Anhängen hat kodiert ${formatMb(total)} (Grenze ${formatMb(limits.maxTotalEncodedBytes)})`,
    };
  }
  return { ok: true };
}

/** „Name <adresse>“ oder „adresse“ → { name?, email }. */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<\s*([^<>\s]+)\s*>\s*$/.exec(value);
  if (match) {
    const name = match[1]?.trim();
    return name ? { name, email: match[2] } : { email: match[2] };
  }
  return { email: value.trim() };
}

export function addressList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter((v) => v !== "");
}

export const UNLIMITED: AttachmentLimits = {
  maxTotalEncodedBytes: Number.POSITIVE_INFINITY,
  maxAttachmentBytes: Number.POSITIVE_INFINITY,
  allowedExtensions: null,
};
