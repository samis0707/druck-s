import { company } from "@/lib/company";

export const dynamic = "force-dynamic";

/**
 * Swagger-Oberfläche zum Lesen und Ausprobieren der Schnittstellen. Die Dateien liegen lokal
 * unter /swagger (scripts/copy-static-assets.mjs kopiert sie aus swagger-ui-dist), es wird nichts
 * von fremden Servern geladen; der Online-Validator von Swagger ist abgeschaltet.
 */
export function GET() {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Schnittstellen – ${company.brand}</title>
<link rel="icon" href="/icon.png">
<link rel="stylesheet" href="/swagger/swagger-ui.css">
<style>body{margin:0;background:#fff}.topbar{display:none}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="/swagger/swagger-ui-bundle.js"></script>
<script>
window.ui = SwaggerUIBundle({
  url: "/api/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  docExpansion: "list",
  defaultModelsExpandDepth: 0,
  tryItOutEnabled: true,
  validatorUrl: null,
});
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
