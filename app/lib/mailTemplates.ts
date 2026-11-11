import { config } from "./config";
import { company } from "./company";

/** Ausgehende Mails von „dmp druckraum“: Betreff, Text- und HTML-Fassung (Deutsch, Sie-Form). */
export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

type OtpPurpose = "send_verify" | "approve" | "login" | "verify";

/* Farben aus globals.css (Markenpalette, Papier-Look). */
const color = {
  paper: "#f7f8f5",
  surface: "#ffffff",
  sunk: "#eef1ea",
  ink: "#16191c",
  inkMid: "#5b636b",
  inkSoft: "#6f777f",
  rule: "#e5e8e1",
  ruleStrong: "#d3d8cc",
  brand: "#64b32d",
  brandDark: "#3d7a17",
  signal: "#0075bd",
};

const fontSans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const fontMono = `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace`;

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Maskiert einen dynamischen Wert für HTML-Text und Attribute. */
function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (ch) => escapeMap[ch]);
}

function baseUrl(): string {
  return config.appBaseUrl.replace(/\/+$/, "");
}

const legalLinks = [
  { label: "Impressum", path: "/impressum" },
  { label: "AGB", path: "/agb" },
  { label: "Datenschutz", path: "/datenschutz" },
] as const;

/** „25.09.2026, 14:03 Uhr“ in Berliner Zeit; nicht lesbare Werte bleiben unverändert. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatted} Uhr`;
}

/** „28.09.2026“ aus „2026-09-28“ (auch ISO mit Uhrzeit); rein kalendarisch, ohne Zeitzonenumrechnung. */
function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function otpAction(purpose: OtpPurpose): string {
  switch (purpose) {
    case "approve":
      return "Ihren Auftrag freizugeben";
    case "login":
      return "sich im Druckportal anzumelden";
    default:
      return "Ihre Identität zu bestätigen";
  }
}

function footerText(reason: string): string {
  const base = baseUrl();
  const lines = [
    `--`,
    `${company.brand} · ${company.name}`,
    `${company.street}, ${company.zip} ${company.city}`,
    `Tel. ${company.phone} · ${company.email}`,
    `Geschäftsführer: ${company.managingDirector} · USt-IdNr. ${company.vatId}`,
  ];
  if (company.register) {
    lines.push(`Handelsregister: ${company.register.court}, ${company.register.number}`);
  }
  lines.push(legalLinks.map((l) => `${l.label}: ${base}${l.path}`).join(" · "), ``, reason);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* HTML-Bausteine (tabellenbasiert, Inline-CSS)                        */
/* ------------------------------------------------------------------ */

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${fontSans};font-size:16px;line-height:1.6;color:${color.ink};" class="tx">${html}</p>`;
}

/** Beschnitt-Box: gestrichelter Rahmen wie ein Schnittrahmen, darin Label/Wert-Zeilen. */
function summaryBox(rows: { label: string; value: string; mono?: boolean }[]): string {
  const body = rows
    .map(
      (row) => `<tr>
<td valign="top" width="150" style="width:150px;padding:6px 16px 6px 0;font-family:${fontSans};font-size:12px;line-height:1.5;letter-spacing:0.06em;text-transform:uppercase;color:${color.inkSoft};" class="tx-soft">${esc(row.label)}</td>
<td valign="top" style="padding:6px 0;font-family:${row.mono ? fontMono : fontSans};font-size:${row.mono ? "18px" : "15px"};line-height:1.5;font-weight:${row.mono ? "700" : "500"};color:${color.ink};word-break:break-word;" class="tx">${esc(row.value)}</td>
</tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
<tr><td class="box" style="background-color:${color.paper};border:1px dashed ${color.ruleStrong};border-radius:6px;padding:14px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${body}
</table>
</td></tr>
</table>`;
}

/** Bulletproof-Button (Outlook über VML, sonst Tabellenzelle mit Hintergrund). */
function button(url: string, label: string): string {
  const href = esc(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;">
<tr><td align="center" bgcolor="${color.brandDark}" style="background-color:${color.brandDark};border-radius:6px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" stroke="f" fillcolor="${color.brandDark}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${fontSans};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px;background-color:${color.brandDark};">${esc(label)}</a><!--<![endif]-->
</td></tr>
</table>
<p style="margin:12px 0 24px 0;font-family:${fontSans};font-size:13px;line-height:1.5;color:${color.inkMid};" class="tx-mid">Funktioniert der Button nicht? Kopieren Sie diesen Link in Ihren Browser:<br><a href="${href}" target="_blank" style="color:${color.signal};word-break:break-all;">${esc(url)}</a></p>`;
}

function codeBox(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
<tr><td align="center" class="box" style="background-color:${color.paper};border:1px dashed ${color.ruleStrong};border-radius:6px;padding:22px 12px;">
<span style="font-family:${fontMono};font-size:36px;line-height:1.2;font-weight:700;letter-spacing:0.28em;color:${color.ink};padding-left:0.28em;" class="tx">${esc(code)}</span>
</td></tr>
</table>`;
}

/** Logo (256×256-PNG aus public/) mit Bild-blockiert-Fallback: feste Größe, alt-Text, kein Rand. */
function logoImage(): string {
  return `<img src="${esc(`${baseUrl()}/digitale-medien-logo.png`)}" width="40" height="40" alt="dmp druckraum" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;font-family:${fontSans};font-size:12px;color:${color.inkMid};">`;
}

function wordmark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="middle" width="40" style="width:40px;padding:0 12px 0 0;">${logoImage()}</td>
<td valign="middle" style="font-family:${fontSans};line-height:1;white-space:nowrap;" class="tx">
<span style="font-size:13px;font-weight:600;letter-spacing:0.04em;color:${color.inkMid};" class="tx-mid">dmp</span>&nbsp;<span style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:${color.ink};">druckraum</span>
</td>
</tr>
</table>`;
}

/** Druckkontrollstreifen: vier Farbfelder am Kopf der Karte. */
function controlStrip(): string {
  const cell = (bg: string) =>
    `<td width="25%" height="4" bgcolor="${bg}" style="background-color:${bg};height:4px;line-height:4px;font-size:0;">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:8px 8px 0 0;">
<tr>${cell("#2aa7dc")}${cell("#d6336c")}${cell("#f2c230")}${cell(color.ink)}</tr>
</table>`;
}

function footerHtml(reason: string): string {
  const base = baseUrl();
  const style = `font-family:${fontSans};font-size:12px;line-height:1.6;color:${color.inkMid};`;
  const links = legalLinks
    .map(
      (l) =>
        `<a href="${esc(base + l.path)}" target="_blank" style="color:${color.signal};text-decoration:underline;">${l.label}</a>`,
    )
    .join(`&nbsp;&nbsp;·&nbsp;&nbsp;`);
  const register = company.register
    ? `<br>Handelsregister: ${esc(company.register.court)}, ${esc(company.register.number)}`
    : "";
  return `<p style="margin:0 0 12px 0;${style}" class="tx-mid">${esc(reason)}</p>
<p style="margin:0 0 12px 0;${style}" class="tx-mid"><strong style="color:${color.ink};" class="tx">${esc(company.name)}</strong><br>
${esc(company.street)}, ${esc(company.zip)} ${esc(company.city)}<br>
Tel. <a href="tel:${esc(company.phoneHref)}" style="color:${color.signal};text-decoration:none;">${esc(company.phone)}</a> · <a href="mailto:${esc(company.email)}" style="color:${color.signal};text-decoration:none;">${esc(company.email)}</a><br>
Geschäftsführer: ${esc(company.managingDirector)} · USt-IdNr. ${esc(company.vatId)}${register}</p>
<p style="margin:0;${style}" class="tx-mid">${links}</p>`;
}

/** Rahmen aller Mails: Preheader, Kopf mit Wortmarke, weiße Karte, Footer. */
function layout(opts: { title: string; preheader: string; heading: string; body: string; reason: string }): string {
  const preheader = `${esc(opts.preheader)}${"&nbsp;&zwnj;".repeat(40)}`;
  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color: #16191c !important; }
    .bg-card { background-color: #202428 !important; border-color: #33393e !important; }
    .box { background-color: #2a2f34 !important; border-color: #4a5158 !important; }
    .tx { color: #f1f3ee !important; }
    .tx-mid { color: #b4bbc1 !important; }
    .tx-soft { color: #a0a8ae !important; }
    .hr { border-top-color: #33393e !important; }
  }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:${color.paper};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${color.paper};opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-page" style="background-color:${color.paper};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">
<tr><td class="pad" style="padding:0 4px 18px 4px;">${wordmark()}</td></tr>
<tr><td class="bg-card" style="background-color:${color.surface};border:1px solid ${color.rule};border-radius:8px;">
${controlStrip()}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 12px 36px;">
<h1 style="margin:0 0 20px 0;font-family:${fontSans};font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${color.ink};" class="tx">${esc(opts.heading)}</h1>
${opts.body}
</td></tr>
</table>
</td></tr>
<tr><td class="pad" style="padding:22px 4px 0 4px;">
${footerHtml(opts.reason)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Vorlagen                                                            */
/* ------------------------------------------------------------------ */

export function otpMail(code: string, purpose: OtpPurpose): MailContent {
  const action = otpAction(purpose);
  const validity = `Er ist ${config.ttl.otpMinutes} Minuten gültig und kann nur einmal verwendet werden.`;
  const ignore = `Falls Sie diesen Code nicht angefordert haben, können Sie diese E-Mail ignorieren. Geben Sie den Code an niemanden weiter.`;
  const reason = `Sie erhalten diese E-Mail, weil für Ihre E-Mail-Adresse bei ${company.brand} ein Bestätigungscode angefordert wurde.`;
  const subject = `Ihr Bestätigungscode: ${code}`;
  const text = [
    `Ihr Bestätigungscode lautet: ${code}`,
    ``,
    `Verwenden Sie ihn, um ${action}.`,
    validity,
    ignore,
    ``,
    footerText(reason),
  ].join("\n");
  const html = layout({
    title: subject,
    preheader: `Ihr Code: ${code}. Gültig für ${config.ttl.otpMinutes} Minuten.`,
    heading: "Ihr Bestätigungscode",
    reason,
    body: [
      paragraph(`Verwenden Sie diesen Code, um ${esc(action)}.`),
      codeBox(code),
      paragraph(esc(validity)),
      paragraph(esc(ignore)),
    ].join("\n"),
  });
  return { subject, text, html };
}

export function approvalRequestMail(input: {
  requestRef: string;
  version: number;
  reason?: string | null;
  resent?: boolean;
  approveUrl: string;
  /** Dateien zu groß bzw. vom Mail-Anbieter nicht erlaubt: Download im Auftrag statt Anhang. */
  filesByLink?: boolean;
}): MailContent {
  const ref = input.requestRef;
  const intro = input.resent
    ? `Die überarbeitete Auftragsbestätigung (Version ${input.version}) zu Ihrem Auftrag ${ref} liegt zur Freigabe bereit.`
    : `Die Auftragsbestätigung zu Ihrem Auftrag ${ref} liegt zur Freigabe bereit.`;
  const salutation = `Guten Tag,`;
  const attachments = input.filesByLink
    ? `Die Auftragsbestätigung und die finalen Druckdateien sind zu groß für den Versand per E-Mail. Sie können sie in Ihrem Auftrag herunterladen. Bitte prüfen Sie alles sorgfältig, bevor Sie freigeben.`
    : `Die Auftragsbestätigung und die finalen Druckdateien finden Sie im Anhang. Bitte prüfen Sie alles sorgfältig, bevor Sie freigeben.`;
  const help = `Falls etwas nicht stimmt, antworten Sie auf diese E-Mail und nennen Sie die Auftragsnummer ${ref}.`;
  const reason = `Sie erhalten diese E-Mail, weil zu Ihrem Auftrag bei ${company.brand} eine Auftragsbestätigung zur Freigabe bereitgestellt wurde.`;
  const subject = input.resent
    ? `Geänderte Auftragsbestätigung (Version ${input.version}) zur Freigabe – Auftrag ${ref}`
    : `Auftragsbestätigung zur Freigabe – Auftrag ${ref}`;

  const lines = [salutation, ``, intro, ``];
  if (input.reason) lines.push(`Grund der Änderung: ${input.reason}`, ``);
  lines.push(
    attachments,
    ``,
    `Jetzt prüfen und freigeben: ${input.approveUrl}`,
    ``,
    help,
    ``,
    footerText(reason),
  );

  const rows = [
    { label: "Auftrag", value: ref, mono: true },
    { label: "Version", value: String(input.version) },
  ];
  if (input.reason) rows.push({ label: "Grund der Änderung", value: input.reason });
  const html = layout({
    title: subject,
    preheader: input.resent
      ? `Geänderte Auftragsbestätigung zu Auftrag ${ref} – bitte prüfen und freigeben.`
      : `Bitte prüfen und freigeben: Auftragsbestätigung zu Auftrag ${ref}.`,
    heading: input.resent ? "Geänderte Auftragsbestätigung" : "Ihre Auftragsbestätigung",
    reason,
    body: [
      paragraph(esc(salutation)),
      paragraph(esc(intro)),
      summaryBox(rows),
      paragraph(esc(attachments)),
      button(input.approveUrl, "Prüfen und freigeben"),
      paragraph(esc(help)),
    ].join("\n"),
  });
  return { subject, text: lines.join("\n"), html };
}

export function approvalReceiptMail(input: {
  requestRef: string;
  version: number;
  approvedAt: string;
  approver: string;
}): MailContent {
  const ref = input.requestRef;
  const when = formatDateTime(input.approvedAt);
  const intro = `Auftrag ${ref} (Auftragsbestätigung Version ${input.version}) wurde am ${when} von ${input.approver} freigegeben.`;
  const next = `Die Produktion kann jetzt starten.`;
  const warn = `Waren Sie das nicht? Rufen Sie uns bitte umgehend an (${company.phone}) und nennen Sie die Auftragsnummer ${ref}.`;
  const reason = `Sie erhalten diese E-Mail als Bestätigung, weil Ihr Auftrag bei ${company.brand} freigegeben wurde.`;
  const subject = `Auftrag ${ref} freigegeben`;
  const text = [`Guten Tag,`, ``, intro, ``, next, warn, ``, footerText(reason)].join("\n");
  const html = layout({
    title: subject,
    preheader: `Freigabe bestätigt: Auftrag ${ref}. Die Produktion kann starten.`,
    heading: "Freigabe bestätigt",
    reason,
    body: [
      paragraph(`Guten Tag,`),
      paragraph(esc(`Wir bestätigen Ihre Freigabe. ${next}`)),
      summaryBox([
        { label: "Auftrag", value: ref, mono: true },
        { label: "Version", value: String(input.version) },
        { label: "Freigegeben am", value: when },
        { label: "Freigegeben von", value: input.approver },
      ]),
      paragraph(esc(warn)),
    ].join("\n"),
  });
  return { subject, text, html };
}

export function staffApprovalNotice(input: {
  requestRef: string;
  version: number;
  approver: string;
  ip: string;
}): MailContent {
  const ref = input.requestRef;
  const intro = `Auftrag ${ref} wurde von ${input.approver} freigegeben (IP-Adresse ${input.ip}).`;
  const version = `Freigegebene Auftragsbestätigung: Version ${input.version}.`;
  const reason = `Interne Benachrichtigung von ${company.brand}: Ein Kunde hat einen Auftrag freigegeben.`;
  const subject = `Freigabe erteilt: Auftrag ${ref} (Version ${input.version})`;
  const text = [intro, version, ``, footerText(reason)].join("\n");
  const html = layout({
    title: subject,
    preheader: `${input.approver} hat Auftrag ${ref} freigegeben.`,
    heading: "Auftrag freigegeben",
    reason,
    body: [
      paragraph(`Ein Kunde hat einen Auftrag freigegeben. Die Produktion kann vorbereitet werden.`),
      summaryBox([
        { label: "Auftrag", value: ref, mono: true },
        { label: "Version", value: String(input.version) },
        { label: "Freigegeben von", value: input.approver },
        { label: "IP-Adresse", value: input.ip },
      ]),
    ].join("\n"),
  });
  return { subject, text, html };
}

export function shippedMail(input: {
  requestRef: string;
  trackingNumber?: string | null;
  specialDeliveryDate?: string | null;
  requestUrl: string;
  /** Rechnung nicht als Anhang (zu groß bzw. nicht erlaubt): Download im Auftrag. */
  invoiceByLink?: boolean;
}): MailContent {
  const ref = input.requestRef;
  const tracking = input.trackingNumber?.trim() || null;
  const delivery = tracking
    ? { label: "Sendungsnummer", value: tracking, mono: true, line: `Sendungsnummer: ${tracking}` }
    : input.specialDeliveryDate
      ? (() => {
          const date = formatDate(input.specialDeliveryDate);
          return {
            label: "Lieferung",
            value: `per Eigenzustellung am ${date}`,
            mono: false,
            line: `Lieferung per Eigenzustellung am ${date}`,
          };
        })()
      : null;
  const intro = `Ihr Auftrag ${ref} wurde versendet.`;
  const invoice = input.invoiceByLink
    ? `Die Rechnung können Sie in Ihrem Auftrag herunterladen.`
    : `Die Rechnung finden Sie im Anhang dieser E-Mail.`;
  const help = `Bei Fragen antworten Sie auf diese E-Mail und nennen Sie die Auftragsnummer ${ref}.`;
  const reason = `Sie erhalten diese E-Mail als Versandbestätigung, weil Ihr Auftrag bei ${company.brand} versendet wurde.`;
  const subject = `Auftrag ${ref} wurde versendet`;
  const lines = [`Guten Tag,`, ``, intro];
  if (delivery) lines.push(delivery.line);
  lines.push(``, invoice, ``, `Auftrag ansehen: ${input.requestUrl}`, ``, help, ``, footerText(reason));
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Auftrag", value: ref, mono: true },
  ];
  if (delivery) rows.push({ label: delivery.label, value: delivery.value, mono: delivery.mono });
  const html = layout({
    title: subject,
    preheader: input.invoiceByLink
      ? `Auftrag ${ref} wurde versendet. Die Rechnung steht im Auftrag zum Download bereit.`
      : `Auftrag ${ref} wurde versendet. Die Rechnung liegt dieser E-Mail bei.`,
    heading: "Ihr Auftrag wurde versendet",
    reason,
    body: [
      paragraph(`Guten Tag,`),
      paragraph(esc(intro)),
      summaryBox(rows),
      paragraph(esc(invoice)),
      button(input.requestUrl, "Auftrag ansehen"),
      paragraph(esc(help)),
    ].join("\n"),
  });
  return { subject, text: lines.join("\n"), html };
}

/* ------------------------------------------------------------------ */
/* Offene Anfrage (Interessenten ohne Kundenkonto)                     */
/* ------------------------------------------------------------------ */

/** Code zur Bestätigung einer Anfrage; der Link führt zur Seite, auf der man sie vorher ansieht. */
export function inquiryCodeMail(input: { code: string; confirmUrl: string }): MailContent {
  const validity = `Der Code ist ${config.ttl.otpMinutes} Minuten gültig und kann nur einmal verwendet werden.`;
  const check = `Prüfen Sie Ihre Angaben und Dateien, bevor Sie bestätigen: ${input.confirmUrl}`;
  const ignore = `Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ohne den Code geht nichts bei uns ein.`;
  const reason = `Sie erhalten diese E-Mail, weil mit Ihrer E-Mail-Adresse bei ${company.brand} eine Druckanfrage vorbereitet wurde.`;
  const subject = `Ihr Bestätigungscode: ${input.code}`;
  const text = [
    `Ihr Bestätigungscode lautet: ${input.code}`,
    ``,
    `Mit diesem Code bestätigen Sie Ihre Druckanfrage bei ${company.brand}.`,
    validity,
    check,
    ``,
    ignore,
    ``,
    footerText(reason),
  ].join("\n");
  const html = layout({
    title: subject,
    preheader: `Ihr Code: ${input.code}. Gültig für ${config.ttl.otpMinutes} Minuten.`,
    heading: "Bestätigen Sie Ihre Anfrage",
    reason,
    body: [
      paragraph(`Mit diesem Code bestätigen Sie Ihre Druckanfrage.`),
      codeBox(input.code),
      paragraph(esc(validity)),
      paragraph(`Prüfen Sie Ihre Angaben und Dateien, bevor Sie bestätigen:`),
      button(input.confirmUrl, "Anfrage ansehen"),
      paragraph(esc(ignore)),
    ].join("\n"),
  });
  return { subject, text, html };
}

/** Eingangsbestätigung an den Interessenten: Nummer und wie es weitergeht. */
export function inquiryReceivedMail(input: { requestRef: string; product: string; fileCount: number }): MailContent {
  const ref = input.requestRef;
  const next = `Wir sehen uns Ihre Anfrage an und melden uns persönlich bei Ihnen.`;
  const contact = `Fragen? Rufen Sie uns an: ${company.phone}, oder antworten Sie auf ${company.email}. Nennen Sie dabei bitte die Nummer ${ref}.`;
  const reason = `Sie erhalten diese E-Mail, weil Sie bei ${company.brand} eine Druckanfrage bestätigt haben.`;
  const subject = `Ihre Anfrage ${ref} ist eingegangen`;
  const files = input.fileCount === 0 ? "keine" : String(input.fileCount);
  const text = [
    `Vielen Dank, Ihre Anfrage ist bei uns eingegangen.`,
    ``,
    `Nummer: ${ref}`,
    `Produkt: ${input.product}`,
    `Dateien: ${files}`,
    ``,
    next,
    contact,
    ``,
    footerText(reason),
  ].join("\n");
  const html = layout({
    title: subject,
    preheader: `Anfrage ${ref}: Wir melden uns persönlich bei Ihnen.`,
    heading: "Ihre Anfrage ist eingegangen",
    reason,
    body: [
      paragraph(`Vielen Dank. Ihre Anfrage liegt jetzt bei unserer Druckvorstufe.`),
      summaryBox([
        { label: "Nummer", value: ref, mono: true },
        { label: "Produkt", value: input.product },
        { label: "Dateien", value: files },
      ]),
      paragraph(esc(next)),
      paragraph(esc(contact)),
    ].join("\n"),
  });
  return { subject, text, html };
}

/** Hinweis an das Team: ein Interessent wartet auf Rückmeldung. */
export function staffInquiryNotice(input: {
  requestRef: string;
  product: string;
  name: string;
  email: string;
  organisation: string | null;
  phone: string | null;
  staffUrl: string;
}): MailContent {
  const ref = input.requestRef;
  const who = [input.name, input.organisation].filter(Boolean).join(", ");
  const reason = `Interne Benachrichtigung von ${company.brand}: Ein Interessent ohne Kundenkonto hat eine Anfrage bestätigt.`;
  const subject = `Neue Anfrage ${ref} von ${who}`;
  const text = [
    `Neue Anfrage eines Interessenten (E-Mail-Adresse per Code bestätigt).`,
    ``,
    `Nummer: ${ref}`,
    `Produkt: ${input.product}`,
    `Kontakt: ${who}`,
    `E-Mail: ${input.email}`,
    `Telefon: ${input.phone ?? "nicht angegeben"}`,
    ``,
    `Im Backoffice öffnen: ${input.staffUrl}`,
    `Freischalten unter „Kunden & Links“, damit der Interessent Aufträge ansehen und freigeben kann.`,
    ``,
    footerText(reason),
  ].join("\n");
  const html = layout({
    title: subject,
    preheader: `${who} wartet auf Rückmeldung.`,
    heading: "Neue Anfrage eines Interessenten",
    reason,
    body: [
      paragraph(`Die E-Mail-Adresse wurde per Code bestätigt. Ein Kundenkonto gibt es noch nicht.`),
      summaryBox([
        { label: "Nummer", value: ref, mono: true },
        { label: "Produkt", value: input.product },
        { label: "Kontakt", value: who },
        { label: "E-Mail", value: input.email },
        { label: "Telefon", value: input.phone ?? "nicht angegeben" },
      ]),
      button(input.staffUrl, "Im Backoffice öffnen"),
      paragraph(`Freischalten unter „Kunden &amp; Links“, damit der Interessent Aufträge ansehen und freigeben kann.`),
    ].join("\n"),
  });
  return { subject, text, html };
}
