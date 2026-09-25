import { query } from "../db";
import { appendEvent } from "./events";

export { createBundle, listBundles, type BundleInput } from "./bundles";

/**
 * Staff preview trigger (spec: first authenticated staff preview moves
 * RECEIVED to IN_REVIEW; customer views never do).
 */
export async function recordPreview(input: {
  requestId: string;
  actorType: "staff" | "customer" | "system";
  actorId?: string | null;
}): Promise<void> {
  if (input.actorType !== "staff") return;
  const res = await query<{ status: string }>("SELECT status FROM requests WHERE id = $1", [
    input.requestId,
  ]);
  if (res.rows[0]?.status !== "RECEIVED") return;
  await appendEvent({
    requestId: input.requestId,
    event: "previewed",
    actorType: "staff",
    actorId: input.actorId ?? null,
  });
}
