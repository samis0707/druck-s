import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
