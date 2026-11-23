/** Team-Hinweis für Personalisierungen, die ohne Code-Bestätigung eingehen (Kunde mit Konto, Mitarbeiter für Kunden). */
import { config } from "../config";
import { query } from "../db";
import { sendMail } from "../mail";
import { staffInquiryNotice } from "../mailTemplates";
import { requestRef } from "../requestNumber";
import type { PrintRequest } from "../requests/types";
import { productLabel } from "../ui-text";
import type { VorlageDetail } from "./repo";

export async function notifyDirekt(request: PrintRequest, detail: VorlageDetail, anzahl: number, durchMitarbeiter: boolean): Promise<void> {
  try {
    const u = request.customerId ? await query<{ email: string; name: string | null; firm: string | null }>(`SELECT email, name, firm FROM "user" WHERE id = $1`, [request.customerId]) : null;
    const k = u?.rows[0];
    const notice = staffInquiryNotice({
      requestRef: requestRef(request),
      product: productLabel(request.productHint),
      name: k?.name ?? k?.email ?? "Kunde",
      email: k?.email ?? "",
      organisation: k?.firm ?? null,
      phone: null,
      kunde: true,
      staffUrl: `${config.appBaseUrl.replace(/\/+$/, "")}/staff/requests/${request.id}`,
      hinweis: `Personalisierung (Vorlage „${detail.vorlage.name}“, ${anzahl} Datensätze${durchMitarbeiter ? ", von Mitarbeiter im Namen des Kunden angelegt" : ""})`,
    });
    await sendMail({ to: config.firmInbox, subject: notice.subject, text: notice.text, html: notice.html });
  } catch (err) {
    console.error("[personalisierung] Team-Hinweis fehlgeschlagen:", err instanceof Error ? err.name : "Fehler");
  }
}
