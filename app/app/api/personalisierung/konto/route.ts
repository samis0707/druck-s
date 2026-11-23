import { requireCustomer } from "@/lib/guards";
import { persJson } from "@/lib/personalisierung/http";
import { vorlagenFuerKunde } from "@/lib/personalisierung/repo";

/** Vorlagen, die der angemeldete Kunde nutzen darf (zugeordnete und öffentliche), für „Meine Vorlagen“. */
export async function GET(req: Request) {
  const guard = await requireCustomer(req);
  if ("error" in guard) return guard.error;
  const v = await vorlagenFuerKunde(guard.user.id);
  return persJson({ vorlagen: v.map((x) => ({ id: x.id, name: x.name, aktualisiert: x.updatedAt })) });
}
