import Link from "next/link";

import { t } from "@/lib/i18n";

import { InviteButton } from "./invite-button";

/**
 * The session-aware corner of the header. A logged-in user gets the invite
 * entry point (T070). An anonymous visitor — who may have landed cold on a
 * shared list with no idea the site has accounts — gets a way in (T095).
 *
 * One "Iniciar sesión" link is enough: `/login` links onward to `/register`.
 */
export function HeaderAuth({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (isLoggedIn) return <InviteButton />;

  return (
    <Link
      href="/login"
      className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
    >
      {t("nav.login")}
    </Link>
  );
}
