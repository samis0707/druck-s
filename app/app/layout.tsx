import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Plausible } from "@/components/analytics/Plausible";
import { THEME_INIT_SCRIPT } from "@/components/brand/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        <Plausible />
      </body>
    </html>
  );
}
