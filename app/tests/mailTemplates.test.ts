import { describe, expect, it } from "vitest";
import {
  approvalReceiptMail,
  approvalRequestMail,
  otpMail,
  shippedMail,
  staffApprovalNotice,
} from "@/lib/mailTemplates";
import { company } from "@/lib/company";
import { config } from "@/lib/config";

const REF = "250926-003";

function allMails() {
  return [
    otpMail("123456", "approve"),
    otpMail("654321", "login"),
    otpMail("111222", "verify"),
    approvalRequestMail({ requestRef: REF, version: 1, approveUrl: "http://x/requests/1" }),
    approvalRequestMail({
      requestRef: REF,
      version: 2,
      reason: "Papier geändert",
      resent: true,
      approveUrl: "http://x/requests/1",
    }),
    approvalReceiptMail({
      requestRef: REF,
      version: 2,
      approvedAt: "2026-09-25T12:03:00.000Z",
      approver: "a@example.com",
    }),
    staffApprovalNotice({ requestRef: REF, version: 2, approver: "a@example.com", ip: "1.2.3.4" }),
    shippedMail({ requestRef: REF, trackingNumber: "JJD0001", requestUrl: "http://x/requests/1" }),
    shippedMail({ requestRef: REF, specialDeliveryDate: "2026-09-28", requestUrl: "http://x/requests/1" }),
  ];
}

/** 8.1: jede Vorlage rendert mit korrekter Nummer und Version (reiner Unit-Test). */
describe("mail templates", () => {
  it("otp mail: Code, Zweck und Gültigkeit auf Deutsch", () => {
    const mail = otpMail("123456", "approve");
    expect(mail.subject).toBe("Ihr Bestätigungscode: 123456");
    expect(mail.text).toContain("Ihren Auftrag freizugeben");
    expect(mail.text).toContain(`${config.ttl.otpMinutes} Minuten gültig`);
    expect(mail.text.match(/(\d{6})/)![1]).toBe("123456");
    expect(mail.html).toContain("123456");
    expect(mail.html).toContain(`Gültig für ${config.ttl.otpMinutes} Minuten`);
    expect(mail.html).toMatch(/font-family:ui-monospace/);
  });

  it("otp mail: Zweck login und verify", () => {
    expect(otpMail("123456", "login").text).toContain("sich im Druckportal anzumelden");
    expect(otpMail("123456", "verify").text).toContain("Ihre Identität zu bestätigen");
  });

  it("approval request mail: Nummer, Version, Grund, Link", () => {
    const mail = approvalRequestMail({
      requestRef: REF,
      version: 2,
      reason: "Papier geändert",
      resent: true,
      approveUrl: "http://x/requests/1",
    });
    expect(mail.subject).toMatch(/Geänderte Auftragsbestätigung \(Version 2\).*Auftrag 250926-003/);
    expect(mail.text).toContain("Auftrag 250926-003");
    expect(mail.text).toContain("Papier geändert");
    expect(mail.text).toContain("http://x/requests/1");
    expect(mail.html).toContain(REF);
    expect(mail.html).toContain('href="http://x/requests/1"');
    expect(mail.html).toContain("Papier geändert");
    expect(mail.html).toContain("Prüfen und freigeben");
  });

  it("approval request mail: Erstversand ohne Änderungsgrund", () => {
    const mail = approvalRequestMail({
      requestRef: REF,
      version: 1,
      approveUrl: "http://x/requests/1",
    });
    expect(mail.subject).toBe("Auftragsbestätigung zur Freigabe – Auftrag 250926-003");
    expect(mail.text).not.toContain("Grund der Änderung");
    expect(mail.html).not.toContain("Grund der Änderung");
    expect(mail.text).toContain("Anhang");
  });

  it("receipt und staff notice: Version, Freigeber, Zeitpunkt", () => {
    const receipt = approvalReceiptMail({
      requestRef: REF,
      version: 2,
      approvedAt: "2026-09-25T12:03:00.000Z",
      approver: "a@example.com",
    });
    expect(receipt.subject).toBe("Auftrag 250926-003 freigegeben");
    expect(receipt.text).toContain("Version 2");
    expect(receipt.text).toContain("a@example.com");
    expect(receipt.text).toContain("25.09.2026, 14:03 Uhr");
    expect(receipt.html).toContain("25.09.2026, 14:03 Uhr");
    const notice = staffApprovalNotice({
      requestRef: REF,
      version: 2,
      approver: "a@example.com",
      ip: "1.2.3.4",
    });
    expect(notice.subject).toBe("Freigabe erteilt: Auftrag 250926-003 (Version 2)");
    expect(notice.text).toContain("1.2.3.4");
    expect(notice.html).toContain("1.2.3.4");
  });

  it("receipt: nicht lesbares Datum bleibt unverändert", () => {
    const receipt = approvalReceiptMail({
      requestRef: REF,
      version: 1,
      approvedAt: "gestern",
      approver: "a@example.com",
    });
    expect(receipt.text).toContain("am gestern");
  });

  it("shipped mail: Nummer, Sendungsnummer, Rechnungshinweis, Link", () => {
    const mail = shippedMail({
      requestRef: REF,
      trackingNumber: "JJD0001",
      requestUrl: "http://x/requests/1",
    });
    expect(mail.subject).toBe("Auftrag 250926-003 wurde versendet");
    expect(mail.text).toContain("Auftrag 250926-003");
    expect(mail.text).toContain("Sendungsnummer: JJD0001");
    expect(mail.text).toContain("Rechnung");
    expect(mail.text).toContain("Anhang");
    expect(mail.text).toContain("http://x/requests/1");
    expect(mail.html).toContain(REF);
    expect(mail.html).toContain("JJD0001");
    expect(mail.html).toContain('href="http://x/requests/1"');
    expect(mail.html).toContain("Auftrag ansehen");
    expect(mail.html).not.toContain("Eigenzustellung");
  });

  it("shipped mail: Eigenzustellung mit Datum TT.MM.JJJJ", () => {
    const mail = shippedMail({
      requestRef: REF,
      specialDeliveryDate: "2026-09-28",
      requestUrl: "http://x/requests/1",
    });
    expect(mail.text).toContain("Lieferung per Eigenzustellung am 28.09.2026");
    expect(mail.html).toContain("per Eigenzustellung am 28.09.2026");
    expect(mail.text).not.toContain("Sendungsnummer");
    const iso = shippedMail({
      requestRef: REF,
      specialDeliveryDate: "2026-12-31T23:30:00.000Z",
      requestUrl: "http://x/requests/1",
    });
    expect(iso.text).toContain("am 31.12.2026");
  });

  it("jede Mail zeigt das Logo als Bild mit Fallback-Attributen", () => {
    const base = config.appBaseUrl.replace(/\/+$/, "");
    for (const mail of allMails()) {
      const img = mail.html.match(/<img [^>]*>/)?.[0] ?? "";
      expect(img).toContain(`src="${base}/digitale-medien-logo.png"`);
      expect(img).toContain('width="40"');
      expect(img).toContain('height="40"');
      expect(img).toContain('alt="dmp druckraum"');
      expect(img).toContain("display:block");
      expect(img).toContain("border:0");
      expect(mail.html).not.toContain("&#8853;");
    }
  });

  it("jede Mail enthält Firmen-Footer und Rechtslinks in Text und HTML", () => {
    const base = config.appBaseUrl.replace(/\/+$/, "");
    for (const mail of allMails()) {
      for (const part of [mail.text, mail.html]) {
        expect(part).toContain(company.name);
        expect(part).toContain(company.street);
        expect(part).toContain(company.phone);
        expect(part).toContain(company.email);
        expect(part).toContain(company.managingDirector);
        expect(part).toContain(company.vatId);
        for (const path of ["/impressum", "/agb", "/datenschutz"]) {
          expect(part).toContain(`${base}${path}`);
        }
      }
      expect(mail.html).toContain('lang="de"');
      expect(mail.html).toContain('name="color-scheme"');
      expect(mail.html).toContain("dmp");
      expect(mail.html).toContain("druckraum");
    }
  });

  it("kein undefined/null/NaN in irgendeiner Fassung", () => {
    for (const mail of allMails()) {
      for (const part of [mail.subject, mail.text, mail.html]) {
        expect(part).not.toMatch(/undefined|\bnull\b|NaN|\[object/);
      }
    }
  });

  it("HTML maskiert dynamische Werte", () => {
    const evil = `<script>alert("x")</script>&'`;
    const mails = [
      approvalRequestMail({
        requestRef: evil,
        version: 1,
        reason: evil,
        approveUrl: `http://x/?a=1&b="2"`,
      }),
      approvalReceiptMail({ requestRef: evil, version: 1, approvedAt: evil, approver: evil }),
      staffApprovalNotice({ requestRef: evil, version: 1, approver: evil, ip: evil }),
      shippedMail({ requestRef: evil, trackingNumber: evil, requestUrl: `http://x/?a=1&b="2"` }),
      shippedMail({ requestRef: evil, specialDeliveryDate: evil, requestUrl: evil }),
    ];
    for (const mail of mails) {
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    }
    expect(mails[0].html).toContain("http://x/?a=1&amp;b=&quot;2&quot;");
    expect(mails[0].html).not.toContain(`href="http://x/?a=1&b=`);
  });

  it("Textfassung ist deutsch und ohne HTML-Tags", () => {
    for (const mail of allMails()) {
      expect(mail.text).not.toMatch(/<[a-z/][^>]*>/i);
      expect(mail.text).not.toMatch(/\b(Request|approved|Your|verification)\b/);
    }
  });
});
