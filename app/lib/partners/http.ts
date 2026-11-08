/** Antworten der Partner-Routen: `{ request }` bzw. `{ error, code, details? }` (siehe docs/partner-api.md). */
import { NextResponse } from "next/server";
import type { PartnerRequestView } from "./intake";

export function partnerError(status: number, code: string, message: string, details?: string[]) {
  return NextResponse.json(details ? { error: message, code, details } : { error: message, code }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function partnerOk(request: PartnerRequestView, status = 200) {
  return NextResponse.json({ request }, { status, headers: { "cache-control": "no-store" } });
}

/** Partner-Referenz aus dem Pfad (URL-dekodiert von Next) grob prüfen. */
export function validRef(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(ref);
}
