import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";
import { BREVO_DEFAULT_LIMITS, createBrevoTransport } from "./mailBrevo";
import {
  addressList,
  checkAttachments,
  MailAttachmentError,
  UNLIMITED,
  type AttachmentCheck,
  type AttachmentLimits,
  type MailAttachment,
  type MailTransport,
  type OutboundMail,
  type SendResult,
} from "./mailTransport";

export type { MailAttachment, OutboundMail, SendResult } from "./mailTransport";
export { MailAttachmentError, MailSendError } from "./mailTransport";

/**
 * Ausgehende Mails. Transport per MAIL_TRANSPORT (brevo|smtp, siehe config.resolveMailTransport):
 * Brevo-HTTP-API in Produktion (Railway sperrt SMTP), SMTP/Mailpit lokal und in Tests.
 * Server-side only. Es gibt keine Outbox: ein Fehler geht an den Aufrufer wie bisher.
 */

let smtpTransporter: Transporter | null = null;

/** Shared SMTP transporter (Mailpit locally). Server-side only. */
export function getMailer(): Transporter {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user || config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
    });
  }
  return smtpTransporter;
}

function withOverrides(base: AttachmentLimits): AttachmentLimits {
  return {
    ...base,
    maxTotalEncodedBytes: config.mail.maxAttachmentsTotalBytes ?? base.maxTotalEncodedBytes,
    maxAttachmentBytes: config.mail.maxAttachmentBytes ?? base.maxAttachmentBytes,
  };
}

function createSmtpTransport(): MailTransport {
  const limits = withOverrides(UNLIMITED);
  return {
    name: "smtp",
    limits,
    async send(mail) {
      const fits = checkAttachments(limits, mail.attachments, mail);
      if (!fits.ok) throw new MailAttachmentError(fits.reason, fits.detail);
      const info = await getMailer().sendMail({
        from: mail.from,
        to: mail.to,
        cc: mail.cc,
        bcc: mail.bcc,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: mail.attachments,
      });
      return { transport: "smtp", messageId: info.messageId ?? null };
    },
    async check() {
      try {
        await getMailer().verify();
        return { ok: true, detail: "smtp reachable" };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

let transport: MailTransport | null = null;

/** Aktiver Transport (einmal pro Prozess, Env steht beim Start fest). */
export function getMailTransport(): MailTransport {
  if (!transport) {
    transport =
      config.mail.transport === "brevo"
        ? createBrevoTransport({
            apiKey: config.mail.brevo.apiKey,
            apiBase: config.mail.brevo.apiBase,
            limits: withOverrides(BREVO_DEFAULT_LIMITS),
          })
        : createSmtpTransport();
  }
  return transport;
}

/**
 * Passen die Anhänge zum aktiven Transport? Aufrufer mit großen Dateien (Auftragsbestätigung,
 * Druckdateien, Rechnung) senden sonst einen Download-Link statt der Anhänge.
 */
export function attachmentsFit(
  attachments: readonly MailAttachment[],
  body: { text?: string; html?: string } = {},
): AttachmentCheck {
  return checkAttachments(getMailTransport().limits, attachments, body);
}

export async function sendMail(mail: OutboundMail): Promise<SendResult> {
  const t = getMailTransport();
  const replyTo = mail.replyTo || config.mail.replyTo || undefined;
  try {
    const result = await t.send({ ...mail, replyTo, from: config.mail.from });
    console.info(`[mail] gesendet via ${result.transport}, messageId=${result.messageId ?? "-"}`);
    return result;
  } catch (err) {
    // Nur Fehlerbild und Umfang loggen: keine Schlüssel, keine Inhalte, keine Adressen.
    const recipients =
      addressList(mail.to).length + addressList(mail.cc).length + addressList(mail.bcc).length;
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[mail] Versand via ${t.name} fehlgeschlagen (Empfänger: ${recipients}, Anhänge: ${mail.attachments?.length ?? 0}): ${detail}`,
    );
    throw err;
  }
}

export async function checkMail(): Promise<{ ok: boolean; detail: string }> {
  return getMailTransport().check();
}
