import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

import { t } from "@/lib/i18n";

import { AppShell } from "./_shell/app-shell";
import { ThemeScript } from "./_ui/theme-script";
import { Providers } from "./providers";

// Only Geist is loaded. --font-serif and --font-mono are declared in the theme
// but deliberately not fetched — nothing uses them, and each family is a round
// trip before text paints. Most traffic is mobile, from a shared link.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: t("common.appName"),
  description: t("common.tagline"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={geistSans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
