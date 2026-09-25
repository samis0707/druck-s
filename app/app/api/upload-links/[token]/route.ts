import { NextResponse } from "next/server";
import { gone, notFound } from "@/lib/api";
import { config } from "@/lib/config";
import { resolveLink } from "@/lib/links";
import { getIdentity } from "@/lib/identities";

/** Resolve a staff upload link: active links describe themselves, dead links guide onwards. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const link = await resolveLink(token);
  if (!link) return notFound("This upload link does not exist");
  if (link.state !== "active") {
    const messages = {
      consumed: "This upload link was already used for a request.",
      expired: "This upload link has expired.",
      revoked: "This upload link was withdrawn by the print firm.",
      active: "",
    } as const;
    return gone(
      `${messages[link.state]} Ask the firm for a new link or upload via the general page with your email login.`,
    );
  }
  const identity = await getIdentity(link.identityId);
  return NextResponse.json({
    state: "active",
    email: identity?.email ?? null,
    expiresAt: link.expiresAt,
    appBaseUrl: config.appBaseUrl,
  });
}
