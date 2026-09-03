import Link from "next/link";

import { t } from "@/lib/i18n";

/**
 * Every way a token can fail lands here: expired, already used, or never valid.
 * The API returns one code for all of them, and the user's next step is the
 * same in each case — so this is a route onward, never a dead end or a raw
 * error string.
 */
export function ExpiredLink() {
  return (
    <div className="flex flex-col gap-3" role="status">
      <h2 className="text-base font-medium text-foreground">
        {t("auth.resetPassword.invalidTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("auth.resetPassword.invalidBody")}</p>
      <Link
        href="/forgot-password"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("auth.resetPassword.invalidCta")}
      </Link>
    </div>
  );
}
