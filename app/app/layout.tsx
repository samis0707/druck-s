import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Statistik } from "@/components/analytics/Statistik";
import { THEME_INIT_SCRIPT } from "@/components/brand/ThemeToggle";
import "./globals.css";

/* Schriften aus dem Design System „digitale medien“, selbst gehostet (SIL OFL, siehe fonts/OFL.txt). */
const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-text",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-face",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "http://localhost:3000"),
  title: { default: "dmp druckraum", template: "%s · dmp druckraum" },
  description: "Druckdaten hochladen, automatisch vorprüfen lassen und freigeben — dmp druckraum von digitale medien print.",
  applicationName: "dmp druckraum",
  authors: [{ name: "digitale medien print gmbh", url: "https://www.digitalemedien.de" }],
  publisher: "digitale medien print gmbh",
  openGraph: { siteName: "dmp druckraum", locale: "de_DE", type: "website" },
  formatDetection: { telephone: false },
  // Maschinenlesbare Hilfe für KI-Assistenten (llms.txt-Konvention).
  alternates: { types: { "text/plain": [{ url: "/llms.txt", title: "llms.txt" }] } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${plusJakarta.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </TooltipProvider>
        <Toaster />
        <Statistik />
      </body>
    </html>
  );
}
