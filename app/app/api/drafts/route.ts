import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api";
import { createDraft } from "@/lib/requests/store";

/** Door A: start an anonymous draft. Verification happens after Send. */
export async function POST(req: Request) {
  let body: { productHint?: string; referenceText?: string | null; freeText?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.productHint?.trim()) return badRequest("productHint is required");
  if (!body.freeText?.trim()) return badRequest("freeText is required");
  const draft = await createDraft({
    productHint: body.productHint.trim(),
    referenceText: body.referenceText?.trim() || null,
    freeText: body.freeText,
    origin: "door_a",
    trust: "VOUCHED",
  });
  return NextResponse.json({ draftId: draft.id }, { status: 201 });
}
