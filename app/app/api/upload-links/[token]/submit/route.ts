import { NextResponse } from "next/server";
import { badRequest, gone, notFound } from "@/lib/api";
import { withTx } from "@/lib/db";
import { appendAudit } from "@/lib/auditLog";
import { clientIp } from "@/lib/guards";
import { consumeLinkTx, resolveLink } from "@/lib/links";
import { analyzeRequest } from "@/lib/analyze/run";
import { generateNote } from "@/lib/assistantNote";
import { appendEventTx } from "@/lib/requests/events";
import { getRequest, listFiles } from "@/lib/requests/store";

/**
 * Door B submit: finalizes hint/text, consumes the one-time link, and moves
 * the draft to RECEIVED (VOUCHED) atomically. The link dies here.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const link = await resolveLink(token);
  if (!link || link.state !== "active") {
    return link ? gone("This upload link can no longer be used.") : notFound("Link not found");
  }
  let body: { draftId?: string; productHint?: string; referenceText?: string | null; freeText?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.draftId) return badRequest("draftId is required");
  if (!body.productHint?.trim()) return badRequest("productHint is required");
  if (!body.freeText?.trim()) return badRequest("freeText is required");
  const draft = await getRequest(body.draftId);
  if (!draft) return notFound("Draft not found");
  if (draft.status !== "DRAFT" || draft.linkId !== link.id) {
    return badRequest("This draft cannot be submitted");
  }
  const files = await listFiles(draft.id);
  if (files.length === 0) return badRequest("Upload at least one file first");
  const request = await withTx(async (client) => {
    await client.query(
      "UPDATE requests SET product_hint = $1, reference_text = $2, free_text = $3 WHERE id = $4",
      [body.productHint!.trim(), body.referenceText?.trim() || null, body.freeText, draft.id],
    );
    await appendEventTx(client, {
      requestId: draft.id,
      event: "link_consumed",
      actorType: "customer",
      actorId: null,
      detail: { via: "staff-link", linkId: link.id },
    });
    await consumeLinkTx(client, link.id, draft.id);
    const res = await client.query("SELECT status, trust FROM requests WHERE id = $1", [draft.id]);
    return res.rows[0];
  });
  await appendAudit({
    action: "link_consumed",
    actorType: "customer",
    requestId: draft.id,
    ip: clientIp(req),
    detail: { linkId: link.id },
  });
  // Deep analysis and the assistant note run after Send so anonymous
  // compute stays cheap; failures never block intake.
  // Die Note läuft auch bei Analysefehlern (arbeitet mit leeren Befunden).
  analyzeRequest(draft.id)
    .catch((err) => console.error("analysis failed", err))
    .finally(() => generateNote(draft.id).catch((err) => console.error("note failed", err)));
  return NextResponse.json(
    { request: { id: draft.id, status: request.status, trust: request.trust } },
    { status: 201 },
  );
}
