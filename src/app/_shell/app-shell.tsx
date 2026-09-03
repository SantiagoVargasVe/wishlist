import Link from "next/link";

import { t } from "@/lib/i18n";
import { currentSession } from "@/server/auth/session";

import { Toaster } from "../_ui/toast";
import { ThemeToggle } from "../_ui/theme-toggle";
import { HeaderAuth } from "./header-auth";
import { VerifyEmailPrompt } from "./verify-email-prompt";

/**
 * Persistent header + content wrapper for every route. Mobile-first.
 *
 * `HeaderAuth` swaps the invite entry point (T070) for a "log in" link (T095).
 * `VerifyEmailPrompt` appears for a logged-in user whose address is unverified
 * (T109) — a prompt in the normal flow, never an overlay or a gate. Everything
 * else renders identically for an owner, a visitor, or nobody logged in.
 *
 * Verification state rides along on the session read rather than costing a
 * second query; see `currentSession`.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await currentSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            {t("common.appName")}
          </Link>
          <div className="flex items-center gap-2">
            <HeaderAuth isLoggedIn={Boolean(session)} />
            <ThemeToggle />
          </div>
        </div>
      </header>
      {session && !session.emailVerified && <VerifyEmailPrompt />}
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
