/** Deutsche Meldungen zu den Fehlercodes der Anfrage-Schnittstelle (für die eigenen Seiten). */
const MELDUNGEN: Record<string, string> = {
  invalid_body: "Bitte prüfen Sie Ihre Angaben.",
  contact_required: "Bitte geben Sie Ihren Namen und Ihre E-Mail-Adresse an.",
  code_required: "Bitte fordern Sie zuerst einen Code an.",
  invalid_code: "Der Code stimmt nicht. Bitte prüfen Sie die sechs Ziffern aus der E-Mail.",
  code_expired: "Der Code ist nicht mehr gültig. Bitte fordern Sie einen neuen an.",
  already_confirmed: "Diese Anfrage ist bereits bestätigt.",
  account_disabled: "Diese E-Mail-Adresse ist bei uns gesperrt. Bitte rufen Sie uns an.",
  staff_account: "Mit einer Team-Adresse bitte das Backoffice nutzen.",
  not_found: "Diese Anfrage gibt es nicht mehr. Entwürfe verfallen nach kurzer Zeit.",
  too_many_files: "Zu viele Dateien: höchstens 20 je Anfrage.",
  empty_file: "Eine der Dateien ist leer.",
  file_too_large: "Eine der Dateien überschreitet 100 MB.",
  rate_limited: "Zu viele Versuche. Bitte warten Sie eine Stunde oder rufen Sie uns an.",
  mail_failed: "Die E-Mail konnte gerade nicht verschickt werden. Bitte versuchen Sie es gleich noch einmal.",
};

export function inquiryMessage(code: string | undefined, fallback: string): string {
  return (code && MELDUNGEN[code]) || fallback;
}
