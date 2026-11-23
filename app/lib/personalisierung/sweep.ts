/** Abgelaufene Gast-Entwürfe löschen; wird von sweepExpiredDrafts und vom Hintergrund-Takt aufgerufen. */
import { sweepAbgelaufeneEntwuerfe } from "./repo";

export async function sweepPersonalisierung(): Promise<number> {
  try {
    return await sweepAbgelaufeneEntwuerfe();
  } catch (err) {
    console.error("[personalisierung] Sweep fehlgeschlagen:", err instanceof Error ? err.message : err);
    return 0;
  }
}
