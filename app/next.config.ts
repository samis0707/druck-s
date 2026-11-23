import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Gebaute kalpri-Werkbank (vendor/kalpri-werkbank) wird zur Laufzeit gelesen: in das Standalone-Paket aufnehmen.
  outputFileTracingIncludes: {
    "/staff/kalkulation/werkbank/[[...pfad]]": ["./vendor/kalpri-werkbank/**/*"],
  },
  // Markdown-Fassungen der Hilfe für KI-Assistenten: /hilfe.md, /hilfe/<kurs>.md, /hilfe/<kurs>/<lektion>.md
  async rewrites() {
    return [
      { source: "/hilfe.md", destination: "/hilfe-md" },
      { source: "/hilfe/:kurs.md", destination: "/hilfe-md/:kurs" },
      { source: "/hilfe/:kurs/:lektion.md", destination: "/hilfe-md/:kurs/:lektion" },
    ];
  },
};

export default nextConfig;
