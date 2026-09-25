import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api";
import { requireStaff } from "@/lib/guards";
import { getIdentity } from "@/lib/identities";
import { latestHistoryImport } from "@/lib/historyImport";

const VORSCHAU_ZEILEN = 60;

/** Staff liest den abgeleiteten Dump-Inhalt (Markdown) eines Kunden — XML roh bleibt außen vor. */
export async function GET(req: Request) {
  const guard = await requireStaff(req);
  if ("error" in guard) return guard.error;
  const identityId = new URL(req.url).searchParams.get("identityId");
  const voll = new URL(req.url).searchParams.get("full") === "1";
  if (!identityId) return badRequest("identityId is required");
  const identity = await getIdentity(identityId);
  if (!identity) return notFound("Identity not found");
  const bundle = await latestHistoryImport(identityId);
  if (!bundle) return NextResponse.json({ import: null });
  const zeilen = bundle.md.split("\n");
  const gekuerzt = !voll && zeilen.length > VORSCHAU_ZEILEN;
  return NextResponse.json({
    import: {
      id: bundle.id,
      importedAt: bundle.importedAt,
      orderCount: bundle.orderCount,
    },
    md: gekuerzt ? zeilen.slice(0, VORSCHAU_ZEILEN).join("\n") : bundle.md,
    truncated: gekuerzt,
    totalLines: zeilen.length,
  });
}
