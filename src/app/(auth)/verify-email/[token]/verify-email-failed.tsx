"use client";

import Link from "next/link";

import { Button } from "@/app/_ui/button";
import { useResendVerification } from "@/app/_shell/hooks/use-resend-verification";
import { t } from "@/lib/i18n";

/**
 * Expired, already used, wrong purpose, or never valid — the API returns one
 * code for all of them, and the next step is the same in each case.
 *
 * Never a dead end: a resend button for someone with a session, and a link to
 * `/login` for someone opening the mail on a device they aren't logged in on,
 * which is a completely ordinary way to arrive here.
 */
export function VerifyEmailFailed() {
  const { state, resend, busy } = useResendVerification();

  return (
    <div className="flex flex-col gap-3" role="status">
      <h2 className="text-base font-medium text-foreground">
        {t("auth.verifyEmail.page.failedTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("auth.verifyEmail.page.failedBody")}</p>

      {state === "unauthenticated" ? (
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t("auth.verifyEmail.page.loginToResend")}
        </Link>
      ) : (
        <Button variant="secondary" onClick={resend} disabled={busy} className="self-start">
          {state === "sending"
            ? t("auth.verifyEmail.prompt.resending")
            : t("auth.verifyEmail.prompt.resend")}
        </Button>
      )}

      {state === "sent" && (
        <p className="text-sm text-foreground">{t("auth.verifyEmail.prompt.sent")}</p>
      )}
      {state === "error" && (
        <p className="text-sm text-destructive">{t("auth.verifyEmail.prompt.error")}</p>
      )}
    </div>
  );
}
