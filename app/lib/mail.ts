import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";

let transporter: Transporter | null = null;

/** Shared SMTP transporter (Mailpit locally, real relay in prod). Server-side only. */
export function getMailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user || config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
    });
  }
  return transporter;
}

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export async function sendMail(mail: OutboundMail): Promise<void> {
  await getMailer().sendMail({
    from: config.smtp.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
}

export async function checkMail(): Promise<{ ok: boolean; detail: string }> {
  try {
    await getMailer().verify();
    return { ok: true, detail: "smtp reachable" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
