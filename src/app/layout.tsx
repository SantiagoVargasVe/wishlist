import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// Only Geist is loaded. --font-serif and --font-mono are declared in the theme
// but deliberately not fetched — nothing uses them, and each family is a round
// trip before text paints. Most traffic is mobile, from a shared link.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Guarda lo que quieres y compártelo con quien quieras.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={geistSans.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
