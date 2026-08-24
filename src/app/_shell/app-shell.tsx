import Link from "next/link";

import { t } from "@/lib/i18n";

import { ThemeToggle } from "../_ui/theme-toggle";

/**
 * Persistent header + content wrapper for every route. Mobile-first: the
 * header holds only branding and the theme toggle for now — session-aware
 * nav (logout, share CTA) lands with the pages that have a session to read
 * (T014, T051, T052), not here.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            {t("common.appName")}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
