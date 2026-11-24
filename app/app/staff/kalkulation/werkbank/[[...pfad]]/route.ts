import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/guards";
import { CSP_WERKBANK, HSTS, PERMISSIONS_POLICY } from "@/lib/sicherheitsHeader";

/**
 * Liefert die gebaute kalpri-Werkbank (vendor/kalpri-werkbank, siehe scripts/kalpri-sync.mjs)
 * NUR an eingeloggte Mitarbeiter aus. Die Werkbank synchronisiert gegen /api/staff/kalkulation
 * mit demselben Sitzungs-Cookie (gleicher Ursprung, kein API-Schlüssel im Browser).
 */
const ROOT = path.join(process.cwd(), "vendor", "kalpri-werkbank");

const TYPEN: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const CSP = CSP_WERKBANK;

export async function GET(req: Request, ctx: { params: Promise<{ pfad?: string[] }> }) {
  const guard = await requireStaff(req);
  if (!("user" in guard) || !guard.user) {
    if ((req.headers.get("accept") ?? "").includes("text/html")) {
      return NextResponse.redirect(new URL("/staff/login", req.url), 307);
    }
    return guard.error ?? NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { pfad = [] } = await ctx.params;
  let teile: string[];
  try {
    teile = pfad.map((t) => decodeURIComponent(t));
  } catch {
    return new NextResponse("Nicht gefunden", { status: 404 }); // ungültige %-Kodierung
  }
  if (teile.some((t) => t === "" || t === "." || t === ".." || /[\\/\0]/.test(t))) {
    return new NextResponse("Nicht gefunden", { status: 404 });
  }
  const rel = teile.length === 0 || !path.extname(teile[teile.length - 1]) ? "index.html" : teile.join("/");
  const datei = path.join(ROOT, rel);
  const typ = TYPEN[path.extname(datei).toLowerCase()];
  if (!datei.startsWith(ROOT + path.sep) || !typ) return new NextResponse("Nicht gefunden", { status: 404 });
  try {
    const inhalt = await readFile(datei);
    return new NextResponse(new Uint8Array(inhalt), {
      headers: {
        "content-type": typ,
        // personenbezogen ist nichts darin, aber nur für Mitarbeiter: nie in gemeinsamen Zwischenspeichern
        "cache-control": "private, no-cache",
        "content-security-policy": CSP,
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "same-origin",
        "strict-transport-security": HSTS,
        "permissions-policy": PERMISSIONS_POLICY,
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Nicht gefunden", { status: 404 });
  }
}
