import Link from "next/link";

import { t } from "@/lib/i18n";
import { currentUserId } from "@/server/auth/session";

import { Toaster } from "../_ui/toast";
import { ThemeToggle } from "../_ui/theme-toggle";
import { HeaderAuth } from "./header-auth";

/**
 * Persistent header + content wrapper for every route. Mobile-first.
 *
 * `HeaderAuth` is the only session-aware piece — it swaps the invite entry
 * point (T070) for a "log in" link (T095) depending on `userId`. Everything
 * else renders identically for an owner, a visitor, or nobody logged in.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            {t("common.appName")}
          </Link>
          <div className="flex items-center gap-2">
            <HeaderAuth isLoggedIn={Boolean(userId)} />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
