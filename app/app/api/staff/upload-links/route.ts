import { NextResponse } from "next/server";
import { badRequest, forbidden } from "@/lib/api";
import { config } from "@/lib/config";
import { clientIp, requireStaff } from "@/lib/guards";
import { appendAudit } from "@/lib/auditLog";
import { createProspect, findIdentityByEmail } from "@/lib/identities";
import { createUploadLink } from "@/lib/links";

/**
 * Staff creates a one-time upload link for an email. New emails become
 * prospects on the same record that later matures to a customer.
 */
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const staffId = guard.user.id;
  let body: { email?: string; displayName?: string; firm?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest("A valid email is required");
  }
  let identity = await findIdentityByEmail(email);
  let prospect = false;
  if (!identity) {
    identity = await createProspect({
      email,
      displayName: body.displayName?.trim() || null,
      firm: body.firm?.trim() || null,
      callerHeaders: req.headers,
    });
    prospect = true;
  }
  if (identity.status === "disabled") return forbidden("This account is disabled");
  const { link, token } = await createUploadLink({ identityId: identity.id, createdBy: staffId });
  await appendAudit({
    action: "link_created",
    actorType: "staff",
    actorId: staffId,
    ip: clientIp(req),
    detail: { linkId: link.id, email: identity.email, prospect },
  });
  return NextResponse.json(
    {
      url: `${config.appBaseUrl}/u/${token}`,
      expiresAt: link.expiresAt,
      email: identity.email,
      prospect,
    },
    { status: 201 },
  );
}
