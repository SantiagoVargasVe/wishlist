import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

import { t } from "@/lib/i18n";
import { config } from "@/server/config";

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
  // Required for `opengraph-image.tsx` (T058) to resolve into an absolute
  // URL a crawler can fetch — without it Next warns and guesses `localhost`.
  metadataBase: new URL(config.APP_URL),
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
