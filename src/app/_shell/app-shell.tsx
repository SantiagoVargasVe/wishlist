import Link from "next/link";

import { t } from "@/lib/i18n";
import { currentUserId } from "@/server/auth/session";

import { Toaster } from "../_ui/toast";
import { ThemeToggle } from "../_ui/theme-toggle";
import { InviteButton } from "./invite-button";

/**
 * Persistent header + content wrapper for every route. Mobile-first.
 *
 * The invite entry point (T070) is the first session-aware piece of this
 * shell — everything else here works identically for an owner, a visitor,
 * or nobody logged in at all.
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
            {userId && <InviteButton />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
