import Link from "next/link";

import { t } from "@/lib/i18n";

/**
 * What replaces the form once a request goes through — and, deliberately, the
 * only thing on the page afterwards. Leaving the form mounted would invite a
 * second submit that spends another of the three requests this address gets in
 * an hour, and would do nothing the first one didn't.
 */
export function RequestSent() {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="text-sm text-foreground">{t("auth.forgotPassword.sent")}</p>
      <p className="text-sm text-muted-foreground">{t("auth.forgotPassword.sentHint")}</p>
      <Link
        href="/login"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("auth.forgotPassword.backToLogin")}
      </Link>
    </div>
  );
}
